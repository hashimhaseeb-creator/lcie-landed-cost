/**
 * POST /api/lcie/upload-po
 * Green G(P)4 Supply Chain Framework — LCIE Landed Cost Agent
 *
 * Accepts a Purchase Order as:
 *   - multipart/form-data (file field "file" containing CSV/JSON/text)
 *   - application/json { rawText, meta: { poNumber, supplier, ... } }
 *   - text/plain raw PO body
 *
 * Parses (CSV / JSON / free text), normalizes into line items, stores the
 * PO in the database, and returns the PO DTO with line items.
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { parsePoPayload } from '@/lib/lcie/parser';
import type { PoDto, PoInput, ApiError } from '@/lib/lcie/types';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function POST(req: NextRequest) {
  try {
    let rawText = '';
    let meta: Partial<PoInput> = {};
    let source = 'upload';

    const contentType = req.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await req.formData();
      const file = formData.get('file');
      if (file && file instanceof File) {
        rawText = await file.text();
        source = `upload:${file.name}`;
      }
      const metaField = formData.get('meta');
      if (metaField && typeof metaField === 'string') {
        try { meta = JSON.parse(metaField); } catch { /* ignore */ }
      }
    } else if (contentType.includes('application/json')) {
      const body = await req.json();
      if (typeof body === 'string') {
        rawText = body;
      } else if (body && typeof body === 'object') {
        if (typeof body.rawText === 'string') {
          rawText = body.rawText;
          meta = (body.meta ?? {}) as Partial<PoInput>;
        } else if (typeof body.lineItems === 'object' || Array.isArray(body)) {
          rawText = JSON.stringify(body);
          source = 'upload:json';
        }
      }
    } else {
      rawText = await req.text();
    }

    if (!rawText.trim()) {
      return NextResponse.json<ApiError>({ error: 'Empty PO payload.' }, { status: 400 });
    }

    const parsed = parsePoPayload(rawText, meta);

    const po = await db.purchaseOrder.create({
      data: {
        poNumber: parsed.poNumber,
        supplier: parsed.supplier ?? null,
        originCountry: parsed.originCountry ?? null,
        destinationCountry: parsed.destinationCountry ?? null,
        currency: parsed.currency ?? 'USD',
        incoterm: parsed.incoterm ?? null,
        freight: parsed.freight ?? 0,
        insurance: parsed.insurance ?? 0,
        otherCharges: parsed.otherCharges ?? 0,
        source,
        lineItems: {
          create: parsed.lineItems.map((li) => ({
            lineNumber: li.lineNumber,
            sku: li.sku ?? null,
            description: li.description,
            quantity: li.quantity,
            unit: li.unit ?? 'PCS',
            unitValue: li.unitValue,
            material: li.material ?? null,
            originCountry: li.originCountry ?? parsed.originCountry ?? null,
            totalValue: li.quantity * li.unitValue,
          })),
        },
      },
      include: { lineItems: { orderBy: { lineNumber: 'asc' } } },
    });

    const dto: PoDto = {
      id: po.id,
      poNumber: po.poNumber,
      supplier: po.supplier ?? undefined,
      originCountry: po.originCountry ?? undefined,
      destinationCountry: po.destinationCountry ?? undefined,
      currency: po.currency,
      incoterm: po.incoterm ?? undefined,
      freight: po.freight,
      insurance: po.insurance,
      otherCharges: po.otherCharges,
      source: po.source,
      createdAt: po.createdAt.toISOString(),
      lineItems: po.lineItems.map((li) => ({
        id: li.id,
        lineNumber: li.lineNumber,
        sku: li.sku ?? undefined,
        description: li.description,
        quantity: li.quantity,
        unit: li.unit ?? undefined,
        unitValue: li.unitValue,
        material: li.material ?? undefined,
        originCountry: li.originCountry ?? undefined,
        totalValue: li.totalValue,
      })),
    };

    return NextResponse.json(dto, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json<ApiError>({ error: 'Failed to upload PO.', detail: message }, { status: 500 });
  }
}
