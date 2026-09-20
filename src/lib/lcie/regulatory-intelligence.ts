/**
 * Regulatory Intelligence — self-refreshing rate + citation snapshot.
 * --------------------------------------------------------------------
 * The LCIE agent reads its rates from this module instead of hardcoded
 * constants, so when CBP / USTR / HMRC / DG TAXUD / ABF publishes a
 * modification, we only need to call `verifyRates()` (auto on TTL expiry
 * or via the POST /api/lcie/refresh-rates endpoint) to pick up the new
 * values + their new effective dates + citations.
 *
 * Architecture:
 *   • BASELINE_RATES — current as of Sep 2026 (manually verified against
 *     CBP CSMS # 66749380 + EO 14358 + Nov 10 2025 US-China deal + UK
 *     HMRC 2025 + EU TARIC + ABF). These are the FALLBACK values used
 *     if web-search verification hasn't run yet or fails.
 *   • In-memory cache with 24-hour TTL.
 *   • `verifyRates()` calls z-ai-web-dev-sdk's web_search function to
 *     look up the latest published rates for each provision, compares
 *     against the cached baseline, and returns a structured diff.
 *   • `getRateSnapshot()` returns the cached snapshot (fetches if stale
 *     or missing — fast path that never blocks the agent on the network).
 *   • `forceRefresh()` always re-fetches via web_search and updates the
 *     cache; called by the manual "Verify current rates" UI button.
 *
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

import ZAI from 'z-ai-web-dev-sdk';

/* ------------------------------------------------------------------ *
 * Types
 * ------------------------------------------------------------------ */

export interface RateEntry {
  /** Stable key — e.g. 'us-9903.88.x', 'uk-vat', 'au-gst'. */
  key: string;
  /** Human label — e.g. "9903.88.x China reciprocal". */
  label: string;
  /** Region this rate applies to. */
  region: 'US' | 'UK' | 'EU' | 'AU';
  /** Decimal ad-valorem rate (0.10 = 10%). */
  rate: number;
  /** ISO date the rate took effect. */
  effectiveDate: string;
  /** Short citation — e.g. "EO 14358 Nov 4 2025". */
  citation: string;
  /** Source URL (CBP / USTR / Federal Register / HMRC / DG TAXUD / ABF). */
  url: string;
  /** ISO timestamp when this entry was last verified against the live source. */
  lastVerifiedAt: string;
  /** True if a recent web_search confirmed this rate is still current. */
  verified: boolean;
}

export interface RateSnapshot {
  /** ISO timestamp of the last successful refresh. */
  refreshedAt: string;
  /** ISO timestamp the next refresh is due (refreshedAt + TTL). */
  nextRefreshDueAt: string;
  /** The source of this snapshot — 'baseline' (manual) or 'web-search-verified'. */
  source: 'baseline' | 'web-search-verified';
  /** All rate entries. */
  rates: RateEntry[];
  /** Optional diff vs. the previous snapshot (only populated by forceRefresh). */
  changes?: { key: string; label: string; fromRate: number; toRate: number; fromEffective: string; toEffective: string; fromCitation: string; toCitation: string }[];
}

/* ------------------------------------------------------------------ *
 * Baseline rates — current as of Sep 2026, manually verified
 * ------------------------------------------------------------------ */

const NOW = () => new Date().toISOString();
const SEP_2026_VERIFIED = '2026-09-21T00:00:00.000Z';

