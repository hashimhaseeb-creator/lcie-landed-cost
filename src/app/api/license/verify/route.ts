/**
 * POST /api/license/verify
 * Green G(P)⁴™ Global Operations — LCIE license gate
 *
 * Body: { "key": "<license-key>" } → returns { valid, plan, remaining, ... }
 * Body: { "action": "free-preview" } → provisions a free-tier key (3 calcs/mo)
 *   and returns it so the frontend can store + use it.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyLicense, provisionFreePreview } from '@/lib/lcie/license';
import type { ApiError } from '@/lib/lcie/types';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.action === 'free-preview') {
      const state = await provisionFreePreview();
      return NextResponse.json(state, { status: 200 });
    }
    const state = await verifyLicense(body?.key);
    if (!state.valid) {
      return NextResponse.json<ApiError & { plan?: string; remaining?: number }>(
        { error: state.reason ?? 'Invalid license', detail: 'Subscribe via Lemon Squeezy, or start a free preview.' },
        { status: 402 },
      );
    }
    return NextResponse.json(state, { status: 200 });
  } catch (err) {
    return NextResponse.json<ApiError>({ error: 'License verify failed.', detail: (err as Error).message }, { status: 500 });
  }
}
