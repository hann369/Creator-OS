import { Router, type Request, type Response } from 'express';
import { supabaseAdmin } from '../supabase.js';
import { lookupEcosystemTelegramId } from '../ecosystem.js';

// ─────────────────────────────────────────────────────────────────────────────
// Creator OS Telegram bot — a thin CLIENT of Pronoia Core (its own bot, separate
// token/webhook from the Life OS bot). It holds no intelligence of its own: it
// captures into, and reads from, the same Supabase data the web app uses.
//
// Capabilities in this slice:
//   • Capture with PROJECT ROUTING — a message becomes an idea in the *right*
//     project. If an active project is set it routes there; otherwise the bot
//     asks with inline buttons ("Zu welchem Projekt?"). This is the immediately
//     important behaviour: the bot must understand which project an idea is for.
//   • Linking (/link code or ecosystem email reuse), status, disconnect.
//   • Morning briefing (cron push).
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
const DEFAULT_WORKSPACE = 'main-space'; // matches getActiveWorkspaceId() default in the web app

const CODE_TTL_MS = 15 * 60 * 1000;

// ─── Telegram API helpers ────────────────────────────────────────────────────
interface InlineKeyboard { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> }

async function tgApi(method: string, body: Record<string, unknown>): Promise<void> {
  const token = BOT_TOKEN();
  if (!token) { console.warn(`[telegram] TELEGRAM_BOT_TOKEN unset — cannot call ${method}`); return; }
  try {
    await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch (err) {
    console.error(`[telegram] ${method} failed:`, (err as Error).message);
  }
}

function tgSend(chatId: number | string, text: string, keyboard?: InlineKeyboard): Promise<void> {
  return tgApi('sendMessage', {
    chat_id: chatId, text, parse_mode: 'Markdown', disable_web_page_preview: true,
    ...(keyboard ? { reply_markup: keyboard } : {}),
  });
}
function tgEditText(chatId: number | string, messageId: number, text: string, keyboard?: InlineKeyboard): Promise<void> {
  return tgApi('editMessageText', {
    chat_id: chatId, message_id: messageId, text, parse_mode: 'Markdown',
    ...(keyboard ? { reply_markup: keyboard } : { reply_markup: { inline_keyboard: [] } }),
  });
}
function tgAnswerCallback(callbackId: string, text?: string): Promise<void> {
  return tgApi('answerCallbackQuery', { callback_query_id: callbackId, ...(text ? { text } : {}) });
}

/** Escape Telegram legacy-Markdown special chars in dynamic text. */
function md(s: string): string {
  return s.replace(/([_*\[\]`])/g, '\\$1');
}

async function getTelegramFilePath(fileId: string): Promise<string | null> {
  const token = BOT_TOKEN();
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`);
    if (!res.ok) return null;
    const data: any = await res.json();
    return data.result?.file_path ?? null;
  } catch (err) {
    console.error('[telegram] getFile failed:', (err as Error).message);
    return null;
  }
}

async function transcribeAudio(filePath: string): Promise<string | null> {
  const token = BOT_TOKEN();
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!token || !mistralKey) {
    console.warn('[telegram] Cannot transcribe audio: BOT_TOKEN or MISTRAL_API_KEY unset');
    return null;
  }

  try {
    const fileUrl = `https://api.telegram.org/file/bot${token}/${filePath}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      console.error(`[telegram] Failed to download audio from Telegram: ${fileRes.status}`);
      return null;
    }
    const arrayBuffer = await fileRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const formData = new FormData();
    const blob = new Blob([buffer], { type: 'audio/ogg' });
    formData.append('file', blob, 'voice.ogg');
    formData.append('model', 'voxtral-mini-transcribe-latest');

    const mistralRes = await fetch('https://api.mistral.ai/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${mistralKey}`
      },
      body: formData
    });

    if (!mistralRes.ok) {
      console.error(`[telegram] Mistral transcription failed: ${mistralRes.status} - ${await mistralRes.text()}`);
      return null;
    }

    const data: any = await mistralRes.json();
    return data.text ?? null;
  } catch (err) {
    console.error('[telegram] transcribeAudio error:', (err as Error).message);
    return null;
  }
}

function projectKeyboard(projects: Array<{ id: string; name: string }>, action: 'pick' | 'setactive'): InlineKeyboard {
  return { inline_keyboard: projects.slice(0, 12).map(p => [{ text: p.name, callback_data: `${action}:${p.id}` }]) };
}

function newCode(): string {
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

// ─── Data access (thin — same tables the web uses) ───────────────────────────
interface Link { owner_id: string; linked_at: string | null; active_project_id: string | null; pending_idea: string | null; }

async function getLink(telegramUserId: number): Promise<Link | null> {
  const { data } = await supabaseAdmin
    .from('telegram_links').select('owner_id, linked_at, active_project_id, pending_idea')
    .eq('telegram_user_id', telegramUserId).maybeSingle();
  return (data as Link) ?? null;
}

async function getProjects(ownerId: string): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabaseAdmin
    .from('projects').select('id, name').eq('owner_id', ownerId).order('created_at', { ascending: true });
  return data ?? [];
}

