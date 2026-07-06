import { supabase } from './supabase.js';

// Buyer-side purchase/access helpers for the public course viewer. Buyer identity
// reuses Supabase Auth (passwordless magic-link) — the buyer never sees the studio.
// FREE courses are self-granted client-side (RLS only permits price_cents = 0);
// PAID courses go through the server checkout (Stripe), which writes the entitlement
// via the service role in the webhook.

const uid = () => `ent-${crypto.randomUUID().slice(0, 12)}`;

/** Send a passwordless sign-in link, returning the buyer to this course afterwards. */
export async function sendBuyerMagicLink(email: string, slug: string): Promise<{ error?: string }> {
  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: `${window.location.origin}/c/${slug}` },
  });
  return { error: error?.message };
}

/** Self-grant access to a FREE course (RLS rejects this for any paid course). */
export async function grantFreeAccess(courseId: string): Promise<{ error?: string }> {
  const { error } = await supabase.from('course_entitlements').insert({ id: uid(), course_id: courseId, source: 'free' });
  return { error: error?.message };
}

/** Start Stripe checkout for a PAID course via the API server. Redirects on success. */
export async function startCheckout(courseId: string): Promise<{ error?: string }> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return { error: 'not-signed-in' };
  try {
    const res = await fetch(`/api/v1/courses/${courseId}/checkout`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ returnUrl: window.location.href }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.error || `checkout-failed-${res.status}` };
    }
    const { url } = await res.json();
    if (!url) return { error: 'no-checkout-url' };
    window.location.href = url;
    return {};
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export async function signOutBuyer(): Promise<void> {
  await supabase.auth.signOut();
}
