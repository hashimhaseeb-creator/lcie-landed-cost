/**
 * Live FX rate service — fetches daily reference rates from the European
 * Central Bank via the public Frankfurter API (no API key), with a 1-hour
 * in-memory cache so repeated landed-cost recalcs don't re-hit the network.
 *
 *   getFxRate('USD', 'GBP') → 0.74166   (1 USD = 0.74166 GBP)
 *
 * Fallbacks: open.er-api.com, then a small set of static crisis rates.
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

interface FxResult {
  rate: number;            // 1 unit of `from` = `rate` units of `to`
  source: 'frankfurter' | 'er-api' | 'static' | 'identity';
  date: string;           // ISO date the rate was published
  fetchedAt: string;      // ISO timestamp we cached it
}

interface CacheEntry extends FxResult { expiresAt: number }
const cache = new Map<string, CacheEntry>();
const TTL_MS = 60 * 60 * 1000; // 1 hour

// Minimal static fallback (approximate, used only if both live APIs fail)
const STATIC: Record<string, number> = {
  'USD→GBP': 0.79, 'USD→EUR': 0.92, 'USD→CNY': 7.1, 'USD→PLN': 4.0, 'USD→SEK': 10.5,
  'USD→CZK': 23.0, 'USD→DKK': 6.85, 'USD→HUF': 360, 'USD→RON': 4.6, 'USD→BGN': 1.8,
  'USD→CAD': 1.36, 'USD→MXN': 18.5, 'USD→AUD': 1.5, 'USD→NZD': 1.65, 'USD→INR': 83,
  'USD→PKR': 278, 'USD→JPY': 150, 'USD→AED': 3.67, 'USD→SAR': 3.75, 'USD→TRY': 32,
  'USD→BRL': 5.4,
};

function key(from: string, to: string) {
  return `${from}→${to}`;
}

async function fetchFrankfurter(from: string, to: string): Promise<FxResult | null> {
  if (from === to) return { rate: 1, source: 'identity', date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
  try {
    const url = `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`;
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as { date?: string; rates?: Record<string, number> };
    const rate = data.rates?.[to];
    if (typeof rate !== 'number' || rate <= 0) return null;
    return { rate, source: 'frankfurter', date: data.date ?? new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

async function fetchErApi(from: string, to: string): Promise<FxResult | null> {
  if (from === to) return { rate: 1, source: 'identity', date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(`https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    const data = await res.json() as { rates?: Record<string, number>; time_last_update_utc?: string };
    const rate = data.rates?.[to];
    if (typeof rate !== 'number' || rate <= 0) return null;
    return { rate, source: 'er-api', date: (data.time_last_update_utc ?? new Date().toISOString()).slice(0, 10), fetchedAt: new Date().toISOString() };
  } catch {
    return null;
  }
}

/**
 * Get the live FX rate from one currency to another. Uses a 1-hour cache.
 * Tries Frankfurter (ECB) → open.er-api.com → static fallback → 1 (identity).
 */
export async function getFxRate(from: string, to: string): Promise<FxResult> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  const k = key(f, t);
  if (f === t) return { rate: 1, source: 'identity', date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };

  const cached = cache.get(k);
  if (cached && cached.expiresAt > Date.now()) {
    return cached;
  }

  let result = await fetchFrankfurter(f, t);
  if (!result) result = await fetchErApi(f, t);
  if (!result) {
    const staticRate = STATIC[k];
    if (staticRate) {
      result = { rate: staticRate, source: 'static', date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
    } else {
      result = { rate: 1, source: 'identity', date: new Date().toISOString().slice(0, 10), fetchedAt: new Date().toISOString() };
    }
  }

  cache.set(k, { ...result, expiresAt: Date.now() + TTL_MS });
  return result;
}

/** Clear the FX cache (used when re-running after a long pause / new day). */
export function clearFxCache() { cache.clear(); }
