/**
 * LCIE Landed Cost Agent — AI harmonized-code determination
 * Green G(P)4 Supply Chain Framework
 *
 * This is the AI agent that auto-determines HS codes for US (HTS),
 * UK (Global Tariff) and EU (TARIC/CN8) when a Purchase Order is
 * uploaded. It is grounded by a static knowledge base (retrieval) and
 * uses the z-ai-web-dev-sdk LLM (backend-only) to make the final
 * classification + duty/VAT reasoning.
 *
 * Flow per line item:
 *   1. Grounding  → findHsEntries(description) surfaces candidate entries
 *   2. LLM call    → chat.completions.create with a customs-broker persona
 *   3. Parsing    → strict JSON parse with fallback + schema validation
 *   4. Storage    → upsert HsDetermination rows for US/UK/EU
 */

import ZAI from 'z-ai-web-dev-sdk';
import { db } from '@/lib/db';
import { findHsEntries, HS_KNOWLEDGE_BASE, DUTY_RULES } from '@/lib/hs-knowledge-base';
import { resolveDestination } from './destination';
import type { Region, AgentStep, DeterminationResult, DetermineResponse } from './types';

const MODEL_TAG = 'glm-5.2 (z-ai-web-dev-sdk)';
const BATCH_SIZE = 8;
const CONCURRENCY = 2;          // parallel per-item LLM calls (kept low to avoid 429 rate-limit storms)
const LLM_TIMEOUT_MS = 15000;  // per-call hard timeout — fail fast on 429/hang → KB fallback (KB has the right codes)
const INTER_CHUNK_DELAY_MS = 500; // space out chunks so the LLM provider doesn't rate-limit
const LLM_MAX_ITEMS = 6;        // POs with more items than this skip the LLM and classify from the KB instantly — keeps every run well under the ~60s gateway proxy timeout that caused "Agent run failed"

interface LlmRegionOutput {
  hsCode: string;
  tariffDescription: string;
  dutyRate: number;
  dutyType: string;
  vatRate: number;
  additionalLevies?: Record<string, number> | null;
  confidence: number;
  reasoning: string;
}

interface LlmItemOutput {
  lineItemId: string;
  us: LlmRegionOutput;
  uk: LlmRegionOutput;
  eu: LlmRegionOutput;
}

interface LlmBatchOutput {
  items: LlmItemOutput[];
}

