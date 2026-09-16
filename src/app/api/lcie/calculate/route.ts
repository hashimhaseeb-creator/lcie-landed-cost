/**
 * POST /api/lcie/calculate
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine (destination-aware)
 *
 * Body: { "poId": string, "inputs"?: LandedCostInputs }
 *
 * Computes the duty stack for ONLY the PO's final destination country, with
 * live FX conversion to the destination currency. The customer-supplied
 * landed-cost inputs (freight, insurance, customs broker fee, documentation,
 * duty advance, harbor, inland delivery, …) feed the CIF base and the final
 * landed cost. Returns the single destination region calculation + FX info +
 * a step-by-step duty-stack waterfall.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateLandedCost } from '@/lib/lcie/calculator';
import type { ApiError, CalculateResponse, LandedCostInputs } from '@/lib/lcie/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const poId = typeof body?.poId === 'string' ? body.poId : '';
    const inputs: LandedCostInputs = (body?.inputs && typeof body.inputs === 'object') ? body.inputs : {};

    if (!poId) {
      return NextResponse.json<ApiError>({ error: 'poId is required.' }, { status: 400 });
    }

    const result: CalculateResponse = await calculateLandedCost(poId, inputs);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiError>({ error: 'Landed cost calculation failed.', detail: message }, { status: 500 });
  }
}
