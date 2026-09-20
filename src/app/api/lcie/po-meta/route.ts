import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * PATCH /api/lcie/po-meta
 * Updates the user-overrideable fields on a PurchaseOrder record:
 * originCountry, destinationCountry, incoterm. Called by the UI when
 * the user changes the origin / destination / incoterm dropdowns — the
 * next agent run + calculate call will read the updated values.
 *
 * Body: { poId: string, originCountry?: string, destinationCountry?: string, incoterm?: string }
 * Returns: { ok: true, po: { id, originCountry, destinationCountry, incoterm } }
 */
export async function PATCH(req: Request) {
  try {
    const body = await req.json() as { poId?: string; originCountry?: string; destinationCountry?: string; incoterm?: string };
    if (!body.poId) return NextResponse.json({ error: 'poId required' }, { status: 400 });

    const data: { originCountry?: string | null; destinationCountry?: string | null; incoterm?: string | null } = {};
    if (typeof body.originCountry === 'string') data.originCountry = body.originCountry.toUpperCase() || null;
    if (typeof body.destinationCountry === 'string') data.destinationCountry = body.destinationCountry.toUpperCase() || null;
    if (typeof body.incoterm === 'string') data.incoterm = body.incoterm.toUpperCase() || null;

    const updated = await db.purchaseOrder.update({
      where: { id: body.poId },
      data,
      select: { id: true, originCountry: true, destinationCountry: true, incoterm: true },
    });
    return NextResponse.json({ ok: true, po: updated });
  } catch (e) {
    return NextResponse.json({ error: 'update-failed', detail: (e as Error).message }, { status: 500 });
  }
}