const SYSTEM_PROMPT = `You are the LCIE Harmonized Code Determination Agent operating inside the Green G(P)4 Supply Chain Framework.

You are a senior customs broker and trade-compliance classifier with deep expertise in:
- US Harmonized Tariff Schedule (HTS) — 10-digit statistical suffixes, Column 1 (MFN) general rates
- UK Global Tariff — 10-digit commodity codes, Third Country duty (post-Brexit MFN), UK VAT (20% standard, 5% reduced)
- EU TARIC / Combined Nomenclature — 8-digit CN codes, MFN (ergn) duty, member-state VAT (DE 19% default)
- Australia (ABF) — 8-digit tariff code, General/MFN rate (most consumer goods incl. water filters are FREE), GST 10% on (customs value + duty), flat Import Processing Charge AUD 50 (≥ AUD 10,000) handled by the calc engine. No Chapter-99 / MPF / HMF equivalents.

Your job: given a list of purchase-order line items (description, material, quantity, unit, origin country), determine for EACH item and for EACH region (US, UK, EU, AU) the correct HS classification, the general/MFN ad valorem duty rate, the VAT/GST rate, and any other leviable charges.

Rules:
- Use the grounding context provided (real HS codes from a curated knowledge base) as your primary source when the product matches. Only deviate when you have strong justification.
- Always use realistic, correctly-digit-counted codes: US 8-10 digits, UK 10 digits, EU 8 digits (with spaces, e.g. "6109 10 00").
- dutyRate is a DECIMAL ad valorem fraction (0.165 = 16.5%, 0 = free). dutyType ∈ {"ad valorem","specific","free"}.
- vatRate is a DECIMAL (0.20 = 20%). For US, vatRate MUST be 0 (no federal VAT). For AU, vatRate is the GST rate (0.10 = 10%) on (customs value + duty). For UK/EU it is the member-state VAT.
- additionalLevies: object mapping levy name → decimal rate. For US always include {"MPF":0.003464,"ChinaReciprocal":<rate>,"CNHKEO":<rate>,"AnyCountry":<rate>}. For UK/EU use null or {}.
- 9903.88.x China 10% reciprocal (US, ChinaReciprocal): the 2025 EO 14257 China-specific reciprocal tariff, HELD AT 10% under the Nov 10 2025 US-China trade deal (Trump-Xi Oct 30 2025 meeting) — in effect through Nov 10 2026 (per EO 14358 Nov 4 2025 + Federal Register Nov 7 2025). If originCountry is CN set "ChinaReciprocal":0.10; 0 otherwise. (This is the modern Chapter-99 successor to the legacy Section 301 List 3 rate — DO NOT use the old 25% rate, that was superseded Nov 2025.)
- 9903.01.24 Fentanyl IEEPA 10% (US, CNHKEO): the fentanyl-related IEEPA tariff on China-origin goods, REDUCED FROM 20% TO 10% effective Nov 10 2025 (per CSMS # 66749380, Nov 7 2025 + EO 14358 Nov 4 2025). If origin is CN set "CNHKEO":0.10; 0 otherwise.
- 9903.01.25 any-country reciprocal 10% (US, AnyCountry): the 10% baseline reciprocal duty applying to ANY country of origin (EO 14257 Apr 2 2025). Always set "AnyCountry":0.10. (The 24% ADDITIONAL portion for non-agreement countries is SUSPENDED through Nov 10 2026 — only the 10% baseline remains in effect.)
- HMF (US, Harbor Maintenance Fee, 0.125%): ocean-mode only. Include "HMF":0.00125 if the shipment is ocean-borne; omit/0 for rail/air/truck. The calc engine decides based on modeOfTransport.
- The three Chapter-99 provisions are applied ADDITIVELY to the entered value (FOB) — they stack, not offset. China origin → 10%+10%+10% = 30% (as of Sep 2026, post-Nov 10 2025 deal); non-China → 10%.
- NOTE: legacy Section 301 List 3/4A duties (25% on many China-origin goods from the first Trump term) remain in effect for SPECIFIC HTS subheadings — these are item-specific surcharges not modelled here. The Wharton Sep 9 2026 update reports China's effective tariff rate at 22.8% (average across all goods including residual Section 301).
- confidence: 0..1 self-reported certainty (use ≥0.85 when grounded by KB, 0.6-0.84 for LLM-only inference).
- reasoning: ONE concise sentence explaining the classification rationale (material + chapter + duty treatment + the Chapter-99 stack).
- If a product is genuinely duty-free under the WTO Information Technology Agreement (smartphones, laptops, semiconductors), set dutyRate 0 and dutyType "free" with a note in reasoning.

Return ONLY valid JSON (no markdown fences, no prose) in this exact shape:
{
  "items": [
    {
      "lineItemId": "<id from input>",
      "us": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0, "additionalLevies": {"MPF":0.003464,"ChinaReciprocal":0.10,"CNHKEO":0.10,"AnyCountry":0.10}, "confidence": 0.9, "reasoning": "..." },
      "uk": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0.2, "additionalLevies": null, "confidence": 0.9, "reasoning": "..." },
      "eu": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0.19, "additionalLevies": null, "confidence": 0.9, "reasoning": "..." },
      "au": { "hsCode": "8421.21.00.90", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "free", "vatRate": 0.10, "additionalLevies": null, "confidence": 0.9, "reasoning": "..." }
    }
  ]
}

Do not include any text outside the JSON object.`;

