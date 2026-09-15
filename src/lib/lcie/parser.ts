/**
 * LCIE PO Parser — accepts CSV, JSON, or pasted text from an uploaded PO
 * Green G(P)4 Supply Chain Framework
 *
 * Supports:
 *  - JSON array of line items, or a full { poNumber, ..., lineItems } object
 *  - CSV with a header row containing description/qty/unit value columns
 *  - Plain "PO-like" text pasted by a procurement clerk
 */

import type { LineItemInput, PoInput } from './types';

const HEADER_ALIASES: Record<string, keyof LineItemInput> = {
  lineno: 'lineNumber',
  linenumber: 'lineNumber',
  line: 'lineNumber',
  item: 'description',
  description: 'description',
  product: 'description',
  productname: 'description',
  sku: 'sku',
  partnumber: 'sku',
  part: 'sku',
  qty: 'quantity',
  quantity: 'quantity',
  uom: 'unit',
  unit: 'unit',
  unitvalue: 'unitValue',
  unitprice: 'unitValue',
  price: 'unitValue',
  unitcost: 'unitValue',
  cost: 'unitValue',
  material: 'material',
  origin: 'originCountry',
  country: 'originCountry',
};

function parseCsv(text: string): LineItemInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length < 2) return [];

  const splitRow = (row: string): string[] => {
    const cells: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') {
        if (inQ && row[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQ = !inQ;
        }
      } else if (c === ',' && !inQ) {
        cells.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
    cells.push(cur);
    return cells.map((c) => c.trim());
  };

  const headerCells = splitRow(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );
  const colMap: { col: number; field: keyof LineItemInput }[] = [];
  headerCells.forEach((hc, i) => {
    const f = HEADER_ALIASES[hc];
    if (f) colMap.push({ col: i, field: f });
  });
  if (!colMap.some((c) => c.field === 'description')) return [];

  const items: LineItemInput[] = [];
  let autoLine = 1;
  for (let r = 1; r < lines.length; r++) {
    const cells = splitRow(lines[r]);
    if (cells.length === 0) continue;
    const obj: Partial<LineItemInput> = {};
    for (const { col, field } of colMap) {
      const val = cells[col];
      if (val === undefined) continue;
      if (field === 'quantity' || field === 'unitValue') {
        const n = parseFloat(val.replace(/[^0-9.\-]/g, ''));
        (obj as Record<string, unknown>)[field] = isNaN(n) ? 0 : n;
      } else if (field === 'lineNumber') {
        const n = parseInt(val, 10);
        (obj as Record<string, unknown>)[field] = isNaN(n) ? autoLine : n;
      } else {
        (obj as Record<string, unknown>)[field] = val;
      }
    }
    if (!obj.description) continue;
    if (!obj.lineNumber) obj.lineNumber = autoLine;
    if (obj.quantity === undefined) obj.quantity = 1;
    if (obj.unitValue === undefined) obj.unitValue = 0;
    autoLine++;
    items.push(obj as LineItemInput);
  }
  return items;
}

function parsePlainText(text: string): LineItemInput[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const items: LineItemInput[] = [];
  let autoLine = 1;
  for (const raw of lines) {
    const line = raw.replace(/^\d+[\.\)\-]\s*/, '');
    const qtyMatch = line.match(/(\d+(?:[.,]\d+)?)\s*(pcs|pieces|pc|sets|set|kg|kgs|m|units|ctn|cartons?|pairs?|pr|dozen|dz)?\b/i);
    const priceMatch = line.match(/(?:\$|usd|eur|gbp|pkr|inr)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:usd|eur|gbp|pkr|inr)/i);
    let description = line;
    let quantity = 1;
    let unit: string | undefined;
    let unitValue = 0;

    if (qtyMatch) {
      quantity = parseFloat(qtyMatch[1].replace(',', ''));
      const uom = qtyMatch[2]?.toLowerCase();
      if (uom) {
        const map: Record<string, string> = {
          pcs: 'PCS', pc: 'PCS', pieces: 'PCS', piece: 'PCS',
          sets: 'SET', set: 'SET',
          kg: 'KG', kgs: 'KG',
          m: 'M', units: 'PCS', ctn: 'CTN', carton: 'CTN', cartons: 'CTN',
          pair: 'PR', pairs: 'PR', dozen: 'DZ', dz: 'DZ',
        };
        unit = map[uom] ?? uom.toUpperCase();
      }
    }
    if (priceMatch) {
      const p = priceMatch[1] ?? priceMatch[2];
      if (p) unitValue = parseFloat(p.replace(',', ''));
    }

    description = description
      .replace(qtyMatch?.[0] ?? '', ' ')
      .replace(priceMatch?.[0] ?? '', ' ')
      .replace(/\s+/g, ' ')
      .replace(/[@—–-]+\s*$/g, '')
      .trim();

    if (!description) continue;
    items.push({
      lineNumber: autoLine++,
      description,
      quantity,
      unit,
      unitValue,
    });
  }
  return items;
}

