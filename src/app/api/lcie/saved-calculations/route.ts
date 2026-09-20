import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rows = await db.landedCostCalculation.findMany({
      orderBy: { createdAt: 'desc' },
      take: 25,
      include: { po: { select: { poNumber: true, supplier: true, originCountry: true, destinationCountry: true, lineItems: { select: { id: true, description: true, quantity: true, unitValue: true }, orderBy: { lineNumber: 'asc' } } } } },
    });
    const items = rows.map((r) => {
      let fx: { from?: string; to?: string; rate?: number; source?: string; date?: string; fetchedAt?: string } | null = null;
      try { fx = r.fxSnapshotJson ? JSON.parse(r.fxSnapshotJson) : null; } catch { fx = null; }
      return {
        id: r.id,
        poId: r.poId,
        poNumber: r.poNumber ?? r.po.poNumber,
        supplier: r.po.supplier ?? null,
        region: r.region,
        destinationCountry: r.destinationCountry ?? null,
        destinationCurrency: r.destinationCurrency ?? null,
        destinationLabel: r.destinationLabel ?? null,
        originCountry: r.originCountry ?? r.po.originCountry ?? null,
        originCurrency: r.originCurrency ?? null,
        subtotal: r.subtotal,
        dutyTotal: r.dutyTotal,
        vatTotal: r.vatTotal,
        mpfTotal: r.mpfTotal,
        hmfTotal: r.hmfTotal,
        otherLevies: r.otherLevies,
        freight: r.freight,
        insurance: r.insurance,
        totalLandedCost: r.totalLandedCost,
        effectiveRate: r.effectiveRate ?? 0,
        ftaName: r.ftaName ?? null,
        ftaPreferentialRate: r.ftaPreferentialRate ?? null,
        mfnRate: r.mfnRate ?? null,
        fx,
        lineItemCount: r.po.lineItems.length,
        createdAt: r.createdAt.toISOString(),
      };
    });
    return NextResponse.json({ items });
  } catch (e) {
    return NextResponse.json({ error: 'failed', detail: (e as Error).message }, { status: 500 });
  }
}
