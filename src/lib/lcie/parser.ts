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

/**
 * Parse free-text / pasted PO lines. Returns both the line items AND any
 * PO-level metadata (poNumber, supplier, origin, freight, …) recovered
 * from header lines, so metadata lines do not become spurious line items.
 *
 * A line is accepted as a line item only if it carries a unit price
 * ($X / USD X / etc.) OR matches the "N. description qty unit @ price"
 * pattern. Header / metadata lines are scanned for known prefixes and
 * consumed rather than turned into items.
 */
function parsePlainText(text: string): { items: LineItemInput[]; meta: Partial<PoInput> } {
  const rawLines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const meta: Partial<PoInput> = {};
  const itemLines: string[] = [];

  const num = (s: string | undefined) => (s ? parseFloat(s.replace(/,/g, '')) || 0 : 0);
  const setMetaFromLine = (line: string): boolean => {
    // returns true if the line was consumed as metadata
    const poNum = line.match(/(?:purchase\s+order|po\s*(?:no\.?|number)?|p\.o\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_]{3,})/i);
    if (poNum && !meta.poNumber) { meta.poNumber = poNum[1]; return true; }
    const supplier = line.match(/^supplier\s*[:\-]\s*(.+)$/i);
    if (supplier) { meta.supplier = supplier[1].trim(); return true; }
    const inc = line.match(/incoterm\s*[:\-]\s*([A-Z]{2,3})\b/i);
    if (inc) { meta.incoterm = inc[1].toUpperCase(); }
    const cur = line.match(/currenc(?:y|ies)\s*[:\-]\s*([A-Z]{3})\b/i);
    if (cur) { meta.currency = cur[1].toUpperCase(); }
    const orig = line.match(/origin(?:\s*country)?\s*[:\-]\s*([A-Z]{2})\b/i);
    if (orig) { meta.originCountry = orig[1].toUpperCase(); }
    const dest = line.match(/dest(?:ination)?(?:\s*country)?\s*[:\-]\s*([A-Z]{2})\b/i);
    if (dest) { meta.destinationCountry = dest[1].toUpperCase(); }
    // freight / insurance / other — allow several on one line
    let consumedFreight = false;
    const fr = line.match(/freight\s*[:\-]\s*\$?([\d.,]+)/i);
    if (fr) { meta.freight = (meta.freight ?? 0) + num(fr[1]); consumedFreight = true; }
    const ins = line.match(/insurance\s*[:\-]\s*\$?([\d.,]+)/i);
    if (ins) { meta.insurance = (meta.insurance ?? 0) + num(ins[1]); consumedFreight = true; }
    const oth = line.match(/(?:other|handling|misc)\s*(?:charges?|fees?)?\s*[:\-]\s*\$?([\d.,]+)/i);
    if (oth) { meta.otherCharges = (meta.otherCharges ?? 0) + num(oth[1]); consumedFreight = true; }
    // a pure header line (supplier, origin-only, freight-only) is fully consumed
    if (consumedFreight) return true;
    return inc || cur || orig || dest ? true : false;
  };

  for (const raw of rawLines) {
    // Detect line-item pattern: leading "N." or "N)" or "N-" numbering + a price somewhere
    const hasLineNumber = /^\d+\s*[\.\)\-]\s+/.test(raw);
    const priceMatch = raw.match(/(?:\$|usd|eur|gbp|pkr|inr)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:usd|eur|gbp|pkr|inr)/i);
    // If it's clearly an item line (numbered or priced), keep it as an item
    if (hasLineNumber || priceMatch) {
      itemLines.push(raw);
      continue;
    }
    // otherwise try to consume as metadata
    if (!setMetaFromLine(raw)) {
      // not metadata and not an item — skip (don't turn prose into items)
    }
  }

  const items: LineItemInput[] = [];
  let autoLine = 1;
  for (const raw of itemLines) {
    const parsed = parseItemLine(raw, autoLine);
    if (parsed) {
      items.push(parsed);
      autoLine = parsed.lineNumber + 1;
    }
  }
  return { items, meta };
}

/* Trade units only — deliberately excludes spec/volume units (ml, l, g, m, w, v,
   ah, cm, k) that appear inside product descriptions like "350ml", "18V", "9W",
   "3000K", "2.0Ah", "27cm". This stops "350ml" being mis-read as qty=350. */
const TRADE_UNITS: Record<string, string> = {
  pcs: 'PCS', pc: 'PCS', piece: 'PCS', pieces: 'PCS', unit: 'PCS', units: 'PCS',
  set: 'SET', sets: 'SET',
  ctn: 'CTN', carton: 'CTN', cartons: 'CTN', case: 'CS', cases: 'CS',
  box: 'BX', boxes: 'BX', bxs: 'BX',
  kg: 'KG', kgs: 'KG', kilo: 'KG', kilos: 'KG',
  pr: 'PR', pair: 'PR', pairs: 'PR',
  dz: 'DZ', dozen: 'DZ',
  roll: 'RL', rolls: 'RL', rl: 'RL',
  m: 'M', mt: 'M',
};
const TRADE_UNIT_RE = new RegExp(
  `\\b(\\d[\\d.,]*)\\s*(${Object.keys(TRADE_UNITS).join('|')})\\b`,
  'gi',
);
const PRICE_RE = /(?:\$|usd|eur|gbp|pkr|inr|rs\.?)\s*([\d.,]+)|([\d.,]+)\s*(?:usd|eur|gbp|pkr|inr)/gi;
const SKU_RE = /\b([A-Z]{2,}[-_][A-Z0-9]{1,}(?:[-_][A-Z0-9]+)*)\b/;
const SKU_LABEL_RE = /(?:p\/n|part\s*(?:no\.?|number|#)?|sku|item\s*(?:no\.?|code)?|mpn)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_]{2,})\b/i;

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, '')) || 0;
}

