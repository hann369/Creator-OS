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
    formData.append('model', process.env.MISTRAL_TRANSCRIPTION_MODEL ?? 'voxtral-mini-latest');

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

async function askMistral(prompt: string, systemPrompt?: string): Promise<string> {
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) return '';
  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt ?? 'You are a helpful assistant.' },
          { role: 'user', content: prompt }
        ]
      })
    });
    if (!res.ok) return '';
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[telegram] askMistral failed:', (err as Error).message);
    return '';
  }
}

async function handleRecall(link: Link, chatId: number, query: string): Promise<void> {
  await tgSend(chatId, `🔍 _Suche in deinem Gehirn nach "${md(query)}"..._`);

  try {
    // 1. Query ideas
    const { data: ideas, error: ideasErr } = await supabaseAdmin
      .from('ideas')
      .select('title, pain_points, packaging_questions')
      .eq('owner_id', link.owner_id)
      .or(`title.ilike.%${query}%,pain_points.ilike.%${query}%,packaging_questions.ilike.%${query}%`)
      .limit(10);

    if (ideasErr) console.warn('[telegram] recall ideas query error:', ideasErr.message);

    // 2. Query documents
    const { data: documents, error: docsErr } = await supabaseAdmin
      .from('documents')
      .select('title, body')
      .eq('owner_id', link.owner_id)
      .or(`title.ilike.%${query}%,body.ilike.%${query}%`)
      .limit(5);

    if (docsErr) console.warn('[telegram] recall docs query error:', docsErr.message);

    const hasIdeas = ideas && ideas.length > 0;
    const hasDocs = documents && documents.length > 0;

    if (!hasIdeas && !hasDocs) {
      await tgSend(chatId, `Ich konnte in deinen Ideen und Dokumenten leider nichts zu *${md(query)}* finden.`);
      return;
    }

    // 3. Format context for Mistral
    let context = '';
    const sources: string[] = [];

    if (hasIdeas) {
      context += `--- IDEEN ---\n`;
      for (const idea of ideas!) {
        context += `- Titel: ${idea.title}\n`;
        if (idea.pain_points) context += `  Pain Points: ${idea.pain_points}\n`;
        if (idea.packaging_questions) context += `  Fragen: ${idea.packaging_questions}\n`;
        sources.push(`💡 Idee: *${md(idea.title)}*`);
      }
    }

    if (hasDocs) {
      context += `\n--- DOKUMENTE ---\n`;
      for (const doc of documents!) {
        context += `- Titel: ${doc.title}\n`;
        if (doc.body) context += `  Inhalt: ${doc.body.slice(0, 500)}\n`;
        sources.push(`📄 Dokument: *${md(doc.title)}*`);
      }
    }

    // 4. Call Mistral to synthesize
    const systemPrompt = 'Du bist Pronoia Recall, ein intelligentes Wissens-Interface für den Creator. Deine Aufgabe ist es, gefundene Notizen und Ideen kurz und prägnant auf Deutsch zusammenzufassen, um die Frage des Benutzers zu beantworten. Antworte in maximal 4 Sätzen. Sei professionell und direkt.';
    const userPrompt = `Der Benutzer fragt: "Was weiß ich über ${query}?"
    
Hier sind die Suchergebnisse aus seiner Wissensdatenbank:
${context}

Fasse die wichtigsten Erkenntnisse zusammen, um dem Benutzer eine kompakte Antwort zu geben.`;

    const summary = await askMistral(userPrompt, systemPrompt);

    // 5. Send response
    let responseText = '';
    if (summary) {
      responseText = `${summary}\n\n`;
    } else {
      responseText = `Hier sind deine Suchergebnisse für *${md(query)}*:\n\n`;
    }

    responseText += `*Gefundene Quellen:*\n` + sources.slice(0, 8).map(s => `- ${s}`).join('\n');
    
    await tgSend(chatId, responseText);
  } catch (err) {
    console.error('[telegram] handleRecall error:', (err as Error).message);
    await tgSend(chatId, '❌ Fehler beim Durchsuchen deiner Daten.');
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
async function captureIdea(ownerId: string, title: string, projectId: string | null): Promise<string> {
  const now = new Date().toISOString();
  const id = `idea-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await supabaseAdmin.from('ideas').insert({
    id, workspace_id: projectId ?? DEFAULT_WORKSPACE, owner_id: ownerId, project_id: projectId,
    title: title.slice(0, 500), status: 'Idea', rating: 0, archived: false,
    created_at: now, updated_at: now,
  });
  if (error) throw error;
  return id;
}

async function captureDocument(ownerId: string, title: string, body: string, projectId: string | null): Promise<string> {
  const now = new Date().toISOString();
  const id = `doc-${crypto.randomUUID().slice(0, 8)}`;
  const { error } = await supabaseAdmin.from('documents').insert({
    id, workspace_id: projectId ?? DEFAULT_WORKSPACE, owner_id: ownerId,
    title: title.slice(0, 500), body, tags: [],
    created_at: now, updated_at: now,
  });
  if (error) throw error;
  return id;
}

async function generateTitle(text: string): Promise<string> {
  const systemPrompt = 'Du bist ein Assistent, der kurze, prägnante Titel (3-5 Worte) in Deutsch für Notizen generiert. Antworte NUR mit dem Titel, ohne Anführungszeichen oder Punkte.';
  const title = await askMistral(`Generiere einen kurzen Titel für diesen Text:\n\n${text}`, systemPrompt);
  return title ? title.trim() : (text.length > 50 ? text.slice(0, 47) + '...' : text);
}

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<globalThis.Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
  } finally {
    clearTimeout(id);
  }
}

function extractMetaDescription(html: string): string {
  const metaRegex = /<meta[^>]*?(?:name|property)=["'](?:description|og:description)["'][^>]*?content=["']([\s\S]*?)["']/i;
  const match = html.match(metaRegex);
  if (match) return match[1].trim();

  const metaRegex2 = /<meta[^>]*?content=["']([\s\S]*?)["'][^>]*?(?:name|property)=["'](?:description|og:description)["']/i;
  const match2 = html.match(metaRegex2);
  return match2 ? match2[1].trim() : '';
}

function cleanHtmlText(html: string): string {
  return html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function handleUrlIngestion(link: Link, chatId: number, url: string, rawText: string): Promise<void> {
  await tgSend(chatId, `🌐 _Lese Website "${md(url)}" ein..._`);

  try {
    const res = await fetchWithTimeout(url);
    if (!res.ok) {
      await tgSend(chatId, `❌ Fehler beim Abruf der Seite (HTTP ${res.status}).`);
      return;
    }

    const html = await res.text();
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    let pageTitle = titleMatch ? titleMatch[1].trim() : '';
    
    pageTitle = pageTitle
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

    const metaDesc = extractMetaDescription(html);
    const bodyText = cleanHtmlText(html);

    const systemPrompt = 'Du bist ein Assistent, der Webseiteninhalte analysiert. Deine Aufgabe ist es, den bereitgestellten Webseiten-Auszug kurz zusammenzufassen und einen passenden Titel auf Deutsch zu generieren. Antworte mit einem JSON-Objekt mit genau zwei Feldern: "title" (3-6 Worte) und "summary" (2-3 Sätze).';
    const userPrompt = `Webseite URL: ${url}
HTML Titel: ${pageTitle}
Meta Beschreibung: ${metaDesc}
Textauszug (bereinigt): ${bodyText.slice(0, 1500)}

Erstelle das JSON-Objekt.`;

    const jsonString = await askMistral(userPrompt, systemPrompt);
    let title = pageTitle || 'Webseite Notiz';
    let summary = metaDesc || 'Keine Zusammenfassung verfügbar.';

    if (jsonString) {
      try {
        const parsed = JSON.parse(jsonString);
        if (parsed.title) title = parsed.title.trim();
        if (parsed.summary) summary = parsed.summary.trim();
      } catch {
        console.warn('[telegram] Failed to parse Mistral JSON for URL ingestion');
      }
    }

    const now = new Date().toISOString();
    const ideaId = `idea-${crypto.randomUUID().slice(0, 8)}`;
    const projectId = link.active_project_id;
    const projects = await getProjects(link.owner_id);
    const projName = projectName(projects, projectId) ?? 'Main Space';

    const { error } = await supabaseAdmin.from('ideas').insert({
      id: ideaId,
      workspace_id: projectId ?? DEFAULT_WORKSPACE,
      owner_id: link.owner_id,
      project_id: projectId,
      title: title.slice(0, 500),
      inspiration_url: url,
      pain_points: summary.slice(0, 1000),
      status: 'Idea',
      rating: 0,
      archived: false,
      created_at: now,
      updated_at: now,
    });

    if (error) throw error;

    await tgSend(chatId, `💡 Idee gespeichert in *${md(projName)}*.\n\n*${md(title)}*\n_${md(summary)}_\n\n🔗 [Quelle](${url})`, {
      inline_keyboard: [
        [
          { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${projectId}` },
          { text: '📂 Anderes Projekt', callback_data: 'change' }
        ]
      ],
    });
  } catch (err) {
    console.error('[telegram] handleUrlIngestion error:', (err as Error).message);
    await tgSend(chatId, '❌ Fehler beim Verarbeiten der URL.');
  }
}

