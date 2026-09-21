import { NextResponse } from 'next/server';
import { forceRefresh } from '@/lib/lcie/regulatory-intelligence';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Vercel Hobby: 10s; Pro: 60s — give the web_search loop room.

/**
 * GET /api/lcie/cron-refresh-rates
 *
 * Triggered by Vercel Cron (see vercel.json — `0 6 * * *` = daily at 06:00 UTC)
 * to re-verify every provision's current rate against the live sources
 * (CBP / USTR / Federal Register / HMRC / DG TAXUD / ABF) via the z-ai-web-dev-sdk
 * web_search function. Any detected deltas are stored in the in-memory snapshot
 * + surfaced via the GET /api/lcie/current-rates endpoint.
 *
 * Auth: Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}`. We verify
 * against process.env.CRON_SECRET so random users can't trigger an expensive
 * 15-call web_search sweep by hitting this endpoint directly. If CRON_SECRET
 * isn't set (e.g. local dev), the endpoint is open — fine for local testing.
 *
 * Returns:
 *   • 200 + { ok, refreshedAt, source, rateCount, changeCount, changes? }
 *   • 401 if Authorization header doesn't match CRON_SECRET (when set)
 *   • 500 on internal error
 */
export async function GET(req: Request) {
  // Auth check — only enforce if CRON_SECRET is set on Vercel
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get('authorization') ?? '';
    const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (provided !== cronSecret) {
      return NextResponse.json(
        { error: 'unauthorized', detail: 'CRON_SECRET mismatch — this endpoint is for Vercel Cron only.' },
        { status: 401 },
      );
    }
  }

  try {
    const snapshot = await forceRefresh();
    return NextResponse.json({
      ok: true,
      refreshedAt: snapshot.refreshedAt,
      nextRefreshDueAt: snapshot.nextRefreshDueAt,
      source: snapshot.source,
      rateCount: snapshot.rates.length,
      changeCount: (snapshot.changes ?? []).length,
      changes: snapshot.changes ?? [],
      triggeredBy: 'vercel-cron',
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: 'cron-refresh-failed', detail: (e as Error).message },
      { status: 500 },
    );
  }
}