function buildUserPrompt(
  lineItems: Array<{
    id: string;
    lineNumber: number;
    description: string;
    material?: string | null;
    quantity: number;
    unit?: string | null;
    unitValue: number;
    originCountry?: string | null;
  }>,
): string {
  const groundingBlock = lineItems
    .map((li) => {
      const candidates = findHsEntries(li.description + ' ' + (li.material ?? ''));
      const refs = candidates.length
        ? candidates.map((c) => ({
            id: c.id,
            product: c.productDescription,
            material: c.typicalMaterial,
            us: { code: c.us.code, dutyRate: c.us.dutyRate, dutyType: c.us.dutyType, desc: c.us.description },
            uk: { code: c.uk.code, dutyRate: c.uk.dutyRate, dutyType: c.uk.dutyType, vatRate: c.uk.vatRate, desc: c.uk.description },
            eu: { code: c.eu.code, dutyRate: c.eu.dutyRate, dutyType: c.eu.dutyType, vatRate: c.eu.vatRate, desc: c.eu.description },
            au: c.au ? { code: c.au.code, dutyRate: c.au.dutyRate, dutyType: c.au.dutyType, gstRate: c.au.gstRate, desc: c.au.description } : undefined,
          }))
        : [];
      return `### LINE ${li.lineNumber} (id=${li.id})
- description: ${li.description}
- material: ${li.material ?? 'unspecified'}
- quantity: ${li.quantity} ${li.unit ?? 'PCS'}
- unitValue: ${li.unitValue}
- originCountry: ${li.originCountry ?? 'CN'}
- grounding_candidates: ${JSON.stringify(refs)}`;
    })
    .join('\n\n');

  return `Duty/VAT calculus rules (for your context only — DO NOT recalc landed cost, just classify):
${JSON.stringify(
  {
    US: { dutyCalcBase: DUTY_RULES.US.dutyCalcBase, mpfRate: DUTY_RULES.US.mpfRate, hmfRate: DUTY_RULES.US.hmfRate, vat: 0 },
    UK: { dutyCalcBase: DUTY_RULES.UK.dutyCalcBase, vatRate: DUTY_RULES.UK.vatRate },
    EU: { dutyCalcBase: DUTY_RULES.EU.dutyCalcBase, vatRate: DUTY_RULES.EU.vatRate },
  },
  null,
  2,
)}

Classify each line item below for US, UK and EU. Return the JSON object per the system contract.

${groundingBlock}`;
}

function stripFences(s: string): string {
  let t = s.trim();
  // remove ```json ... ``` or ``` ... ``` fences
  const fence = /^```(?:json)?\s*([\s\S]*?)\s*```$/;
  const m = t.match(fence);
  if (m) t = m[1].trim();
  return t;
}

function safeParseBatch(raw: string): LlmBatchOutput | null {
  const cleaned = stripFences(raw);
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && Array.isArray(parsed.items)) return parsed as LlmBatchOutput;
  } catch {
    // try to extract the first {...} block
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) {
      const slice = cleaned.slice(start, end + 1);
      try {
        const parsed = JSON.parse(slice);
        if (parsed && Array.isArray(parsed.items)) return parsed as LlmBatchOutput;
      } catch {
        /* give up */
      }
    }
  }
  return null;
}