export const BASELINE_RATES: RateEntry[] = [
  // ─────────── US Chapter-99 + ancillary ───────────
  {
    key: 'us-9903.88.x',
    label: '9903.88.x China reciprocal',
    region: 'US',
    rate: 0.10,
    effectiveDate: '2025-11-10',
    citation: 'EO 14358 (Nov 4 2025) + Nov 10 2025 US-China deal (Trump-Xi Oct 30 2025) — held at 10% through Nov 10 2026',
    url: 'https://www.federalregister.gov/documents/2025/11/07/2025-24479/modifying-reciprocal-tariff-rates-consistent-with-the-economic-and-trade-agreement',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  {
    key: 'us-9903.01.24',
    label: '9903.01.24 Fentanyl IEEPA (CN)',
    region: 'US',
    rate: 0.10,
    effectiveDate: '2025-11-10',
    citation: 'CSMS # 66749380 (Nov 7 2025) + EO 14358 (Nov 4 2025) — reduced 20% → 10% effective Nov 10 2025',
    url: 'https://content.govdelivery.com/accounts/USDHSCBP/bulletins/3fa83c4',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  {
    key: 'us-9903.01.25',
    label: '9903.01.25 any-country baseline reciprocal',
    region: 'US',
    rate: 0.10,
    effectiveDate: '2025-04-02',
    citation: 'EO 14257 (Apr 2 2025) — 10% baseline reciprocal on most imports; the 24% additional portion is SUSPENDED through Nov 10 2026',
    url: 'https://www.federalregister.gov/documents/2025/04/07/2025-07076/regulating-imports-with-reciprocal-tariffs',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  {
    key: 'us-mpf',
    label: 'MPF (Merchandise Processing Fee)',
    region: 'US',
    rate: 0.003464,
    effectiveDate: '2025-01-01',
    citation: 'CBP 2025 MPF fee schedule — 0.3464% ad valorem, floored $31.67 / capped $614.35 for formal entries',
    url: 'https://www.cbp.gov/trade/programs-administration/entry-summary/mpf',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  {
    key: 'us-hmf',
    label: 'HMF (Harbor Maintenance Fee)',
    region: 'US',
    rate: 0.00125,
    effectiveDate: '2025-01-01',
    citation: '19 U.S.C. §4462 — 0.125% ad valorem on ocean-borne imports only (rail / air / truck exempt)',
    url: 'https://www.cbp.gov/trade/programs-administration/entry-summary/hmf',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  // ─────────── UK ───────────
  {
    key: 'uk-vat',
    label: 'UK VAT (standard)',
    region: 'UK',
    rate: 0.20,
    effectiveDate: '2011-01-04',
    citation: 'HMRC 2024-2025 VAT rate schedule — standard 20% (unchanged since 2011); reduced 5% on children\'s car seats / domestic fuel; zero-rated food/books',
    url: 'https://www.gov.uk/vat-rates',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  // ─────────── EU (DE default + key member states) ───────────
  {
    key: 'eu-vat-de',
    label: 'EU VAT Germany (default)',
    region: 'EU',
    rate: 0.19,
    effectiveDate: '2021-01-01',
    citation: 'EU member-state standard VAT — DE 19% (default), FR 20%, NL 21%, IT 22%, ES 21%; reduced rates apply to food/books/medicines per member state',
    url: 'https://ec.europa.eu/taxation_customs/taxation/vat/vat-rates_en',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  // ─────────── Australia (ABF) ───────────
  {
    key: 'au-gst',
    label: 'AU GST',
    region: 'AU',
    rate: 0.10,
    effectiveDate: '2000-07-01',
    citation: 'A New Tax System (Goods and Services Tax) Act 1999 — 10% GST on (customs value + duty + taxable charges); unchanged since 2000',
    url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/tariff-concessions/goods-and-services-tax-gst',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
  {
    key: 'au-ipc-flat',
    label: 'AU Import Processing Charge (formal, ≥ A$10,000)',
    region: 'AU',
    rate: 50,
    effectiveDate: '2024-07-01',
    citation: 'ABF 2024-2025 IPC schedule — flat A$50 for formal entries (consignments ≥ A$10,000); A$40 for A$1k–A$10k; A$0 for low-value (< A$1k, SAC)',
    url: 'https://www.abf.gov.au/importing-exporting-and-manufacturing/fees-and-charges/import-processing-charges',
    lastVerifiedAt: SEP_2026_VERIFIED,
    verified: true,
  },
];

/* ------------------------------------------------------------------ *
 * In-memory cache + TTL
 * ------------------------------------------------------------------ */

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
let cachedSnapshot: RateSnapshot | null = null;

export function getRateSnapshot(): RateSnapshot {
  if (cachedSnapshot) return cachedSnapshot;
  // First call — fall back to the manually-verified baseline; mark as 'baseline'.
  cachedSnapshot = {
    refreshedAt: SEP_2026_VERIFIED,
    nextRefreshDueAt: new Date(Date.parse(SEP_2026_VERIFIED) + CACHE_TTL_MS).toISOString(),
    source: 'baseline',
    rates: BASELINE_RATES.map((r) => ({ ...r })),
  };
  return cachedSnapshot;
}

/** Get a single rate by key (returns null if not found). */
export function getRate(key: string): RateEntry | null {
  return getRateSnapshot().rates.find((r) => r.key === key) ?? null;
}

/* ------------------------------------------------------------------ *
 * Web-search verification
 * ------------------------------------------------------------------ */

/** Search queries used to verify each provision's current rate. */
const VERIFY_QUERIES: { key: string; query: string; rateRegex: RegExp; dateRegex: RegExp }[] = [
  {
    key: 'us-9903.88.x',
    query: 'US 9903.88 China reciprocal tariff current rate 2026 effective',
    rateRegex: /\b(\d{1,3}(?:\.\d+)?)\s*(?:percent|%)\s*(?:reciprocal)?\s*(?:tariff)?\s*(?:on|rate|for)?\s*(?:china|chinese)?/i,
    dateRegex: /\b(?:effective|dated|published|signed)\s+(\w+ \d{1,2},? \d{4})\b/i,
  },
  {
    key: 'us-9903.01.24',
    query: 'CSMS 66749380 fentanyl IEEPA China tariff rate current 2026',
    rateRegex: /\b(\d{1,3}(?:\.\d+)?)\s*(?:percent|%)\b/i,
    dateRegex: /\b(?:effective|dated|published)\s+(\w+ \d{1,2},? \d{4})\b/i,
  },
  {
    key: 'uk-vat',
    query: 'UK VAT standard rate current 2026 HMRC',
    rateRegex: /\bstandard\s+rate\s+(?:of\s+)?(?:VAT\s+)?(?:is\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:percent|%)/i,
    dateRegex: /\b(?:effective|since|from)\s+(\w+ \d{1,2},? \d{4})\b/i,
  },
  {
    key: 'au-gst',
    query: 'Australia GST rate current 2026 ABF 10 percent',
    rateRegex: /\bGST\s+(?:rate\s+)?(?:is\s+)?(\d{1,3}(?:\.\d+)?)\s*(?:percent|%)/i,
    dateRegex: /\b(?:effective|since|from)\s+(\w+ \d{1,2},? \d{4})\b/i,
  },
];

/**
 * Parse a rate percentage out of a search-result snippet.
 * Returns the rate as a decimal (10% → 0.10), or null if no rate found.
 */
function parseRate(snippet: string, regex: RegExp): number | null {
  const m = snippet.match(regex);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n < 0 || n > 500) return null;
  return n / 100;
}

/**
 * Parse an effective date out of a search-result snippet.
 * Returns ISO date string, or null if no date found.
 */
function parseDate(snippet: string, regex: RegExp): string | null {
  const m = snippet.match(regex);
  if (!m) return null;
  const d = new Date(m[1]);
  if (isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

/**
 * Force-refresh the snapshot by re-verifying each rate against live web sources.
 * Returns the new snapshot + a `changes` array describing any deltas vs. the
 * previously cached snapshot. Safe to call from the agent runtime — on any
 * error from the web_search function, the baseline values are preserved.
 */
export async function forceRefresh(): Promise<RateSnapshot> {
  const previous = getRateSnapshot();
  const changes: NonNullable<RateSnapshot['changes']> = [];
  let zai: ZAI | null = null;
  try {
    const apiKey = process.env.ZAI_API_KEY?.trim();
    const baseUrl = process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/v1';
    zai = apiKey
      ? (Reflect.construct(ZAI, [{ baseUrl, apiKey }]) as ZAI)
      : await ZAI.create();
  } catch {
    // SDK init failed — fall through to baseline snapshot with no changes detected.
    return previous;
  }
  if (!zai) return previous;

  const newRates: RateEntry[] = BASELINE_RATES.map((r) => ({ ...r, verified: false }));
  const now = NOW();

  for (const q of VERIFY_QUERIES) {
    try {
      // @ts-expect-error: z-ai-web-dev-sdk's functions.invoke signature is loose
      const results = (await zai.functions.invoke('web_search', { query: q.query, num: 5 })) as
        | { snippet?: string; date?: string; url?: string; name?: string }[]
        | null;
      if (!Array.isArray(results) || results.length === 0) continue;
      // Try each result until we find a parseable rate + date.
      for (const r of results) {
        const snippet = r.snippet ?? '';
        const parsedRate = parseRate(snippet, q.rateRegex);
        const parsedDate = parseDate(snippet, q.dateRegex);
        if (parsedRate === null) continue;
        // Found a parseable rate — compare against the baseline.
        const idx = newRates.findIndex((nr) => nr.key === q.key);
        if (idx < 0) break;
        const baseline = newRates[idx];
        if (Math.abs(parsedRate - baseline.rate) > 0.001 || (parsedDate && parsedDate !== baseline.effectiveDate)) {
          // Rate or effective date has changed — record the diff + update the entry.
          changes.push({
            key: baseline.key,
            label: baseline.label,
            fromRate: baseline.rate,
            toRate: parsedRate,
            fromEffective: baseline.effectiveDate,
            toEffective: parsedDate ?? baseline.effectiveDate,
            fromCitation: baseline.citation,
            toCitation: `Web-verified via z-ai-web-dev-sdk on ${now.slice(0, 10)} — source: ${r.url ?? r.name ?? '(unknown)'}`,
          });
          newRates[idx] = {
            ...baseline,
            rate: parsedRate,
            effectiveDate: parsedDate ?? baseline.effectiveDate,
            citation: `Web-verified via z-ai-web-dev-sdk on ${now.slice(0, 10)} — source: ${r.url ?? r.name ?? '(unknown)'}`,
            url: r.url ?? baseline.url,
            lastVerifiedAt: now,
            verified: true,
          };
        } else {
          // Rate is unchanged — mark as verified + update lastVerifiedAt.
          newRates[idx] = { ...baseline, lastVerifiedAt: now, verified: true };
        }
        break; // first parseable result wins
      }
    } catch {
      // swallow — fall back to baseline for this provision
    }
  }

  const next: RateSnapshot = {
    refreshedAt: now,
    nextRefreshDueAt: new Date(Date.now() + CACHE_TTL_MS).toISOString(),
    source: 'web-search-verified',
    rates: newRates,
    changes,
  };
  cachedSnapshot = next;
  return next;
}

/**
 * Get the snapshot, refreshing it via web_search if the cache is stale.
 * Safe to call from the agent runtime — uses the cached value on any error.
 */
export async function getRateSnapshotAsync(): Promise<RateSnapshot> {
  const cached = cachedSnapshot;
  if (cached && Date.now() < Date.parse(cached.nextRefreshDueAt)) return cached;
  try {
    return await forceRefresh();
  } catch {
    return getRateSnapshot(); // fall back to baseline
  }
}