function projectName(projects: Array<{ id: string; name: string }>, id: string | null): string | null {
  return projects.find(p => p.id === id)?.name ?? null;
}

async function setActiveProject(ownerId: string, projectId: string): Promise<void> {
  await supabaseAdmin.from('telegram_links').update({ active_project_id: projectId, updated_at: new Date().toISOString() }).eq('owner_id', ownerId);
}
async function setPendingIdea(ownerId: string, text: string | null): Promise<void> {
  await supabaseAdmin.from('telegram_links').update({ pending_idea: text, updated_at: new Date().toISOString() }).eq('owner_id', ownerId);
}

/** Insert an idea, routed to a project. project_id is the real linkage; workspace_id
 *  mirrors it so it surfaces in that project once the web scopes by project. */
async function captureIdea(ownerId: string, title: string, projectId: string | null): Promise<void> {
  const now = new Date().toISOString();
  const id = `idea-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await supabaseAdmin.from('ideas').insert({
    id, workspace_id: projectId ?? DEFAULT_WORKSPACE, owner_id: ownerId, project_id: projectId,
    title: title.slice(0, 500), status: 'Idea', rating: 0, archived: false,
    created_at: now, updated_at: now,
  });
  if (error) throw error;
}

// ─────────────────────────────────────────────────────────────────────────────
// Webhook — Telegram delivers updates here.
// ─────────────────────────────────────────────────────────────────────────────
telegramRouter.post('/webhook', async (req: Request, res: Response) => {
  const secret = req.headers['x-telegram-bot-api-secret-token'];
  if (!WEBHOOK_SECRET() || secret !== WEBHOOK_SECRET()) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const updateId = req.body?.update_id;
  if (typeof updateId === 'number') {
    try {
      const { data, error } = await supabaseAdmin
        .from('processed_telegram_updates')
        .select('update_id')
        .eq('update_id', updateId)
        .maybeSingle();

      if (error) {
        console.warn('[telegram] Database check for update_id failed:', error.message);
      } else if (data) {
        console.log(`[telegram] Duplicate update ignored: ${updateId}`);
        return res.status(200).json({ ok: true, ignored: true });
      }

      const { error: insertError } = await supabaseAdmin
        .from('processed_telegram_updates')
        .insert({ update_id: updateId });

      if (insertError) {
        if (insertError.code === '23505') {
          console.log(`[telegram] Parallel duplicate update ignored: ${updateId}`);
          return res.status(200).json({ ok: true, ignored: true });
        }
        console.warn('[telegram] Failed to persist update_id:', insertError.message);
      }
    } catch (dbErr) {
      console.error('[telegram] Idempotency check error:', (dbErr as Error).message);
    }
  }

  // On Vercel serverless the function is frozen once the response is sent, so we
  // must finish all DB work + replies BEFORE responding — never ack-then-process.
  try {
    if (req.body?.callback_query) await processCallback(req.body.callback_query);
    else await processUpdate(req.body);
  } catch (err) {
    console.error('[telegram] webhook processing error:', (err as Error).message);
  }
  return res.status(200).json({ ok: true });
});

async function processUpdate(update: any): Promise<void> {
  const msg = update?.message ?? update?.edited_message;
  const text: string | undefined = msg?.text;
  const voice = msg?.voice ?? msg?.audio;
  const chatId: number | undefined = msg?.chat?.id;
  const fromId: number | undefined = msg?.from?.id;
  const username: string | undefined = msg?.from?.username;
  if ((!text && !voice?.file_id) || chatId === undefined || fromId === undefined) return;

  const trimmed = text ? text.trim() : '';
  try {
    // ── Command router (extensible; non-commands are captured as ideas) ──
    if (trimmed === '/start') {
      await tgSend(chatId, 'Willkommen bei *Pronoia Creator OS* 🎬\n\nVerbinde dein Konto in der App → *Einstellungen* → *Connect Telegram* und sende mir `/link DEIN-CODE`.\n\nDanach wird jede Nachricht zu einer Idee — ich frage dich, in welches Projekt sie gehört. Mit `/projects` wählst du dein aktives Projekt.');
      return;
    }
    if (trimmed.toLowerCase().startsWith('/link')) {
      const code = trimmed.split(/\s+/)[1]?.toUpperCase();
      if (!code) { await tgSend(chatId, 'Nutzung: `/link DEIN-CODE` (Code aus den App-Einstellungen).'); return; }
      await handleLinkCode(code, { chatId, fromId, username });
      return;
    }

    const link = await getLink(fromId);
    if (!link?.linked_at) {
      await tgSend(chatId, 'Noch nicht verbunden. Öffne die App → *Einstellungen* → *Connect Telegram* und sende mir `/link DEIN-CODE`.');
      return;
    }

    if (trimmed.toLowerCase().startsWith('/projects') || trimmed.toLowerCase().startsWith('/project')) {
      const projects = await getProjects(link.owner_id);
      if (projects.length === 0) { await tgSend(chatId, 'Noch keine Projekte gefunden. Öffne einmal die App, damit deine Projekte synchronisiert werden.'); return; }
      const active = projectName(projects, link.active_project_id);
      await tgSend(chatId, `📂 Aktives Projekt${active ? `: *${md(active)}*` : ' — noch keins gewählt'}.\n\nWähle dein aktives Projekt:`, projectKeyboard(projects, 'setactive'));
      return;
    }

    let processedText = trimmed;
    if (voice?.file_id) {
      await tgSend(chatId, '🎙️ _Transkribiere Sprachnachricht..._');
      const filePath = await getTelegramFilePath(voice.file_id);
      if (!filePath) {
        await tgSend(chatId, '❌ Sprachnachricht konnte nicht geladen werden.');
        return;
      }
      const transcription = await transcribeAudio(filePath);
      if (!transcription) {
        await tgSend(chatId, '❌ Transkription fehlgeschlagen.');
        return;
      }
      processedText = transcription.trim();
      await tgSend(chatId, `📝 _Transkript:_\n"${processedText}"`);
    }

    if (!processedText) {
      await tgSend(chatId, '❌ Keine verwertbare Textnachricht oder Transkription gefunden.');
      return;
    }

    // ── Default: capture as an idea, routed to a project ──
    await routeIdea(link, { chatId, text: processedText });
  } catch (err) {
    console.error('[telegram] processUpdate error:', (err as Error).message);
    await tgSend(chatId, 'Kurzer Fehler beim Speichern — bitte nochmal versuchen.');
  }
}

/** Decide where a captured idea goes: active project, the only project, or ask. */
async function routeIdea(link: Link, msg: { chatId: number; text: string }): Promise<void> {
  const projects = await getProjects(link.owner_id);

  // Active project set & still valid → route straight there.
  const activeName = projectName(projects, link.active_project_id);
  if (link.active_project_id && activeName) {
    await captureIdea(link.owner_id, msg.text, link.active_project_id);
    await tgSend(msg.chatId, `💡 Idee gespeichert in *${md(activeName)}*.`, {
      inline_keyboard: [[{ text: '📂 Anderes Projekt', callback_data: 'change' }]],
    });
    return;
  }

  // Zero or one project → no decision to make.
  if (projects.length <= 1) {
    const only = projects[0];
    await captureIdea(link.owner_id, msg.text, only?.id ?? null);
    if (only) await setActiveProject(link.owner_id, only.id);
    await tgSend(msg.chatId, only ? `💡 Idee gespeichert in *${md(only.name)}*.` : '💡 Idee gespeichert.');
    return;
  }

  // Multiple projects, none active → ask which one, holding the idea.
  await setPendingIdea(link.owner_id, msg.text);
  await tgSend(msg.chatId, `💡 _"${md(msg.text.slice(0, 80))}"_\n\nZu welchem Projekt?`, projectKeyboard(projects, 'pick'));
}

// ─── Inline-button callbacks (project routing) ───────────────────────────────
async function processCallback(cb: any): Promise<void> {
  const data: string = cb?.data ?? '';
  const fromId: number | undefined = cb?.from?.id;
  const chatId: number | undefined = cb?.message?.chat?.id;
  const messageId: number | undefined = cb?.message?.message_id;
  if (fromId === undefined || chatId === undefined || messageId === undefined) return;

  const link = await getLink(fromId);
  if (!link?.linked_at) { await tgAnswerCallback(cb.id, 'Nicht verbunden.'); return; }

  const [action, projectId] = data.split(':');
  const projects = await getProjects(link.owner_id);

  if (action === 'change') {
    // Turn the confirmation into a project picker (to re-home the active project).
    await tgAnswerCallback(cb.id);
    await tgEditText(chatId, messageId, 'Aktives Projekt wählen:', projectKeyboard(projects, 'setactive'));
    return;
  }

  const name = projectName(projects, projectId);
  if (!name) { await tgAnswerCallback(cb.id, 'Projekt nicht gefunden.'); return; }

  if (action === 'pick') {
    // Commit the held idea into the chosen project and make it active.
    if (link.pending_idea) await captureIdea(link.owner_id, link.pending_idea, projectId);
    await setActiveProject(link.owner_id, projectId);
    await setPendingIdea(link.owner_id, null);
    await tgAnswerCallback(cb.id, `Gespeichert in ${name}`);
    await tgEditText(chatId, messageId, `💡 Gespeichert in *${md(name)}*.\n_Aktives Projekt ist jetzt ${md(name)} — weitere Ideen landen dort._`);
    return;
  }

  if (action === 'setactive') {
    await setActiveProject(link.owner_id, projectId);
    await tgAnswerCallback(cb.id, `Aktiv: ${name}`);
    await tgEditText(chatId, messageId, `📂 Aktives Projekt: *${md(name)}*\n_Neue Ideen landen ab jetzt hier._`);
    return;
  }

  await tgAnswerCallback(cb.id);
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
  await tgSend(tg.chatId, '✅ Verbunden! Sende mir eine Idee — ich frage dich, in welches Projekt sie gehört. Mit `/projects` wählst du dein aktives Projekt.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Connect — the app asks for a link code (or reuses the ecosystem id).
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
// Briefing — a cron pushes the morning briefing to every linked user.
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