/**
 * Parse an uploaded PO payload (JSON, CSV, or plain text) into a normalized PoInput.
 */
export function parsePoPayload(
  rawText: string,
  meta?: Partial<PoInput>,
): PoInput {
  const text = rawText.trim();
  if (!text) throw new Error('Empty PO payload.');

  let lineItems: LineItemInput[] = [];
  let extractedMeta: Partial<PoInput> = {};

  if (text.startsWith('{') || text.startsWith('[')) {
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        lineItems = parsed.map((li, i) => normalizeLineItem(li, i));
      } else if (parsed && typeof parsed === 'object') {
        const { lineItems: li, poNumber, supplier, originCountry, ...rest } = parsed as Record<string, unknown>;
        if (Array.isArray(li)) lineItems = li.map((x, i) => normalizeLineItem(x, i));
        if (typeof poNumber === 'string') extractedMeta.poNumber = poNumber;
        if (typeof supplier === 'string') extractedMeta.supplier = supplier;
        if (typeof originCountry === 'string') extractedMeta.originCountry = originCountry;
        for (const k of ['destinationCountry', 'currency', 'incoterm', 'freight', 'insurance', 'otherCharges'] as const) {
          if (k in parsed) (extractedMeta as Record<string, unknown>)[k] = parsed[k];
        }
      }
    } catch {
      // not JSON — fall through
    }
  }

  if (lineItems.length === 0 && text.includes(',')) {
    lineItems = parseCsv(text);
  }

  if (lineItems.length === 0) {
    lineItems = parsePlainText(text);
  }

  if (lineItems.length === 0) {
    throw new Error('Could not parse any line items from the uploaded PO.');
  }

  const poNumber =
    meta?.poNumber ?? extractedMeta.poNumber ?? `PO-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(Math.random() * 9000 + 1000)}`;

  return {
    poNumber,
    supplier: meta?.supplier ?? extractedMeta.supplier ?? undefined,
    originCountry: meta?.originCountry ?? extractedMeta.originCountry ?? 'CN',
    destinationCountry: meta?.destinationCountry ?? extractedMeta.destinationCountry ?? 'US',
    currency: meta?.currency ?? extractedMeta.currency ?? 'USD',
    incoterm: meta?.incoterm ?? extractedMeta.incoterm ?? 'FOB',
    freight: meta?.freight ?? (extractedMeta.freight as number) ?? 0,
    insurance: meta?.insurance ?? (extractedMeta.insurance as number) ?? 0,
    otherCharges: meta?.otherCharges ?? (extractedMeta.otherCharges as number) ?? 0,
    lineItems,
  };
}

function normalizeLineItem(li: unknown, index: number): LineItemInput {
  const o = (li ?? {}) as Record<string, unknown>;
  const description =
    (typeof o.description === 'string' && o.description) ||
    (typeof o.product === 'string' && o.product) ||
    (typeof o.item === 'string' && o.item) ||
    (typeof o.name === 'string' && o.name) ||
    `Line item ${index + 1}`;
  const quantity =
    typeof o.quantity === 'number' ? o.quantity :
    typeof o.qty === 'number' ? o.qty :
    typeof o.quantity === 'string' ? parseFloat(o.quantity) || 1 :
    typeof o.qty === 'string' ? parseFloat(o.qty) || 1 : 1;
  const unitValue =
    typeof o.unitValue === 'number' ? o.unitValue :
    typeof o.unitPrice === 'number' ? o.unitPrice :
    typeof o.price === 'number' ? o.price :
    typeof o.unitValue === 'string' ? parseFloat(o.unitValue) || 0 :
    typeof o.price === 'string' ? parseFloat(o.price) || 0 : 0;
  return {
    lineNumber: typeof o.lineNumber === 'number' ? o.lineNumber : index + 1,
    sku: typeof o.sku === 'string' ? o.sku : undefined,
    description,
    quantity,
    unit: typeof o.unit === 'string' ? o.unit : typeof o.uom === 'string' ? o.uom : 'PCS',
    unitValue,
    material: typeof o.material === 'string' ? o.material : undefined,
    originCountry: typeof o.originCountry === 'string' ? o.originCountry : undefined,
  };
}