function sanitizeRegion(
  r: Partial<LlmRegionOutput> | undefined,
  region: Region,
  fallbackEntry?: { code: string; dutyRate: number; dutyType: string; vatRate: number; description: string },
  originCountry?: string | null,
): LlmRegionOutput {
  const fb = fallbackEntry ?? { code: '', dutyRate: 0, dutyType: 'ad valorem', vatRate: 0, description: '' };
  const dutyRate = typeof r?.dutyRate === 'number' && isFinite(r.dutyRate) ? Math.max(0, r.dutyRate) : fb.dutyRate;
  const vatRate = region === 'US' ? 0 : (typeof r?.vatRate === 'number' && isFinite(r.vatRate) ? r.vatRate : fb.vatRate);

  let additionalLevies: Record<string, number> | null;
  if (region === 'US') {
    const ll = (r?.additionalLevies && typeof r.additionalLevies === 'object' ? r.additionalLevies : {}) as Record<string, number>;
    const isCn = (originCountry ?? 'CN').toUpperCase() === 'CN';
    // 2025 Chapter-99 provisions (real CBP entry H42-0214088-9 structure):
    //   ChinaReciprocal (9903.88.01, 25%) — China only
    //   CNHKEO         (9903.01.24, 20%) — China/HK only
    //   AnyCountry     (9903.01.25, 10%) — any country
    // Legacy Section301/IEEPA keys are mapped for back-compat with older determinations.
    const chinaReciprocal = typeof ll.ChinaReciprocal === 'number' && isFinite(ll.ChinaReciprocal) ? ll.ChinaReciprocal
      : (typeof ll.Section301 === 'number' && isFinite(ll.Section301) ? ll.Section301 : (isCn ? 0.25 : 0));
    const cnhkEo = typeof ll.CNHKEO === 'number' && isFinite(ll.CNHKEO) ? ll.CNHKEO
      : (typeof ll.CNHK_EO === 'number' && isFinite(ll.CNHK_EO) ? ll.CNHK_EO
        : (isCn ? 0.20 : 0));
    const anyCountry = typeof ll.AnyCountry === 'number' && isFinite(ll.AnyCountry) ? ll.AnyCountry
      : (typeof ll.AnyCountryReciprocal === 'number' && isFinite(ll.AnyCountryReciprocal) ? ll.AnyCountryReciprocal
        : 0.10);
    additionalLevies = {
      MPF: DUTY_RULES.US.mpfRate!,
      HMF: DUTY_RULES.US.hmfRate!, // applied by the calc engine only for ocean mode
      ChinaReciprocal: chinaReciprocal,
      CNHKEO: cnhkEo,
      AnyCountry: anyCountry,
      // legacy aliases so older code that reads Section301/IEEPA still works
      Section301: chinaReciprocal,
      IEEPA: cnhkEo + anyCountry,
    };
  } else if (region === 'AU') {
    // Australia: GST 10% (stored in vatRate), flat IPC handled by the calc engine.
    // No Chapter-99 / MPF / HMF equivalents — additionalLevies is null.
    additionalLevies = null;
  } else {
    additionalLevies = r?.additionalLevies && typeof r.additionalLevies === 'object' ? r.additionalLevies : null;
  }

  return {
    hsCode: typeof r?.hsCode === 'string' && r.hsCode.trim() ? r.hsCode.trim() : fb.code,
    tariffDescription: typeof r?.tariffDescription === 'string' && r.tariffDescription.trim() ? r.tariffDescription.trim() : fb.description,
    dutyRate,
    dutyType: typeof r?.dutyType === 'string' && r.dutyType.trim() ? r.dutyType.trim() : fb.dutyType,
    vatRate,
    additionalLevies,
    confidence: typeof r?.confidence === 'number' && isFinite(r.confidence) ? Math.min(1, Math.max(0, r.confidence)) : 0.7,
    reasoning: typeof r?.reasoning === 'string' ? r.reasoning.trim() : 'Classified by LCIE agent; see grounding context.',
  };
}

/**
 * Run the LCIE AI agent over a stored Purchase Order.
 * Determines HS codes for US / UK / EU per line item, stores results,
 * and returns the full determination set plus an audit trail of agent steps.
 */
