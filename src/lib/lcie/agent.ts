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
import type { Region, AgentStep, DeterminationResult, DetermineResponse } from './types';

const MODEL_TAG = 'glm-5.2 (z-ai-web-dev-sdk)';
const BATCH_SIZE = 8;

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

Your job: given a list of purchase-order line items (description, material, quantity, unit, origin country), determine for EACH item and for EACH region (US, UK, EU) the correct HS classification, the general/MFN ad valorem duty rate, the VAT rate, and any other leviable charges.

Rules:
- Use the grounding context provided (real HS codes from a curated knowledge base) as your primary source when the product matches. Only deviate when you have strong justification.
- Always use realistic, correctly-digit-counted codes: US 8-10 digits, UK 10 digits, EU 8 digits (with spaces, e.g. "6109 10 00").
- dutyRate is a DECIMAL ad valorem fraction (0.165 = 16.5%, 0 = free). dutyType ∈ {"ad valorem","specific","free"}.
- vatRate is a DECIMAL (0.20 = 20%). For US, vatRate MUST be 0 (no federal VAT).
- additionalLevies: object mapping levy name → decimal rate. For US always include {"MPF":0.003464,"HMF":0.00125,"Section301":<rate>,"IEEPA":<rate>}. For UK/EU use null or {}.
- Section 301 (US only): the China-specific trade-remedy surcharge. If originCountry is CN and the HTS subheading is on Section 301 List 3 (most consumer apparel, leather goods, tools, ceramics, food), set "Section301":0.25. If on List 4A/4B (smartphones, laptops, some electronics — largely exempt/suspended), set "Section301":0. If origin is not CN, set 0. State the list assumption in reasoning.
- IEEPA reciprocal tariff (US only): the 2025 IEEPA reciprocal duty. If originCountry is CN set "IEEPA":0.34 (modelled); 0 otherwise. Note in reasoning that this is a modelled estimate subject to executive action.
- confidence: 0..1 self-reported certainty (use ≥0.85 when grounded by KB, 0.6-0.84 for LLM-only inference).
- reasoning: ONE concise sentence explaining the classification rationale (material + chapter + duty treatment + any Section 301/IEEPA note).
- If a product is genuinely duty-free under the WTO Information Technology Agreement (smartphones, laptops, semiconductors), set dutyRate 0 and dutyType "free" with a note in reasoning.

