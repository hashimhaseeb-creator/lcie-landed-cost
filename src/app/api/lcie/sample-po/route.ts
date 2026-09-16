/**
 * GET /api/lcie/sample-po
 * Green G(P)4 Supply Chain Framework — LCIE demo data
 *
 * ?id=<sample-id>  → returns one sample PO
 * (no query)       → returns the full sample catalogue
 */

import { NextRequest, NextResponse } from 'next/server';
import { SAMPLE_POS, getSamplePo } from '@/lib/lcie/sample-po';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const sample = getSamplePo(id);
    if (!sample) {
      return NextResponse.json({ error: 'Sample not found.' }, { status: 404 });
    }
    return NextResponse.json(sample);
  }
  return NextResponse.json({ samples: SAMPLE_POS.map((s) => ({ id: s.id, title: s.title, blurb: s.blurb, lineCount: s.lineItems.length })) });
}