async function analyzeImageWithMistral(imageBuffer: Buffer, mimeType: string, prompt: string): Promise<string> {
  const mistralKey = process.env.MISTRAL_API_KEY;
  if (!mistralKey) return '';
  const base64 = imageBuffer.toString('base64');
  const dataUrl = `data:${mimeType};base64,${base64}`;

  try {
    const res = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralKey}`
      },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: dataUrl } }
            ]
          }
        ]
      })
    });
    if (!res.ok) {
      console.error('[telegram] Mistral vision API failed:', res.status, await res.text());
      return '';
    }
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content ?? '';
  } catch (err) {
    console.error('[telegram] analyzeImageWithMistral failed:', (err as Error).message);
    return '';
  }
}

function guessAssetKind(fileName: string): string {
  const u = fileName.toLowerCase().split('?')[0];
  if (/\.(png|jpe?g|gif|webp|svg|avif)$/.test(u)) return 'image';
  if (/\.(mp4|mov|webm|mkv|avi)$/.test(u)) return 'video';
  if (/\.(mp3|wav|ogg|m4a|flac)$/.test(u)) return 'audio';
  if (/\.pdf$/.test(u)) return 'pdf';
  return 'other';
}

async function handleMediaIngestion(
  link: Link,
  chatId: number,
  media: { fileId: string; fileName: string; mimeType: string; caption?: string }
): Promise<void> {
  await tgSend(chatId, `📥 _Lade Datei "${md(media.fileName)}" herunter..._`);

  try {
    const filePath = await getTelegramFilePath(media.fileId);
    if (!filePath) {
      await tgSend(chatId, '❌ Fehler beim Abruf der Datei-URL von Telegram.');
      return;
    }

    const fileUrl = `https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileRes = await fetch(fileUrl);
    if (!fileRes.ok) {
      await tgSend(chatId, '❌ Download-Fehler von Telegram.');
      return;
    }
    const fileBuffer = Buffer.from(await fileRes.arrayBuffer());

    // Upload to Supabase Storage
    const storagePath = `${link.owner_id}/telegram/${crypto.randomUUID()}-${media.fileName}`;
    const { error: uploadErr } = await supabaseAdmin.storage
      .from('course-media')
      .upload(storagePath, fileBuffer, { contentType: media.mimeType, upsert: true });

    if (uploadErr) {
      console.error('[telegram] Supabase upload failed:', uploadErr.message);
      await tgSend(chatId, '❌ Fehler beim Hochladen in den Cloud-Speicher.');
      return;
    }

    // Get signed URL (10 years)
    const { data: signedData, error: signedErr } = await supabaseAdmin.storage
      .from('course-media')
      .createSignedUrl(storagePath, 315360000);

    if (signedErr || !signedData?.signedUrl) {
      console.error('[telegram] Failed to create signed URL:', signedErr?.message);
      await tgSend(chatId, '❌ Fehler beim Erstellen der Freigabe-URL.');
      return;
    }

    const fileLink = signedData.signedUrl;
    const kind = guessAssetKind(media.fileName);
    let title = media.fileName;
    let desc = '';

    if (media.mimeType.startsWith('image/')) {
      await tgSend(chatId, '👁️ _Analysiere Bild mit AI (Vision OCR)..._');
      const prompt = `Analysiere dieses Bild auf Deutsch. Falls es sich um ein handschriftliches Dokument, ein Whiteboard, einen Beleg oder Text handelt, transkribiere den gesamten Text wortwörtlich. Falls es ein Foto oder Bild ist, beschreibe den Inhalt präzise in 2-3 Sätzen. Generiere am Anfang eine Zeile mit einem vorgeschlagenen Titel im Format: 'TITLE: [Dein Titel]' (maximal 5 Worte).
${media.caption ? `Vom User bereitgestellter Kontext/Bildunterschrift: "${media.caption}"` : ''}`;

      const completionText = await analyzeImageWithMistral(fileBuffer, media.mimeType, prompt);
      if (completionText) {
        if (completionText.startsWith('TITLE:')) {
          const firstLineEnd = completionText.indexOf('\n');
          const titleLine = completionText.slice(0, firstLineEnd === -1 ? undefined : firstLineEnd);
          title = titleLine.replace('TITLE:', '').trim();
          desc = firstLineEnd === -1 ? '' : completionText.slice(firstLineEnd + 1).trim();
        } else {
          desc = completionText;
        }
      }
    } else {
      desc = media.caption || `${kind.toUpperCase()}-Dokument erfasst.`;
    }

    const now = new Date().toISOString();
    const assetId = `asset-${crypto.randomUUID().slice(0, 8)}`;
    const projectId = link.active_project_id;
    const projects = await getProjects(link.owner_id);
    const projName = projectName(projects, projectId) ?? 'Main Space';

    // Insert Asset
    const { error: assetErr } = await supabaseAdmin.from('assets').insert({
      id: assetId,
      workspace_id: projectId ?? DEFAULT_WORKSPACE,
      owner_id: link.owner_id,
      project_id: projectId,
      title: title.slice(0, 200),
      url: fileLink,
      asset_kind: kind,
      tags: ['telegram', kind],
      caption: desc.slice(0, 1000),
      created_at: now,
      updated_at: now
    });

    if (assetErr) throw assetErr;

    // Insert Idea pointing to Asset
    const ideaId = `idea-${crypto.randomUUID().slice(0, 8)}`;
    const ideaTitle = `Asset: ${title}`;
    const ideaBody = `${desc}\n\n🔗 [Asset anzeigen](${fileLink})`;

    const { error: ideaErr } = await supabaseAdmin.from('ideas').insert({
      id: ideaId,
      workspace_id: projectId ?? DEFAULT_WORKSPACE,
      owner_id: link.owner_id,
      project_id: projectId,
      title: ideaTitle.slice(0, 500),
      pain_points: ideaBody.slice(0, 1000),
      status: 'Idea',
      rating: 0,
      archived: false,
      created_at: now,
      updated_at: now
    });

    if (ideaErr) throw ideaErr;

    await tgSend(chatId, `📥 *Asset erfasst in ${md(projName)}!*\n\n*Titel:* ${md(title)}\n*Typ:* ${md(kind)}\n\n${desc ? `_Inhalt/OCR:_\n${md(desc.slice(0, 500))}` : ''}`, {
      inline_keyboard: [
        [
          { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${projectId}` },
          { text: '📂 Anderes Projekt', callback_data: 'change' }
        ]
      ]
    });
  } catch (err) {
    console.error('[telegram] handleMediaIngestion error:', (err as Error).message);
    await tgSend(chatId, '❌ Fehler beim Verarbeiten des Assets.');
  }
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
  const photo = msg?.photo;
  const document = msg?.document;
  const chatId: number | undefined = msg?.chat?.id;
  const fromId: number | undefined = msg?.from?.id;
  const username: string | undefined = msg?.from?.username;
  if ((!text && !voice?.file_id && !photo && !document) || chatId === undefined || fromId === undefined) return;

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

    if (photo && photo.length > 0) {
      const bestPhoto = photo[photo.length - 1];
      await handleMediaIngestion(link, chatId, {
        fileId: bestPhoto.file_id,
        fileName: 'telegram_photo.jpg',
        mimeType: 'image/jpeg',
        caption: msg.caption
      });
      return;
    }
    if (document) {
      await handleMediaIngestion(link, chatId, {
        fileId: document.file_id,
        fileName: document.file_name || 'document',
        mimeType: document.mime_type || 'application/octet-stream',
        caption: msg.caption
      });
      return;
    }

    const urlRegex = /(https?:\/\/[^\s]+)/gi;
    const urlMatch = trimmed.match(urlRegex);
    if (urlMatch && !trimmed.startsWith('/')) {
      const url = urlMatch[0];
      await handleUrlIngestion(link, chatId, url, trimmed);
      return;
    }

    const isRecallCmd = trimmed.toLowerCase().startsWith('/recall') || trimmed.toLowerCase().startsWith('/search');
    const isRecallNl = trimmed.toLowerCase().startsWith('was weiß ich über') || 
                       trimmed.toLowerCase().startsWith('suche nach') ||
                       trimmed.toLowerCase().startsWith('erinnere mich an');
    
    if (isRecallCmd || isRecallNl) {
      let query = '';
      if (isRecallCmd) {
        const parts = trimmed.split(/\s+/);
        query = parts.slice(1).join(' ').trim();
      } else {
        if (trimmed.toLowerCase().startsWith('was weiß ich über')) {
          query = trimmed.substring(18).trim();
        } else if (trimmed.toLowerCase().startsWith('suche nach')) {
          query = trimmed.substring(10).trim();
        } else if (trimmed.toLowerCase().startsWith('erinnere mich an')) {
          query = trimmed.substring(16).trim();
        }
      }
      
      if (query.endsWith('?')) {
        query = query.slice(0, -1).trim();
      }

      if (!query) {
        await tgSend(chatId, 'Nutzung: `/recall SUCHBEGRIFF` oder z.B. `Was weiß ich über SEO?`');
        return;
      }

      await handleRecall(link, chatId, query);
      return;
    }

    if (trimmed.toLowerCase().startsWith('/projects') || trimmed.toLowerCase().startsWith('/project')) {
      const projects = await getProjects(link.owner_id);
      if (projects.length === 0) { await tgSend(chatId, 'Noch keine Projekte gefunden. Öffne einmal die App, damit deine Projekte synchronisiert werden.'); return; }
      const active = projectName(projects, link.active_project_id);
      await tgSend(chatId, `📂 Aktives Projekt${active ? `: *${md(active)}*` : ' — noch keins gewählt'}.\n\nWähle dein aktives Projekt:`, projectKeyboard(projects, 'setactive'));
      return;
    }

    const isDocCmd = trimmed.toLowerCase().startsWith('/doc ') || trimmed.toLowerCase().startsWith('/document ');
    const isIdeaCmd = trimmed.toLowerCase().startsWith('/idea ');
    let forcedType: 'idea' | 'document' | null = null;
    let textToRoute = trimmed;

    if (isDocCmd) {
      forcedType = 'document';
      const parts = trimmed.split(/\s+/);
      textToRoute = parts.slice(1).join(' ').trim();
    } else if (isIdeaCmd) {
      forcedType = 'idea';
      const parts = trimmed.split(/\s+/);
      textToRoute = parts.slice(1).join(' ').trim();
    }

    let processedText = textToRoute;
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

    // ── Default: capture as specified type (or fallback to idea), routed to a project ──
    await routeContent(link, { chatId, text: processedText }, forcedType ?? 'idea');
  } catch (err) {
    console.error('[telegram] processUpdate error:', (err as Error).message);
    await tgSend(chatId, 'Kurzer Fehler beim Speichern — bitte nochmal versuchen.');
  }
}

/** Decide where a captured idea goes: active project, the only project, or ask. */
async function routeContent(link: Link, msg: { chatId: number; text: string }, type: 'idea' | 'document'): Promise<void> {
  const projects = await getProjects(link.owner_id);
  const projectId = link.active_project_id;
  const activeName = projectName(projects, projectId);

  if (projectId && activeName) {
    if (type === 'idea') {
      const ideaId = await captureIdea(link.owner_id, msg.text, projectId);
      await tgSend(msg.chatId, `💡 Idee gespeichert in *${md(activeName)}*.`, {
        inline_keyboard: [
          [
            { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${projectId}` },
            { text: '📂 Anderes Projekt', callback_data: 'change' }
          ]
        ],
      });
    } else {
      const docTitle = await generateTitle(msg.text);
      const docId = await captureDocument(link.owner_id, docTitle, msg.text, projectId);
      await tgSend(msg.chatId, `📄 Dokument gespeichert in *${md(activeName)}*.\n_Titel: "${md(docTitle)}"_`, {
        inline_keyboard: [
          [
            { text: '💡 In Idee umwandeln', callback_data: `toidea:${docId}:${projectId}` },
            { text: '📂 Anderes Projekt', callback_data: 'change' }
          ]
        ],
      });
    }
    return;
  }

  if (projects.length <= 1) {
    const only = projects[0];
    const pId = only?.id ?? null;
    const pName = only ? only.name : '';
    if (only) await setActiveProject(link.owner_id, pId);

    if (type === 'idea') {
      const ideaId = await captureIdea(link.owner_id, msg.text, pId);
      await tgSend(msg.chatId, only ? `💡 Idee gespeichert in *${md(pName)}*.` : '💡 Idee gespeichert.', {
        inline_keyboard: [
          [
            { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${pId}` }
          ]
        ]
      });
    } else {
      const docTitle = await generateTitle(msg.text);
      const docId = await captureDocument(link.owner_id, docTitle, msg.text, pId);
      await tgSend(msg.chatId, only ? `📄 Dokument gespeichert in *${md(pName)}*.\n_Titel: "${md(docTitle)}"_` : `📄 Dokument gespeichert.\n_Titel: "${md(docTitle)}"_`, {
        inline_keyboard: [
          [
            { text: '💡 In Idee umwandeln', callback_data: `toidea:${docId}:${pId}` }
          ]
        ]
      });
    }
    return;
  }

  // Multiple projects, none active → ask which one, holding the text with prefix.
  await setPendingIdea(link.owner_id, `${type}:${msg.text}`);
  const displayType = type === 'idea' ? 'Idee' : 'Dokument';
  await tgSend(msg.chatId, `📥 _[${displayType}] "${md(msg.text.slice(0, 80))}"_\n\nZu welchem Projekt?`, projectKeyboard(projects, 'pick'));
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

  if (action === 'todoc') {
    const ideaId = projectId;
    const pId = data.split(':')[2] || null;
    const pName = projectName(projects, pId) ?? 'Main Space';

    const { data: idea, error: fetchErr } = await supabaseAdmin
      .from('ideas')
      .select('title, pain_points, inspiration_url')
      .eq('id', ideaId)
      .maybeSingle();

    if (fetchErr || !idea) {
      await tgAnswerCallback(cb.id, 'Idee nicht gefunden.');
      return;
    }

    await supabaseAdmin.from('ideas').delete().eq('id', ideaId);
    
    const docTitle = idea.inspiration_url ? idea.title : await generateTitle(idea.title);
    const docBody = idea.inspiration_url 
      ? `${idea.pain_points || ''}\n\n🔗 [Quelle](${idea.inspiration_url})` 
      : idea.title;

    const docId = await captureDocument(link.owner_id, docTitle, docBody, pId);

    await tgAnswerCallback(cb.id, 'In Dokument umgewandelt');
    await tgEditText(chatId, messageId, `📄 Dokument gespeichert in *${md(pName)}*.\n_Titel: "${md(docTitle)}"_`, {
      inline_keyboard: [
        [
          { text: '💡 In Idee umwandeln', callback_data: `toidea:${docId}:${pId}` },
          { text: '📂 Anderes Projekt', callback_data: 'change' }
        ]
      ]
    });
    return;
  }

  if (action === 'toidea') {
    const docId = projectId;
    const pId = data.split(':')[2] || null;
    const pName = projectName(projects, pId) ?? 'Main Space';

    const { data: doc, error: fetchErr } = await supabaseAdmin
      .from('documents')
      .select('title, body')
      .eq('id', docId)
      .maybeSingle();

    if (fetchErr || !doc) {
      await tgAnswerCallback(cb.id, 'Dokument nicht gefunden.');
      return;
    }

    await supabaseAdmin.from('documents').delete().eq('id', docId);
    const originalText = doc.body || doc.title;
    const ideaId = await captureIdea(link.owner_id, originalText, pId);

    await tgAnswerCallback(cb.id, 'In Idee umgewandelt');
    await tgEditText(chatId, messageId, `💡 Idee gespeichert in *${md(pName)}*.`, {
      inline_keyboard: [
        [
          { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${pId}` },
          { text: '📂 Anderes Projekt', callback_data: 'change' }
        ]
      ]
    });
    return;
  }

  if (!name) { await tgAnswerCallback(cb.id, 'Projekt nicht gefunden.'); return; }

  if (action === 'pick') {
    if (link.pending_idea) {
      const colonIndex = link.pending_idea.indexOf(':');
      let type = 'idea';
      let text = link.pending_idea;
      
      if (colonIndex !== -1) {
        const potentialType = link.pending_idea.slice(0, colonIndex);
        if (potentialType === 'idea' || potentialType === 'document') {
          type = potentialType;
          text = link.pending_idea.slice(colonIndex + 1);
        }
      }

      await setActiveProject(link.owner_id, projectId);
      await setPendingIdea(link.owner_id, null);

      if (type === 'document') {
        const docTitle = await generateTitle(text);
        const docId = await captureDocument(link.owner_id, docTitle, text, projectId);
        await tgAnswerCallback(cb.id, `Dokument gespeichert in ${name}`);
        await tgEditText(chatId, messageId, `📄 Dokument gespeichert in *${md(name)}*.\n_Titel: "${md(docTitle)}"_\n\n_Aktives Projekt ist jetzt ${md(name)}._`, {
          inline_keyboard: [
            [
              { text: '💡 In Idee umwandeln', callback_data: `toidea:${docId}:${projectId}` },
              { text: '📂 Anderes Projekt', callback_data: 'change' }
            ]
          ]
        });
      } else {
        const ideaId = await captureIdea(link.owner_id, text, projectId);
        await tgAnswerCallback(cb.id, `Idee gespeichert in ${name}`);
        await tgEditText(chatId, messageId, `💡 Idee gespeichert in *${md(name)}*.\n\n_Aktives Projekt ist jetzt ${md(name)}._`, {
          inline_keyboard: [
            [
              { text: '📄 In Dokument umwandeln', callback_data: `todoc:${ideaId}:${projectId}` },
              { text: '📂 Anderes Projekt', callback_data: 'change' }
            ]
          ]
        });
      }
    } else {
      await tgAnswerCallback(cb.id);
    }
    return;
  }

  if (action === 'setactive') {
    await setActiveProject(link.owner_id, projectId);
    await tgAnswerCallback(cb.id, `Aktiv: ${name}`);
    await tgEditText(chatId, messageId, `📂 Aktives Projekt: *${md(name)}*\n_Neue Ideen/Dokumente landen ab jetzt hier._`);
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
