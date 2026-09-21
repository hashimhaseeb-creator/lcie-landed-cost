'use client';

/**
 * Client-side license helpers for the LCIE Landed Cost Engine paywall.
 * Green G(P)⁴™ Global Operations — monetization layer.
 *
 * The license key lives in localStorage and is sent on every LCIE API call via
 * the `x-license-key` header. `fetchWithLicense` wraps fetch to add it. The
 * Paywall UI calls `verifyKey` / `startFreePreview` to unlock the engine.
 */

const KEY = 'gp4-lcie-license';

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

export function getLicenseKey(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(KEY);
}

export function setLicenseKey(key: string | null) {
  if (typeof window === 'undefined') return;
  if (key) localStorage.setItem(KEY, key);
  else localStorage.removeItem(KEY);
}

/** fetch() wrapper that injects the x-license-key header on every LCIE call. */
export async function fetchWithLicense(url: string, opts: RequestInit = {}): Promise<Response> {
  const key = getLicenseKey();
  const headers = new Headers(opts.headers);
  if (key) headers.set('x-license-key', key);
  return fetch(url, { ...opts, headers });
}

/** Verify a license key (returns the plan + remaining quota). */
export async function verifyKey(key: string): Promise<LicenseState> {
  const r = await fetch('/api/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key }),
  });
  if (r.ok) return r.json();
  const e = await r.json().catch(() => ({}));
  return { valid: false, reason: e?.error ?? e?.detail ?? 'Invalid license' };
}

/** Start a free-preview license (3 calcs/month). */
export async function startFreePreview(): Promise<LicenseState> {
  const r = await fetch('/api/license/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'free-preview' }),
  });
  if (!r.ok) return { valid: false, reason: 'Could not start free preview' };
  return r.json();
}
