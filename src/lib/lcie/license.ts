/**
 * LCIE License Verification + Usage Metering Module
 * Green G(P)⁴™ Global Operations — Protected Operational Pipeline Utility
 *
 * - verifyLicense(key) → looks up the LicenseKey, rolls over the monthly
 *   usage window (except for free-trial keys which are one-time), returns
 *   the plan + remaining quota.
 * - consumeLicense(key, action) → increments usage + records a UsageEvent.
 * - provisionFreePreview() → issues a free-tier key (1 calc, one-time trial).
 * - provisionPaidLicense(opts) → used by the Lemon Squeezy/Gumroad webhook.
 */

import { db } from '@/lib/db';

export interface LicenseState {
  valid: boolean;
  key?: string;
  plan?: string;
  status?: string;
  monthlyCap?: number;
  usedCount?: number;
  remaining?: number;
  reason?: string;
}

const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

/** Look up a license key and return its plan + remaining monthly quota. */
export async function verifyLicense(rawKey?: string | null): Promise<LicenseState> {
  const key = (rawKey ?? '').trim();
  if (!key) return { valid: false, reason: 'No license key provided.' };
  const lic = await db.licenseKey.findUnique({ where: { key } });
  if (!lic) return { valid: false, reason: 'License key not recognised.' };
  if (lic.status !== 'active') return { valid: false, reason: `License ${lic.status}.` };
  if (lic.expiresAt && lic.expiresAt.getTime() < Date.now()) {
    return { valid: false, reason: 'License expired.' };
  }
  // Roll over the monthly usage window — but NOT for the free-trial tier.
  const mk = monthKey();
  let usedCount = lic.usedCount;
  if (lic.usageMonth !== mk && lic.plan !== 'free') {
    usedCount = 0;
    await db.licenseKey.update({ where: { id: lic.id }, data: { usedCount: 0, usageMonth: mk } });
  }
  const remaining = Math.max(0, lic.monthlyCap - usedCount);
  return {
    valid: true, key: lic.key, plan: lic.plan, status: lic.status,
    monthlyCap: lic.monthlyCap, usedCount, remaining,
  };
}

/** Increment usage for a license (one LCIE calculation). */
export async function consumeLicense(rawKey: string, action: string, detail?: { poId?: string; detail?: string }): Promise<LicenseState> {
  const state = await verifyLicense(rawKey);
  if (!state.valid) return state;
  if ((state.remaining ?? 0) <= 0) {
    return { ...state, valid: false, reason: 'Monthly calculation quota exhausted — upgrade to continue.' };
  }
  const mk = monthKey();
  const lic = await db.licenseKey.update({
    where: { key: rawKey.trim() },
    data: { usedCount: { increment: 1 }, usageMonth: mk },
  });
  await db.usageEvent.create({
    data: { licenseKeyId: lic.id, action, poId: detail?.poId ?? null, detail: detail?.detail ?? null },
  });
  const remaining = Math.max(0, lic.monthlyCap - (lic.usedCount + 1));
  return {
    valid: true, key: lic.key, plan: lic.plan, status: lic.status,
    monthlyCap: lic.monthlyCap, usedCount: lic.usedCount + 1, remaining,
  };
}

/** Issue a free-preview license (1 calc, one-time trial — no monthly reset). */
export async function provisionFreePreview(): Promise<LicenseState> {
  const key = 'GP4-FREE-' + Math.random().toString(36).slice(2, 10).toUpperCase();
  const lic = await db.licenseKey.create({
    data: { key, plan: 'free', status: 'active', monthlyCap: 1, usedCount: 0, usageMonth: monthKey() },
  });
  return { valid: true, key: lic.key, plan: 'free', status: 'active', monthlyCap: 1, usedCount: 0, remaining: 1 };
}

/** Used by the Lemon Squeezy / Gumroad webhook to create/activate a paid license. */
export async function provisionPaidLicense(opts: { key: string; email?: string; plan: string; monthlyCap: number; expiresAt?: Date | null }): Promise<LicenseState> {
  const existing = await db.licenseKey.findUnique({ where: { key: opts.key } });
  if (existing) {
    const lic = await db.licenseKey.update({
      where: { id: existing.id },
      data: { plan: opts.plan, status: 'active', monthlyCap: opts.monthlyCap, expiresAt: opts.expiresAt ?? null, email: opts.email ?? existing.email },
    });
    return { valid: true, key: lic.key, plan: lic.plan, status: lic.status, monthlyCap: lic.monthlyCap, usedCount: lic.usedCount, remaining: Math.max(0, lic.monthlyCap - lic.usedCount) };
  }
  const lic = await db.licenseKey.create({
    data: { key: opts.key, email: opts.email, plan: opts.plan, status: 'active', monthlyCap: opts.monthlyCap, usedCount: 0, usageMonth: monthKey(), expiresAt: opts.expiresAt ?? null },
  });
  return { valid: true, key: lic.key, plan: lic.plan, status: lic.status, monthlyCap: lic.monthlyCap, usedCount: 0, remaining: lic.monthlyCap };
}
