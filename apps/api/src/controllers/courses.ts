import { Router, type Request, type Response } from 'express';
import crypto from 'crypto';
import { supabaseAdmin } from '../supabase.js';

// ─────────────────────────────────────────────────────────────────────────────
// Course monetization (Phase 3) — platform as Merchant of Record.
//
// The platform holds ONE Stripe account; creators never integrate Stripe. Buyers
// pay the platform; on a completed payment the webhook writes the buyer's
// entitlement (service role, bypassing RLS) plus a `creator_earnings` ledger row
// with the creator's net share.
//
// Deliberately dependency-free: Stripe is called over its REST API with fetch and
// the webhook signature is verified with node:crypto — no stripe SDK, matching the
// codebase's build-our-own ethos. Everything is env-guarded, so the app runs fine
// with Stripe unconfigured (free courses still work via client self-grant).
// ─────────────────────────────────────────────────────────────────────────────

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY || '';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';
// Platform commission in basis points (1000 = 10%). The creator keeps the rest.
const PLATFORM_FEE_BPS = Number(process.env.PLATFORM_FEE_BPS || '1000');

const uid = (p: string) => `${p}-${crypto.randomUUID().slice(0, 12)}`;

/** Minimal Stripe REST call (application/x-www-form-urlencoded). */
async function stripe(path: string, form: Record<string, string>): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.error?.message || `stripe-${res.status}`);
  return body;
}

export const coursesRouter = Router();

// POST /api/v1/courses/:id/checkout — create a Stripe Checkout Session for a paid course.
coursesRouter.post('/:id/checkout', async (req: Request, res: Response) => {
  try {
    if (!STRIPE_SECRET) return res.status(501).json({ error: 'payment-not-configured' });

    // Authenticate the buyer from their Supabase JWT.
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await supabaseAdmin.auth.getUser(token);
    const user = userData?.user;
    if (userErr || !user) return res.status(401).json({ error: 'not-signed-in' });

    const { data: course } = await supabaseAdmin.from('courses').select('*').eq('id', req.params.id).maybeSingle();
    if (!course || course.status !== 'published') return res.status(404).json({ error: 'course-not-found' });
    if (!course.price_cents || course.price_cents <= 0) return res.status(400).json({ error: 'course-is-free' });

    const returnUrl: string = req.body?.returnUrl || `${req.headers.origin || ''}/c/${course.slug}`;
    const orderId = uid('ord');

    // Record a pending order first, so the webhook can reconcile against it.
    await supabaseAdmin.from('orders').insert({
      id: orderId, course_id: course.id, buyer_user_id: user.id, buyer_email: user.email,
      amount_cents: course.price_cents, currency: course.currency, status: 'pending',
    });

    const session = await stripe('checkout/sessions', {
      mode: 'payment',
      success_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}purchase=success`,
      cancel_url: `${returnUrl}${returnUrl.includes('?') ? '&' : '?'}purchase=cancelled`,
      'customer_email': user.email || '',
      'client_reference_id': course.id,
      'line_items[0][quantity]': '1',
      'line_items[0][price_data][currency]': course.currency || 'eur',
      'line_items[0][price_data][unit_amount]': String(course.price_cents),
      'line_items[0][price_data][product_data][name]': course.title || 'Course',
      'metadata[course_id]': course.id,
      'metadata[order_id]': orderId,
      'metadata[buyer_user_id]': user.id,
      'metadata[owner_id]': course.owner_id || '',
    });

    await supabaseAdmin.from('orders').update({ stripe_session_id: session.id }).eq('id', orderId);
    return res.json({ url: session.url });
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : 'checkout-error' });
  }
});

// Verify a Stripe webhook signature (scheme: `t=<ts>,v1=<hmac>`), no SDK needed.
function verifyStripeSignature(rawBody: Buffer, sigHeader: string): any | null {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map(kv => kv.split('=')));
    const signedPayload = `${parts.t}.${rawBody.toString('utf8')}`;
    const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
    const a = Buffer.from(expected); const b = Buffer.from(parts.v1 || '');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    return JSON.parse(rawBody.toString('utf8'));
  } catch { return null; }
}

// POST /api/v1/stripe/webhook — mounted with a RAW body parser in main.ts.
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!STRIPE_WEBHOOK_SECRET) { res.status(501).send('webhook-not-configured'); return; }
  const sig = req.headers['stripe-signature'] as string | undefined;
  const event = sig ? verifyStripeSignature(req.body as Buffer, sig) : null;
  if (!event) { res.status(400).send('invalid-signature'); return; }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const m = s.metadata || {};
    const gross = s.amount_total ?? 0;
    const fee = Math.round((gross * PLATFORM_FEE_BPS) / 10000);
    try {
      await supabaseAdmin.from('orders').update({ status: 'paid', stripe_payment_intent: s.payment_intent }).eq('id', m.order_id);
      // Grant access (idempotent on the (course_id, buyer_user_id) unique key).
      await supabaseAdmin.from('course_entitlements').upsert(
        { id: uid('ent'), course_id: m.course_id, buyer_user_id: m.buyer_user_id, buyer_email: s.customer_email, source: 'purchase', order_id: m.order_id },
        { onConflict: 'course_id,buyer_user_id' },
      );
      await supabaseAdmin.from('creator_earnings').insert(
        { id: uid('earn'), owner_id: m.owner_id, course_id: m.course_id, order_id: m.order_id, gross_cents: gross, platform_fee_cents: fee, net_cents: gross - fee },
      );
    } catch (e) {
      console.error('[stripe webhook] fulfilment error', e);
      res.status(500).send('fulfilment-error'); return;
    }
  }
  res.json({ received: true });
}
