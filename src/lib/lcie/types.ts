/**
 * LCIE Landed Cost Agent — shared API types
 * Green G(P)4 Supply Chain Framework
 */

export type Region = 'US' | 'UK' | 'EU';

export interface LineItemInput {
  lineNumber: number;
  sku?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitValue: number;
  totalValue?: number; // the PO's stated line total, if present (else computed qty×unitValue)
  material?: string;
  originCountry?: string;
}

export interface PoInput {
  poNumber: string;
  supplier?: string;
  originCountry?: string;
  destinationCountry?: string;
  currency?: string;
  incoterm?: string;
  freight?: number;
  insurance?: number;
  otherCharges?: number;
  lineItems: LineItemInput[];
}

export interface LineItemDto extends LineItemInput {
  id: string;
  totalValue: number;
}

export interface PoDto {
  id: string;
  poNumber: string;
  supplier?: string;
  originCountry?: string;
  destinationCountry?: string;
  currency: string;
  incoterm?: string;
  freight: number;
  insurance: number;
  otherCharges: number;
  source: string;
  createdAt: string;
  lineItems: LineItemDto[];
}

export interface DeterminationResult {
  lineItemId: string;
  lineNumber: number;
  description: string;
  region: Region;
  hsCode: string;
  tariffDescription: string;
  dutyRate: number;
  dutyType: string;
  vatRate: number;
  additionalLevies: string | null;
  confidence: number;
  reasoning: string | null;
  groundingRefs: string | null;
  determinedAt: string;
}

export interface DetermineResponse {
  poId: string;
  agentRunId: string;
  determinations: DeterminationResult[];
  agentSteps: AgentStep[];
  model: string;
  durationMs: number;
}

export interface AgentStep {
  step: number;
  lineItemId: string;
  description: string;
  status: 'grounding' | 'llm_call' | 'parsing' | 'stored' | 'error';
  detail?: string;
  ts: string;
}

export interface LineBreakdown {
  lineItemId: string;
  lineNumber: number;
  description: string;
  hsCode: string;
  tariffDescription?: string;
  dutyRate: number;
  dutyType: string;
  vatRate: number;
  section301Rate: number;
  ieepaRate: number;
  confidence: number;
  reasoning?: string;
  fobValue: number;        // in destination currency
  cifValue: number;        // FOB + allocated freight/insurance/other
  duty: number;
  section301: number;
  ieepa: number;
  vat: number;
  mpf: number;
  hmf: number;
  otherLevies: number;
  lineLandedCost: number;
}

/** A single step in the duty-stack waterfall (e.g. "CIF value", "Import duty @ 12%"). */
export interface WaterfallStep {
  label: string;
  rate?: number;           // optional percentage shown next to the label
  amount: number;          // in destination currency
  cumulative: number;      // running total after this step
  note?: string;
}

export interface RegionCalculation {
  region: Region;
  label: string;
  flag: string;
  currency: string;        // destination currency (post-FX)
  subtotal: number;        // FOB subtotal in destination currency
  dutyTotal: number;
  section301Total: number;
  ieepaTotal: number;
  vatTotal: number;
  mpfTotal: number;
  hmfTotal: number;
  otherLevies: number;
  freight: number;
  insurance: number;
  otherImportCharges: number; // customs broker, documentation, duty advance, etc.
  totalLandedCost: number;
  effectiveRate: number;
  lineBreakdown: LineBreakdown[];
  waterfall: WaterfallStep[]; // step-by-step duty stack for the detailed view
  notes: string;
}

/** Editable landed-cost inputs the customer enters before/after the agent run. */
export interface LandedCostInputs {
  freight?: number;
  insurance?: number;
  otherCharges?: number;        // legacy catch-all
  customsBrokerFee?: number;
  documentationFee?: number;
  dutyAdvanceFee?: number;      // MPF-style advance
  harborOrPortFee?: number;
  inlandDestinationDelivery?: number;
  currency?: string;            // currency the above are quoted in (defaults to PO currency)
  incoterm?: string;
}

export interface FxInfo {
  fromCurrency: string;   // PO/source currency
  toCurrency: string;     // destination currency
  rate: number;           // 1 from = rate to
  source: string;         // 'frankfurter' | 'er-api' | 'static' | 'identity'
  date: string;
  fetchedAt: string;
}

export interface DestinationInfoDto {
  countryCode: string;
  countryName: string;
  region: Region;
  currency: string;
  vatRate: number;
  flag: string;
  label: string;
}

export interface CalculateResponse {
  poId: string;
  poNumber: string;
  originCurrency: string;      // PO / supplier currency (pre-FX)
  destination: DestinationInfoDto;
  fx: FxInfo | null;           // null when origin === destination currency
  calculation: RegionCalculation | null;  // single destination region (was `calculations[]`)
  calculatedAt: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
