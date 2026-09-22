/**
 * LCIE Landed Cost Agent — shared API types
 * Green G(P)4 Supply Chain Framework
 */

export type Region = 'US' | 'UK' | 'EU' | 'AU';

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
  section301Rate: number;   // kept for backward-compat alias = chinaReciprocalRate
  ieepaRate: number;        // kept for backward-compat alias = cnhkEoRate + anyCountryRate
  chinaReciprocalRate: number;   // 9903.88.01/.03 — China 25% reciprocal (2025 EO)
  cnhkEoRate: number;            // 9903.01.24 — CN/HK EO additional 20%
  anyCountryRate: number;        // 9903.01.25 — Reciprocal 10% (any country)
  confidence: number;
  reasoning?: string;
  fobValue: number;        // in destination currency
  cifValue: number;        // FOB + allocated freight/insurance/other
  duty: number;
  section301: number;        // alias = chinaReciprocal (kept for UI back-compat)
  ieepa: number;             // alias = cnhkEo + anyCountry (kept for UI back-compat)
  chinaReciprocal: number;     // 9903.88.01/.03 — China 25%
  cnhkEo: number;              // 9903.01.24 — CN/HK 20%
  anyCountry: number;          // 9903.01.25 — any-country 10%
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

/**
 * FTA (Free Trade Agreement) preferential tariff advisory.
 * Resolved by the calculator per line item — shows the MFN rate vs the
 * preferential FTA rate so the importer can compare and claim.
 */
export interface FtaAdvisory {
  originISO2: string;
  destinationISO2: string;
  applies: boolean;                 // does any in-force FTA cover this origin→dest route?
  agreementName: string;            // long-form agreement name (e.g. "United States–Australia FTA")
  agreementShortName: string;       // "AUSFTA" | "USMCA" | "UK-EU TCA" | ...
  preferentialRate: number;         // decimal (0 = duty-free)
  preferentialType: 'free' | 'ad_valorem' | 'reduced';
  mfnRate: number;                  // MFN/General rate for this HS line (decimal)
  savingVsMfn: number;              // absolute decimal delta (mfnRate − preferentialRate)
  ruleOfOriginSummary: string;      // concise rule of origin text
  notes: string;                     // citation + entry-into-force status
  alternatives: { agreementShortName: string; preferentialRate: number; preferentialType: string }[];
}

export interface RegionCalculation {
  region: Region;
  label: string;
  flag: string;
  currency: string;        // destination currency (post-FX)
  subtotal: number;        // FOB subtotal in destination currency
  dutyTotal: number;
  section301Total: number;   // alias = chinaReciprocalTotal (back-compat)
  ieepaTotal: number;        // alias = cnhkEoTotal + anyCountryTotal (back-compat)
  chinaReciprocalTotal: number;   // 9903.88.01/.03 — China 25%
  cnhkEoTotal: number;          // 9903.01.24 — CN/HK 20%
  anyCountryTotal: number;      // 9903.01.25 — any-country 10%
  vatTotal: number;
  mpfTotal: number;
  hmfTotal: number;
  hmfApplies: boolean;          // false for rail/air/truck (HMF is ocean-only under 19 U.S.C. §4462)
  modeOfTransport?: string;     // 'Ocean' | 'Rail' | 'Air' | 'Truck'
  otherLevies: number;
  freight: number;
  insurance: number;
  otherImportCharges: number; // customs broker, documentation, duty advance, etc.
  totalLandedCost: number;
  effectiveRate: number;
  // FTA preferential advisory — populated when an FTA covers origin→destination for the line set.
  fta?: FtaAdvisory;
  // EU e-commerce parcel regime (Reg (EU) 2017/2455, in force 1 Jul 2021):
  // €150 de minimis REMOVED — flat €3 customs duty per unique HS6 + €2 handling fee per declaration line for parcels ≤ €150.
  euParcelDutyTotal?: number;       // sum of flat €3 customs duties per unique HS6 line item
  euParcelHandlingTotal?: number;  // sum of flat €2 handling fees per customs declaration line
  // Carbon penalty avoidance savings — derived from alternative freight routing under UK ETS + EU ETS.
  // Distinct, un-blended metric — NOT included in totalLandedCost or effectiveRate; returned as a separate payload attribute.
  carbonSavings?: number;
  lineBreakdown: LineBreakdown[];
  waterfall: WaterfallStep[]; // step-by-step duty stack for the detailed view
  notes: string;
}

/**
 * A single row in the Saved Calculations history list (one per PO run).
 * Persisted automatically each time the calculator runs — i.e., it updates
 * every time a customer "buys" a calculation.
 */
export interface SavedCalculationItem {
  id: string;
  poId: string;
  poNumber: string;
  supplier?: string | null;
  region: Region;
  destinationCountry?: string | null;
  destinationCurrency?: string | null;
  destinationLabel?: string | null;
  originCountry?: string | null;
  originCurrency?: string | null;
  subtotal: number;
  dutyTotal: number;
  vatTotal: number;
  mpfTotal: number;
  hmfTotal: number;
  otherLevies: number;
  freight: number;
  insurance: number;
  totalLandedCost: number;
  effectiveRate: number;
  ftaName?: string | null;
  ftaPreferentialRate?: number | null;
  mfnRate?: number | null;
  fx?: { from?: string; to?: string; rate?: number; source?: string; date?: string; fetchedAt?: string } | null;
  lineItemCount: number;
  createdAt: string;        // ISO
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
  modeOfTransport?: string;    // 'Ocean' | 'Rail' | 'Air' | 'Truck' — HMF applies only to Ocean
}

/** Parsed CBP Form 7501 customs entry, for side-by-side comparison. */
export interface CbpEntryProvision {
  code: string;                 // e.g. "9903.88.01", "MPF", "Base"
  description: string;          // provision description
  rate: number;                 // decimal (0.25 = 25%); MPF 0.003464
  amount: number;               // USD duty/fee for this provision
}
export interface CbpEntryLine {
  lineNumber: number;
  hts: string;                  // base HTS (e.g. "8421.21.0000")
  description: string;
  enteredValue: number;
  provisions: CbpEntryProvision[];
  lineTotal: number;            // stacked duty + MPF for this line
}
export interface CbpEntry {
  entryNumber?: string;
  port?: string;
  modeOfTransport?: string;
  countryOfOrigin?: string;
  enteredValue: number;
  grandTotal: number;
  effectiveDutyPct: number;
  hmfAssessed: boolean;
  lines: CbpEntryLine[];
  rawText?: string;
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
