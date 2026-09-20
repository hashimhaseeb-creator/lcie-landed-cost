import { NextResponse } from 'next/server';
import { forceRefresh } from '@/lib/lcie/regulatory-intelligence';

export const dynamic = 'force-dynamic';

/**
 * POST /api/lcie/refresh-rates
 * Force-refreshes the rate snapshot by re-verifying each provision against
 * live web sources (CBP / Federal Register / HMRC / DG TAXUD / ABF) via
 * z-ai-web-dev-sdk's web_search function.
 *
 * Returns:
 *   • refreshedAt, nextRefreshDueAt, source: 'web-search-verified'
 *   • rates: the full updated snapshot
 *   • changes: array of any deltas detected vs. the previously cached snapshot
 *     (key, label, fromRate → toRate, fromEffective → toEffective, citations)
 *
 * Called manually by the "Verify current rates" button on the UI hero.
 */
export async function POST() {
  try {
    const snapshot = await forceRefresh();
    return NextResponse.json({
      refreshedAt: snapshot.refreshedAt,
      nextRefreshDueAt: snapshot.nextRefreshDueAt,
      source: snapshot.source,
      rateCount: snapshot.rates.length,
      rates: snapshot.rates,
      changes: snapshot.changes ?? [],
      changeCount: (snapshot.changes ?? []).length,
    });
  } catch (e) {
    return NextResponse.json(
      { error: 'refresh-failed', detail: (e as Error).message },
      { status: 500 },
    );
  }
}