/**
 * Parse one PO line into { sku, description, quantity, unit, unitValue, totalValue }.
 *
 * Order of operations:
 *   1. Strip the line-number prefix ("1  ", "1. ", "1) ", "1- ").
 *   2. Extract the SKU / part number (hyphenated code or labelled "P/N:").
 *   3. Find ALL price tokens ($-prefixed). unitPrice = first; lineTotal = last.
 *   4. Quantity = round(lineTotal / unitPrice) when both are present and differ
 *      (uses the PO's own stated total → always correct), else a "number + trade
 *      unit" match (PCS/SET/CTN/KG/PR/DZ/…), else 1.
 *   5. Build the description from whatever's left, minus sku / qty+unit / prices.
 */
function parseItemLine(raw: string, fallbackLine: number): LineItemInput | null {
  let line = raw.trim();
  if (!line) return null;

  // 1. line-number prefix
  let lineNumber = fallbackLine;
  const lnMatch = line.match(/^(\d{1,3})\s*[\.\)\-:]?\s{1,}/);
  if (lnMatch) {
    lineNumber = parseInt(lnMatch[1], 10);
    line = line.slice(lnMatch[0].length).trim();
  }

  // 2. SKU / part number
  let sku: string | undefined;
  const labelled = line.match(SKU_LABEL_RE);
  if (labelled) {
    sku = labelled[1].toUpperCase();
    line = line.replace(labelled[0], ' ');
  } else {
    const code = line.match(SKU_RE);
    if (code) {
      sku = code[1];
      line = line.replace(code[0], ' ');
    }
  }

  // 3. all price tokens
  PRICE_RE.lastIndex = 0;
  const prices: number[] = [];
  const priceSpans: [number, number][] = [];
  let pm: RegExpExecArray | null;
  while ((pm = PRICE_RE.exec(line)) !== null) {
    const v = parseNum(pm[1] ?? pm[2]);
    if (v > 0) {
      prices.push(v);
      priceSpans.push([pm.index, pm.index + pm[0].length]);
    }
  }
  const unitValue = prices.length >= 1 ? prices[0] : 0;
  const lineTotal = prices.length >= 2 ? prices[prices.length - 1] : undefined;

  // 4. quantity — derive from total÷unit when possible (most reliable)
  let quantity = 1;
  let unit: string | undefined;
  // capture ALL trade-unit matches; use the LAST one (closest to the price) as
  // the order quantity — this avoids picking up product-size specs like "1kg"
  // or "350ml" that appear earlier in the description.
  TRADE_UNIT_RE.lastIndex = 0;
  let tradeMatch: RegExpExecArray | null;
  const trades: RegExpExecArray[] = [];
  while ((tradeMatch = TRADE_UNIT_RE.exec(line)) !== null) {
    trades.push(tradeMatch);
  }
  const lastTrade = trades[trades.length - 1] ?? null;
  if (lastTrade) {
    unit = TRADE_UNITS[(lastTrade[2] ?? '').toLowerCase()] ?? (lastTrade[2] ?? '').toUpperCase();
  }

  if (lineTotal !== undefined && unitValue > 0 && Math.abs(lineTotal - unitValue) > 0.009) {
    const q = lineTotal / unitValue;
    quantity = Math.round(q * 100) / 100; // keep up to 2 dp (e.g. 1.5 sets)
    if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
  } else if (lastTrade) {
    quantity = parseNum(lastTrade[1]);
    if (quantity <= 0) quantity = 1;
  } else {
    // fallback: a bare number (not in a price, not a spec) — usually a qty
    // written after the price, e.g. "Cotton tee $3.20 5000"
    const bare = [...line.matchAll(/\b(\d[\d.,]*)\b/g)]
      .map((m) => ({ val: parseNum(m[1]), idx: m.index ?? 0, raw: m[0] }))
      .filter((x) => x.val > 1 && !priceSpans.some(([s, e]) => x.idx >= s && x.idx < e));
    bare.sort((a, b) => b.val - a.val);
    if (bare.length > 0) quantity = bare[0].val;
  }

  // 5. description — strip sku (already gone), prices, qty+trade-unit tokens
  let description = line;
  // remove price spans (work back-to-front so indices stay valid)
  for (const [s, e] of priceSpans.sort((a, b) => b[0] - a[0])) {
    description = description.slice(0, s) + ' ' + description.slice(e);
  }
  // remove trade-unit tokens (number + trade unit)
  description = description.replace(TRADE_UNIT_RE, ' ');
  // tidy
  description = description
    .replace(/@/g, ' ')
    .replace(/\s*[,;:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description && !sku) return null;
  if (!description) description = sku ?? `Line ${lineNumber}`;

  return {
    lineNumber,
    sku,
    description,
    quantity,
    unit,
    unitValue,
    totalValue: lineTotal !== undefined ? lineTotal : Math.round(quantity * unitValue * 100) / 100,
  };
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
    const { items, meta: parsedMeta } = parsePlainText(text);
    lineItems = items;
    extractedMeta = { ...parsedMeta, ...extractedMeta };
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