export async function determineHsCodesForPo(poId: string): Promise<DetermineResponse> {
  const startedAt = Date.now();
  const steps: AgentStep[] = [];
  let stepCounter = 0;
  const pushStep = (s: Omit<AgentStep, 'step' | 'ts'>) => {
    steps.push({ ...s, step: ++stepCounter, ts: new Date().toISOString() });
  };

  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: { lineItems: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!po) throw new Error('Purchase order not found.');
  if (!po.lineItems.length) throw new Error('Purchase order has no line items.');

  // wipe previous determinations for this PO (idempotent re-run)
  await db.hsDetermination.deleteMany({ where: { lineItem: { poId } } });

  // Resolve the PO's final destination country → the ONE duty region to classify
  // for (US HTS / UK Global Tariff / EU TARIC). The agent no longer classifies
  // all three — only the destined country's stack is computed and stored.
  const dest = resolveDestination(po.destinationCountry);
  const destRegion: Region = dest.region;

  // Init the LLM SDK — if it fails (auth, network, rate-limit at init), the
  // agent continues in pure knowledge-base mode.
  //
  // Two init paths:
  //   • Vercel / production: ZAI_API_KEY env var is set → use Reflect.construct
  //     to bypass the TS-private constructor and instantiate directly from
  //     env-var config (Vercel serverless has no writable filesystem for the
  //     SDK's file-based auto-discovery).
  //   • Local dev: env var unset → fall back to ZAI.create() which auto-reads
  //     `./.z-ai-config` or `~/.z-ai-config`.
  let zai: ZAI | null = null;
  try {
    const apiKey = process.env.ZAI_API_KEY?.trim();
    const baseUrl = process.env.ZAI_BASE_URL?.trim() || 'https://api.z.ai/api/v1';
    zai = apiKey
      ? (Reflect.construct(ZAI, [{ baseUrl, apiKey }]) as ZAI)
      : await ZAI.create();
  } catch (e) {
    pushStep({ lineItemId: '', description: `LLM SDK init failed (${(e as Error).message}) — continuing in KB-only mode`, status: 'error' });
  }

  // Large-PO fast path: when a PO has more than LLM_MAX_ITEMS line items,
  // classify every item from the curated knowledge base INSTANTLY. The KB now
  // carries the correct HS codes (incl. water filters → 8421.21.00.00), so the
  // result is accurate; running 26+ LLM calls would take >60s and trip the
  // gateway proxy timeout (the "Agent run failed" cause). KB-only keeps the
  // whole run well under any timeout.
  const useLlm = zai !== null && po.lineItems.length <= LLM_MAX_ITEMS;
  const llmMode = !zai ? 'KB-only (LLM unavailable)' : useLlm ? `${CONCURRENCY} parallel` : `KB-only (PO > ${LLM_MAX_ITEMS} items — instant classification)`;
  pushStep({ lineItemId: '', description: `LCIE agent initialised (model=${MODEL_TAG}, ${po.lineItems.length} item(s), ${llmMode}) — destination: ${dest.flag} ${dest.countryName} (${dest.region}, ${dest.currency})`, status: 'llm_call' });

  const determinations: DeterminationResult[] = [];
  // Circuit breaker: the moment a chunk hits a 429, switch ALL remaining items
  // to KB-only so the run completes fast instead of stalling on rate-limit
  // retries (which is what blew past the gateway timeout).
  let llmTripped = !useLlm;

  for (let i = 0; i < po.lineItems.length; i += CONCURRENCY) {
    const chunk = po.lineItems.slice(i, i + CONCURRENCY);
    const chunkResults = await Promise.all(
      chunk.map((li) => classifyOneItem(llmTripped ? null : zai, li, po, pushStep)),
    );
    for (const r of chunkResults) {
      await storeItemDeterminations(r, po, determinations, pushStep, destRegion);
    }
    // trip the breaker on the first 429
    if (!llmTripped && chunkResults.some((r) => /429|rate-limited/i.test(r.error ?? ''))) {
      llmTripped = true;
      pushStep({ lineItemId: '', description: 'LLM rate-limit (429) detected — switching remaining items to instant KB-only classification', status: 'error' });
    }
    if (!llmTripped && i + CONCURRENCY < po.lineItems.length && INTER_CHUNK_DELAY_MS > 0) {
      await new Promise((r) => setTimeout(r, INTER_CHUNK_DELAY_MS));
    }
  }

  const durationMs = Date.now() - startedAt;
  return {
    poId,
    agentRunId: `run_${Date.now()}`,
    determinations,
    agentSteps: steps,
    model: MODEL_TAG,
    durationMs,
  };
}

/** Race a promise against a hard timeout so one slow LLM call can't block the run. */
function withTimeout<T>(p: Promise<T>, ms: number, label = 'LLM call'): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms),
    ),
  ]);
}

/** Classify a single line item via one LLM call (with grounding + timeout).
 *  Falls back to KB-only classification if `zai` is null (SDK init failed) or
 *  the call times out / hits a 429 rate limit — the KB now carries the correct
 *  HS codes so the fallback is still accurate, just lower confidence. */
