import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { lookupEcosystemTelegramId } from '../ecosystem.js';

// ─────────────────────────────────────────────────────────────────────────────
// Creator OS Telegram bot — its OWN bot (separate token/webhook from the
// ecosystem's Life OS bot). Two jobs:
//   1. Capture: a linked user's messages become ideas in the `ideas` table.
//   2. Briefing: a cron pushes the morning briefing to linked users.
//
// Linking: the user clicks "Connect Telegram" in Settings → POST /connect (authed
// by their Supabase JWT). We first try to REUSE an existing Telegram id from the
// ecosystem (by email); if found, the link completes instantly. Otherwise we hand
// back a one-time code the user sends as `/link <code>` to the bot.
//
// All bot-side writes use the service-role client (bypasses RLS) and set owner_id
// explicitly, since the bot has no auth.uid().
// ─────────────────────────────────────────────────────────────────────────────

export const telegramRouter = Router();

const BOT_TOKEN = () => process.env.TELEGRAM_BOT_TOKEN;
const WEBHOOK_SECRET = () => process.env.TELEGRAM_WEBHOOK_SECRET;
// Vercel Cron auto-sends `Authorization: Bearer $CRON_SECRET`; also allow a
// dedicated TELEGRAM_CRON_SECRET via header/query for manual triggers.
const CRON_SECRET = () => process.env.CRON_SECRET || process.env.TELEGRAM_CRON_SECRET;
const WORKSPACE = 'main-space'; // matches getActiveWorkspaceId() default in the web app

const CODE_TTL_MS = 15 * 60 * 1000;

// ─── Telegram API helper ─────────────────────────────────────────────────────
async function tgSend(chatId: number | string, text: string): Promise<void> {
  const token = BOT_TOKEN();
  if (!token) { console.warn('[telegram] TELEGRAM_BOT_TOKEN unset — cannot send'); return; }
  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true }),
    });
  } catch (err) {
    console.error('[telegram] sendMessage failed:', (err as Error).message);
  }
}

function newCode(): string {
  // Short, unambiguous, uppercase code (no 0/O/1/I).
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, b => alphabet[b % alphabet.length]).join('');
}

/** Resolve the Supabase user from a Bearer token. Returns { id, email } or null. */
async function authUser(req: Request): Promise<{ id: string; email?: string } | null> {
  const header = req.headers.authorization;
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? undefined };
}

