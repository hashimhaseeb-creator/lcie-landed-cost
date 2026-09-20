import { NextResponse } from 'next/server';
import { getRateSnapshot } from '@/lib/lcie/regulatory-intelligence';

export const dynamic = 'force-dynamic';

/**
 * GET /api/lcie/current-rates
 * Returns the cached RateSnapshot (baseline values on first call; web-search
 * verified after a refresh). Includes refreshedAt + nextRefreshDueAt + every
 * provision's rate, effectiveDate, citation, source URL, and lastVerifiedAt.
 */
export async function GET() {
  const snapshot = getRateSnapshot();
  return NextResponse.json({
    refreshedAt: snapshot.refreshedAt,
    nextRefreshDueAt: snapshot.nextRefreshDueAt,
    source: snapshot.source,
    rateCount: snapshot.rates.length,
    rates: snapshot.rates,
  });
}
