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
  fobValue: number;
  duty: number;
  vat: number;
  mpf: number;
  hmf: number;
  otherLevies: number;
  lineLandedCost: number;
}

export interface RegionCalculation {
  region: Region;
  label: string;
  flag: string;
  currency: string;
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
  lineBreakdown: LineBreakdown[];
  notes: string;
}

export interface CalculateResponse {
  poId: string;
  poNumber: string;
  originCurrency: string;
  calculations: RegionCalculation[];
  calculatedAt: string;
}

export interface ApiError {
  error: string;
  detail?: string;
}
