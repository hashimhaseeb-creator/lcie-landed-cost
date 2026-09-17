/**
 * POST /api/lcie/compare-entry
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 *
 * Accepts a CBP Form 7501 (US Customs Entry Summary) PDF, text-extracts it
 * with unpdf, parses the real duty stack (HTS + 9903.xx.xx provisions +
 * rates + amounts + MPF + grand total + HMF flag), and returns the
 * structured entry so the frontend can show a side-by-side comparison
 * against the LCIE engine's output (ground truth vs modelled).
 */

import { NextRequest, NextResponse } from 'next/server';
import { parseCbpEntry } from '@/lib/lcie/cbp-entry-parser';
import type { ApiError, CbpEntry } from '@/lib/lcie/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    const contentType = req.headers.get('content-type') ?? '';
    let rawText = '';
    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file && file instanceof File) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const isPdf = (bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46)
          || file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          const { extractText, getDocumentProxy } = await import('unpdf');
          const pdf = await getDocumentProxy(bytes);
          const out = await extractText(pdf, { mergePages: true });
          rawText = out.text ?? '';
        } else {
          rawText = new TextDecoder('utf-8').decode(bytes);
        }
      }
    } else {
      rawText = await req.text();
    }
    if (!rawText.trim()) {
      return NextResponse.json<ApiError>({ error: 'Empty CBP entry payload.' }, { status: 400 });
    }
    const entry: CbpEntry = parseCbpEntry(rawText);
    if (!entry.lines.length && !entry.grandTotal) {
      return NextResponse.json<ApiError>(
        { error: 'Could not parse a CBP duty stack from this file. Is it a Form 7501 duty-stack analysis?' },
        { status: 422 },
      );
    }
    return NextResponse.json(entry, { status: 200 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiError>({ error: 'CBP entry parse failed.', detail: message }, { status: 500 });
  }
}