Return ONLY valid JSON (no markdown fences, no prose) in this exact shape:
{
  "items": [
    {
      "lineItemId": "<id from input>",
      "us": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0, "additionalLevies": {"MPF":0.003464,"HMF":0.00125,"Section301":0.25,"IEEPA":0.34}, "confidence": 0.9, "reasoning": "..." },
      "uk": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0.2, "additionalLevies": null, "confidence": 0.9, "reasoning": "..." },
      "eu": { "hsCode": "...", "tariffDescription": "...", "dutyRate": 0.0, "dutyType": "ad valorem", "vatRate": 0.19, "additionalLevies": null, "confidence": 0.9, "reasoning": "..." }
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
    const section301 = typeof ll.Section301 === 'number' && isFinite(ll.Section301) ? ll.Section301 : (isCn ? 0.25 : 0);
    const ieepa = typeof ll.IEEPA === 'number' && isFinite(ll.IEEPA) ? ll.IEEPA : (isCn ? 0.34 : 0);
    additionalLevies = {
      MPF: DUTY_RULES.US.mpfRate!,
      HMF: DUTY_RULES.US.hmfRate!,
      Section301: section301,
      IEEPA: ieepa,
    };
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

  const zai = await ZAI.create();
  pushStep({ lineItemId: '', description: `LCIE agent initialised (model=${MODEL_TAG})`, status: 'llm_call' });

  const determinations: DeterminationResult[] = [];
  const batches: typeof po.lineItems[] = [];
  for (let i = 0; i < po.lineItems.length; i += BATCH_SIZE) {
    batches.push(po.lineItems.slice(i, i + BATCH_SIZE));
  }

  for (const batch of batches) {
    const ids = batch.map((b) => b.id);
    const lineSummaries = batch.map((b) => `L${b.lineNumber}: ${b.description}`).join(', ');
    pushStep({ lineItemId: ids[0] ?? '', description: `Grounding lookup for batch (${lineSummaries})`, status: 'grounding' });

    const userPrompt = buildUserPrompt(
      batch.map((b) => ({
        id: b.id,
        lineNumber: b.lineNumber,
        description: b.description,
        material: b.material,
        quantity: b.quantity,
        unit: b.unit,
        unitValue: b.unitValue,
        originCountry: b.originCountry ?? po.originCountry,
      })),
    );

    pushStep({ lineItemId: ids[0] ?? '', description: `Invoking LLM for ${batch.length} line item(s)`, status: 'llm_call' });

    let llmRaw = '';
    let parsed: LlmBatchOutput | null = null;
    try {
      const completion = await zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        thinking: { type: 'disabled' },
      });
      llmRaw = completion.choices[0]?.message?.content ?? '';
      parsed = safeParseBatch(llmRaw);
    } catch (err) {
      pushStep({ lineItemId: ids[0] ?? '', description: `LLM call failed: ${(err as Error).message}`, status: 'error' });
    }

    if (!parsed) {
      // fallback: synthesize determinations purely from KB grounding (degraded mode)
      for (const li of batch) {
        const cands = findHsEntries(li.description + ' ' + (li.material ?? ''));
        const fb = cands[0];
        for (const region of ['US', 'UK', 'EU'] as Region[]) {
          const regional = fb ? (region === 'US' ? fb.us : region === 'UK' ? fb.uk : fb.eu) : null;
          const det = await db.hsDetermination.create({
            data: {
              lineItemId: li.id,
              region,
              hsCode: regional?.code ?? '',
              tariffDescription: regional?.description ?? 'LCIE fallback (no LLM parse)',
              dutyRate: regional?.dutyRate ?? 0,
              dutyType: regional?.dutyType ?? 'ad valorem',
              vatRate: region === 'US' ? 0 : (region === 'UK' ? 0.2 : 0.19),
              additionalLevies: region === 'US'
                ? JSON.stringify({
                    MPF: DUTY_RULES.US.mpfRate,
                    HMF: DUTY_RULES.US.hmfRate,
                    Section301: ((li.originCountry ?? po.originCountry ?? 'CN').toUpperCase() === 'CN' ? 0.25 : 0),
                    IEEPA: ((li.originCountry ?? po.originCountry ?? 'CN').toUpperCase() === 'CN' ? 0.34 : 0),
                  })
                : null,
              confidence: fb ? 0.6 : 0.3,
              reasoning: fb ? `Fallback to KB entry "${fb.id}" (LLM parse failed).` : 'No grounding; LLM unavailable.',
              groundingRefs: cands.map((c) => c.id).join(',') || null,
            },
          });
          determinations.push(toDto(det, li));
        }
        pushStep({ lineItemId: li.id, description: `Stored fallback determinations (LLM parse failed)`, status: 'stored' });
      }
      continue;
    }

    pushStep({ lineItemId: ids[0] ?? '', description: `Parsed LLM JSON for ${parsed.items.length} item(s)`, status: 'parsing' });

    for (const li of batch) {
      const out = parsed.items.find((x) => x.lineItemId === li.id);
      const cands = findHsEntries(li.description + ' ' + (li.material ?? ''));
      const fb = cands[0];
      const groundingRefs = cands.map((c) => c.id).join(',') || null;

      for (const region of ['US', 'UK', 'EU'] as Region[]) {
        const raw = out?.[region.toLowerCase() as 'us' | 'uk' | 'eu'];
        const fbRegional = fb
          ? region === 'US'
            ? { code: fb.us.code, dutyRate: fb.us.dutyRate, dutyType: fb.us.dutyType, vatRate: 0, description: fb.us.description }
            : region === 'UK'
              ? { code: fb.uk.code, dutyRate: fb.uk.dutyRate, dutyType: fb.uk.dutyType, vatRate: fb.uk.vatRate, description: fb.uk.description }
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
      }
      pushStep({ lineItemId: li.id, description: `Stored US/UK/EU determinations`, status: 'stored' });
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