async function classifyOneItem(
  zai: Awaited<ReturnType<typeof ZAI.create>> | null,
  li: { id: string; lineNumber: number; description: string; material: string | null; quantity: number; unit: string | null; unitValue: number; originCountry: string | null },
  po: { originCountry: string | null },
  pushStep: (s: Omit<AgentStep, 'step' | 'ts'>) => void,
): Promise<{
  li: typeof li;
  parsed: LlmBatchOutput | null;
  cands: ReturnType<typeof findHsEntries>;
  error?: string;
}> {
  const cands = findHsEntries(li.description + ' ' + (li.material ?? ''));
  pushStep({ lineItemId: li.id, description: `L${li.lineNumber}: grounding → ${cands.length} candidate(s)`, status: 'grounding' });

  // KB-only fast path when the LLM SDK is unavailable (init failed / 429 storm).
  if (!zai) {
    pushStep({ lineItemId: li.id, description: `L${li.lineNumber}: LLM unavailable → KB-only classification`, status: 'stored' });
    return { li, parsed: null, cands, error: 'LLM unavailable (KB-only)' };
  }

  const userPrompt = buildUserPrompt([
    {
      id: li.id,
      lineNumber: li.lineNumber,
      description: li.description,
      material: li.material,
      quantity: li.quantity,
      unit: li.unit,
      unitValue: li.unitValue,
      originCountry: li.originCountry ?? po.originCountry,
    },
  ]);

  pushStep({ lineItemId: li.id, description: `L${li.lineNumber}: invoking LLM`, status: 'llm_call' });

  try {
    const completion = await withTimeout(
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      }),
      LLM_TIMEOUT_MS,
      `L${li.lineNumber}`,
    );
    const llmRaw = completion.choices[0]?.message?.content ?? '';
    const parsed = safeParseBatch(llmRaw);
    if (!parsed) {
      return { li, parsed: null, cands, error: 'LLM JSON parse failed' };
    }
    return { li, parsed, cands };
  } catch (err) {
    const msg = (err as Error).message || String(err);
    const is429 = /429|too many requests|rate limit/i.test(msg);
    pushStep({ lineItemId: li.id, description: `L${li.lineNumber}: ${is429 ? 'LLM rate-limited (429)' : 'LLM failed'} — falling back to KB`, status: 'error' });
    return { li, parsed: null, cands, error: is429 ? 'LLM rate-limited (429) → KB fallback' : msg };
  }
}

