/**
 * POST /api/lcie/determine-codes
 * Green G(P)4 Supply Chain Framework — LCIE AI Agent
 *
 * Body: { "poId": string }
 *
 * Runs the LCIE harmonized-code determination AI agent over every line item
 * of the stored Purchase Order, for US (HTS), UK (Global Tariff) and
 * EU (TARIC/CN8). Stores one HsDetermination per (line × region).
 * Returns the determinations plus a step-by-step agent audit trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { determineHsCodesForPo } from '@/lib/lcie/agent';
import type { ApiError, DetermineResponse } from '@/lib/lcie/types';

export const runtime = 'nodejs';
export const maxDuration = 180;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const poId = typeof body?.poId === 'string' ? body.poId : '';

    if (!poId) {
      return NextResponse.json<ApiError>({ error: 'poId is required.' }, { status: 400 });
    }

    const result: DetermineResponse = await determineHsCodesForPo(poId);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiError>({ error: 'LCIE agent failed.', detail: message }, { status: 500 });
  }
}
