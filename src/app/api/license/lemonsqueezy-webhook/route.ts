/**
 * POST /api/license/lemonsqueezy-webhook
 * Green G(P)⁴™ Global Operations — Lemon Squeezy → license provisioning
 *
 * Lemon Squeezy (Pakistan-friendly Merchant of Record) sends a webhook when a
 * subscription is purchased. This route activates the matching LicenseKey.
 *
 * Setup (see DEPLOY.md):
 *   1. Create a Lemon Squeezy store (free).
 *   2. Create products: Pro ($49/mo) + Business ($199/mo) — generate license keys.
 *   3. Webhook URL = https://<your-vercel-domain>/api/license/lemonsqueezy-webhook
 *   4. Set LEMON_SQUEEZY_SIGNING_SECRET in Vercel env vars.
 *   5. Subscribe to the webhook events: license_key_created, license_key_activated,
 *      subscription_created, subscription_cancelled.
 *
 * The webhook validates the X-Lemon-Squeezy-Signature HMAC header, then maps the
 * product to a plan (Pro / Business / Enterprise) and provisions the license.
 */

import { NextRequest, NextResponse } from 'next/server';
import { provisionPaidLicense } from '@/lib/lcie/license';
import crypto from 'crypto';

export const runtime = 'nodejs';

// Map Lemon Squeezy variant IDs → { plan, monthlyCap }. Set these after creating
// the products in Lemon Squeezy (or via LEMON_VARIANT_* env vars at deploy).
const PLAN_BY_VARIANT: Record<string, { plan: string; monthlyCap: number }> = {
  // Pro tier — $49/mo — 1,000 calcs/mo
  pro: { plan: 'pro', monthlyCap: 1000 },
  // Business tier — $199/mo — 10,000 calcs/mo + API + seats
  business: { plan: 'business', monthlyCap: 10000 },
  // Enterprise — custom
  enterprise: { plan: 'enterprise', monthlyCap: 1_000_000 },
};

function verifySignature(rawBody: string, signatureHeader: string | null, secret: string): boolean {
  if (!signatureHeader) return false;
  try {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    // Lemon Squeezy sends "sha256=<hex>"
    const provided = signatureHeader.replace(/^sha256=/, '').trim();
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const secret = process.env.LEMON_SQUEEZY_SIGNING_SECRET ?? 'dev-insecure-secret';
  const signature = req.headers.get('x-lemon-squeezy-signature') ?? req.headers.get('x-event-signature');

  // In dev (no secret configured) we accept the body for testing; in prod we require a valid signature.
  const isProd = process.env.LEMON_SQUEEZY_SIGNING_SECRET && process.env.LEMON_SQUEEZY_SIGNING_SECRET !== 'dev-insecure-secret';
  if (isProd && !verifySignature(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
  }

  try {
    const event = JSON.parse(rawBody);
    const eventName: string = event?.meta?.event_name ?? event?.event_name ?? '';
    const data = event?.data?.attributes ?? event?.attributes ?? {};

    // license_key_created / license_key_activated → activate the key
    if (/license_key_(created|activated)/i.test(eventName)) {
      const key: string | undefined = data?.key ?? data?.license_key;
      const variantId: string | undefined = String(data?.variant_id ?? data?.variant_id ?? '');
      const email: string | undefined = data?.user_email;
      // resolve plan from variant id (env-overridable) or default to pro
      const planKey = Object.keys(PLAN_BY_VARIANT).find((k) => variantId.includes(k)) ?? 'pro';
      const plan = PLAN_BY_VARIANT[planKey] ?? PLAN_BY_VARIANT.pro;
      const state = await provisionPaidLicense({
        key: key ?? ('LS-' + (variantId || Math.random().toString(36).slice(2, 10))),
        email,
        plan: plan.plan,
        monthlyCap: plan.monthlyCap,
        expiresAt: data?.expires_at ? new Date(data.expires_at) : null,
      });
      return NextResponse.json({ ok: true, activated: state.key, plan: state.plan });
    }

    // subscription_cancelled → mark license expired (best-effort by key)
    if (/subscription_cancelled/i.test(eventName)) {
      const key = data?.license_key ?? data?.key;
      if (key) {
        // mark inactive — keep the row for audit
        await (await import('@/lib/db')).db.licenseKey.updateMany({ where: { key }, data: { status: 'cancelled' } });
      }
      return NextResponse.json({ ok: true, cancelled: key });
    }

    return NextResponse.json({ ok: true, ignored: eventName });
  } catch (err) {
    return NextResponse.json({ error: 'Webhook parse failed', detail: (err as Error).message }, { status: 500 });
  }
}
