// ─────────────────────────────────────────────────────────────────────────────
// Ecosystem identity reuse.
//
// A Pronoia user who already connected Telegram in another product (e.g. "Life
// OS", the pronoia-next app backed by Firebase) should not have to re-link here.
// Their Telegram id lives in the ecosystem keyed to their identity; the common
// key across products is the EMAIL.
//
// Creator OS is decoupled from the ecosystem's Firebase, so this lookup goes
// through a small HTTP seam: POST { event, email } to ECOSYSTEM_LOOKUP_URL with a
// shared secret. pronoia-next's webhook adds a `lookup_telegram_by_email` handler
// that reads Firestore `users` where profile.email == email and returns its
// profile.telegramId. If the env vars are unset, this returns null and the user
// falls back to the manual /link code — nothing breaks.
// ─────────────────────────────────────────────────────────────────────────────

export interface EcosystemTelegram {
  telegramUserId: number;
  telegramUsername?: string;
}

export async function lookupEcosystemTelegramId(email: string): Promise<EcosystemTelegram | null> {
  const url = process.env.ECOSYSTEM_LOOKUP_URL;
  const secret = process.env.ECOSYSTEM_LOOKUP_SECRET;
  if (!email || !url || !secret) return null;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-bot-secret': secret },
      body: JSON.stringify({ event: 'lookup_telegram_by_email', email }),
    });
    if (!res.ok) return null;
    const data: any = await res.json().catch(() => ({}));
    const id = Number(data?.telegramId ?? data?.telegram_id);
    if (!id || Number.isNaN(id)) return null;
    return { telegramUserId: id, telegramUsername: data?.username ?? undefined };
  } catch (err) {
    console.warn('[telegram] ecosystem lookup failed:', (err as Error).message);
    return null;
  }
}