/** Store the 3 region determinations for one line item — from LLM output if available, else KB fallback. */
async function storeItemDeterminations(
  r: { li: { id: string; lineNumber: number; description: string; material: string | null; originCountry: string | null }; parsed: LlmBatchOutput | null; cands: ReturnType<typeof findHsEntries>; error?: string },
  po: { originCountry: string | null },
  determinations: DeterminationResult[],
  pushStep: (s: Omit<AgentStep, 'step' | 'ts'>) => void,
  destRegion: Region,
): Promise<void> {
  const { li, parsed, cands, error } = r;
  const fb = cands[0];
  const groundingRefs = cands.map((c) => c.id).join(',') || null;
  const out = parsed?.items.find((x) => x.lineItemId === li.id);

  for (const region of [destRegion] as Region[]) {
    if (parsed && out) {
      const raw = out[region.toLowerCase() as 'us' | 'uk' | 'eu' | 'au'];
      const fbRegional = fb
        ? region === 'US'
          ? { code: fb.us.code, dutyRate: fb.us.dutyRate, dutyType: fb.us.dutyType, vatRate: 0, description: fb.us.description }
          : region === 'UK'
            ? { code: fb.uk.code, dutyRate: fb.uk.dutyRate, dutyType: fb.uk.dutyType, vatRate: fb.uk.vatRate, description: fb.uk.description }
            : region === 'AU'
              ? { code: fb.au?.code ?? fb.eu.code, dutyRate: fb.au?.dutyRate ?? fb.eu.dutyRate, dutyType: fb.au?.dutyType ?? fb.eu.dutyType, vatRate: fb.au?.gstRate ?? 0.10, description: fb.au?.description ?? fb.eu.description }
              : { code: fb.eu.code, dutyRate: fb.eu.dutyRate, dutyType: fb.eu.dutyType, vatRate: fb.eu.vatRate, description: fb.eu.description }
        : undefined;
      const sanitized = sanitizeRegion(raw, region, fbRegional, li.originCountry ?? po.originCountry);
      const det = await db.hsDetermination.create({
        data: {
          lineItemId: li.id,
          region,
          hsCode: sanitized.hsCode,
          tariffDescription: sanitized.tariffDescription,
          dutyRate: sanitized.dutyRate,
          dutyType: sanitized.dutyType,
          vatRate: sanitized.vatRate,
          additionalLevies: sanitized.additionalLevies ? JSON.stringify(sanitized.additionalLevies) : null,
          confidence: sanitized.confidence,
          reasoning: sanitized.reasoning,
          groundingRefs,
        },
      });
      determinations.push(toDto(det, li));
    } else {
      // Fallback: KB grounding only (LLM call failed or timed out)
      const regional = fb
        ? (region === 'US' ? fb.us : region === 'UK' ? fb.uk : region === 'AU' ? (fb.au ?? fb.eu) : fb.eu)
        : null;
      const det = await db.hsDetermination.create({
        data: {
          lineItemId: li.id,
          region,
          hsCode: regional?.code ?? '',
          tariffDescription: regional?.description ?? 'LCIE fallback (no LLM parse)',
          dutyRate: regional?.dutyRate ?? 0,
          dutyType: regional?.dutyType ?? 'ad valorem',
          vatRate: region === 'US' ? 0 : (region === 'UK' ? 0.2 : region === 'AU' ? 0.10 : 0.19),
          additionalLevies: region === 'US'
            ? (() => {
                const cn = ((li.originCountry ?? po.originCountry ?? 'CN') + '').toUpperCase() === 'CN';
                const chinaReciprocal = cn ? 0.10 : 0;   // 9903.88.x — held at 10% per Nov 10 2025 US-China deal (EO 14358 Nov 4 2025 + CSMS 66749380 Nov 7 2025)
                const cnhkEo = cn ? 0.10 : 0;            // 9903.01.24 Fentanyl IEEPA — reduced 20% → 10% effective Nov 10 2025
                const anyCountry = 0.10;                  // 9903.01.25 baseline reciprocal 10% (any country)
                return JSON.stringify({
                  MPF: DUTY_RULES.US.mpfRate,
                  HMF: DUTY_RULES.US.hmfRate, // calc engine applies only for ocean mode
                  ChinaReciprocal: chinaReciprocal,
                  CNHKEO: cnhkEo,
                  AnyCountry: anyCountry,
                  Section301: chinaReciprocal,           // legacy alias
                  IEEPA: cnhkEo + anyCountry,             // legacy alias
                });
              })()
            : region === 'AU'
              ? JSON.stringify({ gstRate: 0.10, ipcFlat: DUTY_RULES.AU.ipcFlat ?? 50 })
              : null,
          confidence: fb ? 0.6 : 0.3,
          reasoning: fb ? `Fallback to KB entry "${fb.id}" (${error ?? 'LLM unavailable'}).` : 'No grounding; LLM unavailable.',
          groundingRefs,
        },
      });
      determinations.push(toDto(det, li));
    }
  }
  pushStep({ lineItemId: li.id, description: `L${li.lineNumber}: stored ${destRegion} determination${error ? ' (with KB fallback)' : ''}`, status: 'stored' });
}

function toDto(
  det: {
    id: string;
    lineItemId: string;
    region: string;
    hsCode: string;
    tariffDescription: string;
    dutyRate: number;
    dutyType: string;
    vatRate: number;
    additionalLevies: string | null;
    confidence: number;
    reasoning: string | null;
    groundingRefs: string | null;
    determinedAt: Date;
  },
  li: { id: string; lineNumber: number; description: string },
): DeterminationResult {
  return {
    lineItemId: det.lineItemId,
    lineNumber: li.lineNumber,
    description: li.description,
    region: det.region as Region,
    hsCode: det.hsCode,
    tariffDescription: det.tariffDescription,
    dutyRate: det.dutyRate,
    dutyType: det.dutyType,
    vatRate: det.vatRate,
    additionalLevies: det.additionalLevies,
    confidence: det.confidence,
    reasoning: det.reasoning,
    groundingRefs: det.groundingRefs,
    determinedAt: det.determinedAt.toISOString(),
  };
}

export { HS_KNOWLEDGE_BASE };