// ─── Idea capture ─────────────────────────────────────────────────────────────
async function captureIdea(ownerId: string, title: string): Promise<void> {
  const now = new Date().toISOString();
  const id = `idea-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await supabaseAdmin.from('ideas').insert({
    id, workspace_id: WORKSPACE, owner_id: ownerId,
    title: title.slice(0, 500), status: 'Idea', rating: 0, archived: false,
    created_at: now, updated_at: now,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Webhook — Telegram delivers updates here.
// ─────────────────────────────────────────────────────────────────────────────
telegramRouter.post('/webhook', async (req: Request, res: Response) => {
  // Telegram echoes the secret configured via setWebhook in this header.
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!WEBHOOK_SECRET() || secret !== WEBHOOK_SECRET()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // On Vercel serverless the function is frozen once the response is sent, so we
  // must finish all DB work + replies BEFORE responding — never ack-then-process.
  try {
    await processUpdate(req.body);
  } catch (err) {
    console.error('[telegram] webhook processing error:', (err as Error).message);
  }
  return res.status(200).json({ ok: true });
});

async function processUpdate(update: any): Promise<void> {
  const msg = update?.message ?? update?.edited_message;
  const text: string | undefined = msg?.text;
  const chatId: number | undefined = msg?.chat?.id;
  const fromId: number | undefined = msg?.from?.id;
  const username: string | undefined = msg?.from?.username;
  if (!text || chatId === undefined || fromId === undefined) return;

  const trimmed = text.trim();
  try {
    if (trimmed === '/start') {
      await tgSend(chatId, 'Willkommen bei *Pronoia Creator OS* 🎬\n\nVerbinde dein Konto in den App-Einstellungen → *Connect Telegram*. Danach wird jede Nachricht hier zu einer Idee in deiner Ideation-Bank.');
      return;
    }

    if (trimmed.toLowerCase().startsWith('/link')) {
      const code = trimmed.split(/\s+/)[1]?.toUpperCase();
      if (!code) { await tgSend(chatId, 'Nutzung: `/link DEIN-CODE` (Code aus den App-Einstellungen).'); return; }
      await handleLinkCode(code, { chatId, fromId, username });
      return;
    }

    // Any other text → capture as an idea for the linked user.
    const { data: link } = await supabaseAdmin
      .from('telegram_links').select('owner_id, linked_at')
      .eq('telegram_user_id', fromId).maybeSingle();

    if (!link?.linked_at) {
      await tgSend(chatId, 'Noch nicht verbunden. Öffne die App → *Einstellungen* → *Connect Telegram* und sende mir `/link DEIN-CODE`.');
      return;
    }

    await captureIdea(link.owner_id, trimmed);
    await tgSend(chatId, `💡 Idee gespeichert: _${trimmed.slice(0, 80)}_`);
  } catch (err) {
    console.error('[telegram] processUpdate error:', (err as Error).message);
    await tgSend(chatId, 'Kurzer Fehler beim Speichern — bitte nochmal versuchen.');
  }
}

async function handleLinkCode(code: string, tg: { chatId: number; fromId: number; username?: string }): Promise<void> {
  const { data: pending } = await supabaseAdmin
    .from('telegram_links').select('owner_id, code_expires_at')
    .eq('link_code', code).maybeSingle();

  if (!pending) { await tgSend(tg.chatId, 'Code ungültig. Erzeuge in den App-Einstellungen einen neuen.'); return; }
  if (pending.code_expires_at && new Date(pending.code_expires_at).getTime() < Date.now()) {
    await tgSend(tg.chatId, 'Code abgelaufen. Erzeuge in den App-Einstellungen einen neuen.'); return;
  }

  const { error } = await supabaseAdmin.from('telegram_links').update({
    telegram_user_id: tg.fromId, telegram_chat_id: tg.chatId, telegram_username: tg.username ?? null,
    link_code: null, code_expires_at: null, linked_at: new Date().toISOString(),
    source: 'creator_link', updated_at: new Date().toISOString(),
  }).eq('owner_id', pending.owner_id);

  if (error) { await tgSend(tg.chatId, 'Verknüpfung fehlgeschlagen — bitte erneut versuchen.'); return; }
  await tgSend(tg.chatId, '✅ Verbunden! Sende mir jetzt jederzeit eine Idee und ich lege sie in deiner Ideation-Bank ab.');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Connect — the app asks for a link code (or reuses the ecosystem id).
// ─────────────────────────────────────────────────────────────────────────────
telegramRouter.post('/connect', async (req: Request, res: Response) => {
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Try ecosystem reuse first: if this email already has a Telegram id, link now.
  if (user.email) {
    const eco = await lookupEcosystemTelegramId(user.email);
    if (eco) {
      const now = new Date().toISOString();
      const { error } = await supabaseAdmin.from('telegram_links').upsert({
        owner_id: user.id, telegram_user_id: eco.telegramUserId,
        telegram_chat_id: eco.telegramUserId, // DM chat id == user id for private chats
        telegram_username: eco.telegramUsername ?? null,
        link_code: null, code_expires_at: null, linked_at: now,
        source: 'ecosystem_reuse', updated_at: now,
      }, { onConflict: 'owner_id' });
      if (!error) return res.json({ linked: true, source: 'ecosystem_reuse', username: eco.telegramUsername ?? null });
      console.warn('[telegram] ecosystem reuse upsert failed:', error.message);
    }
  }

  // Otherwise hand back a fresh one-time code.
  const code = newCode();
  const expires = new Date(Date.now() + CODE_TTL_MS).toISOString();
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin.from('telegram_links').upsert({
    owner_id: user.id, link_code: code, code_expires_at: expires,
    linked_at: null, source: null, updated_at: now,
  }, { onConflict: 'owner_id' });
  if (error) return res.status(500).json({ error: error.message });

  const botName = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, '') || null;
  return res.json({ linked: false, code, expiresAt: expires, botUsername: botName });
});

// ─── Status / Disconnect ──────────────────────────────────────────────────────
telegramRouter.get('/status', async (req: Request, res: Response) => {
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabaseAdmin
    .from('telegram_links').select('linked_at, telegram_username, source')
    .eq('owner_id', user.id).maybeSingle();
  return res.json({
    linked: !!data?.linked_at,
    username: data?.telegram_username ?? null,
    source: data?.source ?? null,
  });
});

telegramRouter.post('/disconnect', async (req: Request, res: Response) => {
  const user = await authUser(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { error } = await supabaseAdmin.from('telegram_links').delete().eq('owner_id', user.id);
  if (error) return res.status(500).json({ error: error.message });
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Briefing — a cron pushes the morning briefing to every linked user.
//    Protect with ?secret= or x-cron-secret (Vercel Cron).
// ─────────────────────────────────────────────────────────────────────────────
async function runBriefing(res: Response) {
  const { data: links, error } = await supabaseAdmin
    .from('telegram_links').select('owner_id, telegram_chat_id')
    .not('linked_at', 'is', null);
  if (error) return res.status(500).json({ error: error.message });

  let sent = 0;
  for (const link of links ?? []) {
    if (!link.telegram_chat_id) continue;
    try {
      const text = await composeBriefing(link.owner_id);
      await tgSend(link.telegram_chat_id, text);
      sent++;
    } catch (err) {
      console.error('[telegram] briefing failed for', link.owner_id, (err as Error).message);
    }
  }
  return res.json({ ok: true, sent });
}

/** Lightweight server-side briefing: today's focus card + open goals. */
async function composeBriefing(ownerId: string): Promise<string> {
  const [{ data: cards }, { data: goals }] = await Promise.all([
    supabaseAdmin.from('pipeline_cards').select('title, status, executive_priority')
      .eq('owner_id', ownerId).neq('status', 'published').order('executive_priority', { ascending: false }).limit(1),
    supabaseAdmin.from('goals').select('title').eq('owner_id', ownerId).eq('status', 'active').limit(3),
  ]);

  const focus = cards?.[0];
  const goalLines = (goals ?? []).map(g => `• ${g.title}`).join('\n');

  let text = '☀️ *Good morning.*\n\n';
  text += focus
    ? `Heute würde ich *„${focus.title}"* angehen.\n`
    : 'Dein Workspace ist im Gleichgewicht — erfasse einen neuen Gedanken.\n';
  if (goalLines) text += `\n*Deine Ziele:*\n${goalLines}\n`;
  text += '\n_Antworte einfach mit einer Idee, um sie festzuhalten._';
  return text;
}

telegramRouter.all('/briefing', async (req: Request, res: Response) => {
  const provided = req.headers['x-cron-secret'] ?? req.query.secret;
  const bearer = req.headers.authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  const ok = CRON_SECRET() && (provided === CRON_SECRET() || bearer === CRON_SECRET());
  if (!ok) return res.status(401).json({ error: 'Unauthorized' });
  return runBriefing(res);
});
