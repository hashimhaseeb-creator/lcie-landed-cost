/**
 * GET /api/license/status?key=<license-key>
 * Green G(P)⁴™ Global Operations — LCIE Client-Side License Verification Hook
 * Protected Operational Pipeline Utility
 *
 * Returns the full metered quota parameters (plan, used, remaining, cap) so
 * the frontend can refresh the Quota Balance Monitor when a user inputs or
 * clears license keys.
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyLicense } from '@/lib/lcie/license';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const licenseKey = searchParams.get('key') ?? '';

    if (!licenseKey) {
      return NextResponse.json({ valid: false, reason: 'Tracking key parameter required.' }, { status: 400 });
    }

    const state = await verifyLicense(licenseKey);

    if (!state.valid) {
      return NextResponse.json({ valid: false, reason: state.reason || 'Invalid license string.' }, { status: 200 });
    }

    // Return the full metered quota parameters to refresh the remaining count meters
    return NextResponse.json({
      valid: true,
      licenseState: {
        plan: state.plan ?? 'Free Preview',
        used: state.usedCount ?? 0,
        remaining: state.remaining ?? 0,
        cap: state.monthlyCap ?? 1
      }
    }, { status: 200 });

  } catch (err) {
    return NextResponse.json({ valid: false, reason: 'License state resolution timed out.' }, { status: 500 });
  }
}
