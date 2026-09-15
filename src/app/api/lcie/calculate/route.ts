/**
 * POST /api/lcie/calculate
 * Green G(P)4 Supply Chain Framework — LCIE Landed Cost Engine
 *
 * Body: { "poId": string }
 *
 * Computes per-region (US / UK / EU) landed cost given the AI agent's
 * HS determinations for the stored PO. Persists a LandedCostCalculation
 * row per region and returns the full breakdown.
 */

import { NextRequest, NextResponse } from 'next/server';
import { calculateLandedCost } from '@/lib/lcie/calculator';
import type { ApiError, CalculateResponse } from '@/lib/lcie/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const poId = typeof body?.poId === 'string' ? body.poId : '';

    if (!poId) {
      return NextResponse.json<ApiError>({ error: 'poId is required.' }, { status: 400 });
    }

    const result: CalculateResponse = await calculateLandedCost(poId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiError>({ error: 'Landed cost calculation failed.', detail: message }, { status: 500 });
  }
}
