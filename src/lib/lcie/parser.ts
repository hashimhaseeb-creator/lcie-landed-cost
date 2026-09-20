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
  // ---- Inline Incoterms inference ----
  // Catches both "incoterm: FOB" (explicit) and "FOB Shenzhen" / "CIF Hamburg"
  // inline patterns that appear in PO description / delivery-terms lines.
  // Only Incoterms 2020 valid codes are recognised: EXW, FCA, FAS, FOB, CFR,
  // CIF, CPT, CIP, DAP, DPU, DDP.
  const INCOTERMS_REGEX = /\b(?:incoterm\s*[:\-]\s*)?(EXW|FCA|FAS|FOB|CFR|CIF|CPT|CIP|DAP|DPU|DDP)\b(?:\s+[A-Z][a-zA-Z]+)?/i;
  // ---- Origin country inference from supplier / city / port mentions ----
  // Maps well-known supplier cities + ports to ISO-2 country codes. Only
  // used when the PO text mentions them — never falls back to 'CN' blindly.
  const CITY_TO_ISO: Record<string, string> = {
    // CN
    'shenzhen': 'CN', 'shanghai': 'CN', 'guangzhou': 'CN', 'ningbo': 'CN', 'qingdao': 'CN', 'beijing': 'CN', 'hong kong': 'CN', 'hongkong': 'CN', 'yiwu': 'CN', 'xiamen': 'CN', 'tianjin': 'CN', 'dalian': 'CN',
    // TR
    'istanbul': 'TR', 'izmir': 'TR', 'bursa': 'TR', 'ankara': 'TR', 'mersin': 'TR',
    // IN
    'mumbai': 'IN', 'delhi': 'IN', 'chennai': 'IN', 'kolkata': 'IN', 'bangalore': 'IN', 'ahmedabad': 'IN', 'surat': 'IN',
    // PK
    'karachi': 'PK', 'lahore': 'PK', 'faisalabad': 'PK', 'sialkot': 'PK',
    // BD
    'dhaka': 'BD', 'chittagong': 'BD',
    // VN
    'hanoi': 'VN', 'ho chi minh': 'VN', 'hcmc': 'VN', 'haiphong': 'VN',
    // TH
    'bangkok': 'TH', 'laem chabang': 'TH',
    // ID
    'jakarta': 'ID', 'surabaya': 'ID',
    // MY
    'kuala lumpur': 'MY', 'penang': 'MY', 'port klang': 'MY',
    // KR
    'seoul': 'KR', 'busan': 'KR', 'incheon': 'KR',
    // JP
    'tokyo': 'JP', 'osaka': 'JP', 'yokohama': 'JP', 'nagoya': 'JP', 'kobe': 'JP',
    // DE / EU
    'hamburg': 'DE', 'bremen': 'DE', 'munich': 'DE', 'berlin': 'DE', 'frankfurt': 'DE', 'stuttgart': 'DE',
    'rotterdam': 'NL', 'amsterdam': 'NL',
    'felixstowe': 'GB', 'southampton': 'GB', 'london': 'GB',
    'le havre': 'FR', 'marseille': 'FR', 'paris': 'FR',
    'genoa': 'IT', 'naples': 'IT', 'milan': 'IT',
    'barcelona': 'ES', 'valencia': 'ES', 'madrid': 'ES',
    // AU
    'sydney': 'AU', 'melbourne': 'AU', 'brisbane': 'AU', 'fremantle': 'AU', 'perth': 'AU',
    // US
    'los angeles': 'US', 'long beach': 'US', 'new york': 'US', 'newark': 'US', 'savannah': 'US', 'miami': 'US', 'chicago': 'US', 'dallas': 'US', 'seattle': 'US',
    // MX
    'manzanillo': 'MX', 'veracruz': 'MX', 'mexico city': 'MX',
    // BR
    'santos': 'BR', 'são paulo': 'BR', 'rio de janeiro': 'BR',
    // AE
    'dubai': 'AE', 'jebel ali': 'AE', 'abu dhabi': 'AE',
    // SA
    'jeddah': 'SA', 'riyadh': 'SA', 'dammam': 'SA',
  };
  // Map of supplier-name substrings to ISO-2 (only for patterns that
  // explicitly name the country — e.g. "Co., Ltd. China", "Industries India").
  const SUPPLIER_COUNTRY_REGEX = /\b(?:china|prc|peoples?\s+republic\s+of\s+china|india|pakistan|bangladesh|vietnam|thailand|indonesia|malaysia|turkey|germany|netherlands|united\s+kingdom|france|italy|spain|australia|united\s+states|mexico|brazil|uae|saudi)\b/i;

  // Tracks whether Incoterms was inferred from inline text vs. explicit field.
  let incotermInferred = false;
  let originInferred = false;

  const setMetaFromLine = (line: string): boolean => {
    // returns true if the line was consumed as metadata
    const poNum = line.match(/(?:purchase\s+order|po\s*(?:no\.?|number)?|p\.o\.?)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_]{3,})/i);
    if (poNum && !meta.poNumber) { meta.poNumber = poNum[1]; return true; }
    const supplier = line.match(/^supplier\s*[:\-]\s*(.+)$/i);
    if (supplier) { meta.supplier = supplier[1].trim(); return true; }
    // Incoterms — explicit "incoterm: FOB" first, then inline "FOB Shenzhen" / "delivered FOB"
    if (!meta.incoterm) {
      const incExplicit = line.match(/incoterm\s*[:\-]\s*([A-Z]{2,3})\b/i);
      if (incExplicit) {
        meta.incoterm = incExplicit[1].toUpperCase();
      } else {
        const incInline = line.match(INCOTERMS_REGEX);
        if (incInline) {
          meta.incoterm = incInline[1].toUpperCase();
          incotermInferred = true;
        }
      }
    }
    const cur = line.match(/currenc(?:y|ies)\s*[:\-]\s*([A-Z]{3})\b/i);
    if (cur) { meta.currency = cur[1].toUpperCase(); }
    // Origin — explicit "origin: CN" first
    const orig = line.match(/origin(?:\s*country)?\s*[:\-]\s*([A-Z]{2})\b/i);
    if (orig) { meta.originCountry = orig[1].toUpperCase(); }
    const dest = line.match(/dest(?:ination)?(?:\s*country)?\s*[:\-]\s*([A-Z]{2})\b/i);
    if (dest) { meta.destinationCountry = dest[1].toUpperCase(); }
    // Origin — inline inference from supplier-city / port mention
    if (!meta.originCountry) {
      const lower = line.toLowerCase();
      for (const [city, iso] of Object.entries(CITY_TO_ISO)) {
        if (lower.includes(city)) { meta.originCountry = iso; originInferred = true; break; }
      }
    }
    // Origin — inline inference from supplier name pattern (e.g. "...Co., Ltd. China")
    if (!meta.originCountry) {
      const supCountryMatch = line.match(SUPPLIER_COUNTRY_REGEX);
      if (supCountryMatch) {
        const c = supCountryMatch[0].toLowerCase();
        const map: Record<string, string> = {
          'china': 'CN', 'prc': 'CN', 'peoples republic of china': 'CN', 'people\'s republic of china': 'CN',
          'india': 'IN', 'pakistan': 'PK', 'bangladesh': 'BD', 'vietnam': 'VN', 'thailand': 'TH',
          'indonesia': 'ID', 'malaysia': 'MY', 'turkey': 'TR', 'germany': 'DE', 'netherlands': 'NL',
          'united kingdom': 'GB', 'france': 'FR', 'italy': 'IT', 'spain': 'ES', 'australia': 'AU',
          'united states': 'US', 'mexico': 'MX', 'brazil': 'BR', 'uae': 'AE', 'saudi': 'SA',
        };
        for (const [k, v] of Object.entries(map)) {
          if (c.includes(k)) { meta.originCountry = v; originInferred = true; break; }
        }
      }
    }
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
    return !!(cur || orig || dest);
  };

  const items: LineItemInput[] = [];
  let autoLine = 1;

  // Bracket mode: many real-world POs (e.g. P00775) lay each item across several
  // text lines after PDF extraction — the `[SKU]` marker on one line, the time on
  // the next, and the "QTY Units UNIT_PRICE $ LINE_TOTAL" on a third. Group those
  // physical lines into one logical item block before parsing.
  const bracketMode = rawLines.some((l) => /^\s*\[/.test(l));
  if (bracketMode) {
    const blocks: string[] = [];
    let cur: string | null = null;
    for (const raw of rawLines) {
      const line = raw.trim();
      if (!line) continue;
      const startsNew = /^\[/.test(line);
      const curComplete = cur !== null && /\$/.test(cur); // block already has its price row → item done
      if (startsNew || curComplete) {
        if (cur) { blocks.push(cur); cur = null; }
      }
      if (startsNew) {
        cur = line;
      } else if (cur !== null) {
        cur += ' ' + line;
      } else {
        // header / footer line outside any item block → try metadata
        setMetaFromLine(line);
      }
    }
    if (cur) blocks.push(cur);
    for (const block of blocks) {
      const parsed = parseItemLine(block, autoLine);
      if (parsed) { items.push(parsed); autoLine = parsed.lineNumber + 1; }
    }
    return { items, meta };
  }

  // Non-bracket mode: each physical line is a candidate item line.
  for (const raw of rawLines) {
    const hasLineNumber = /^\d+\s*[\.\)\-]\s+/.test(raw);
    const priceMatch = raw.match(/(?:\$|usd|eur|gbp|pkr|inr)\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*(?:usd|eur|gbp|pkr|inr)/i);
    if (hasLineNumber || priceMatch) {
      itemLines.push(raw);
      continue;
    }
    setMetaFromLine(raw);
  }
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
const SKU_BRACKET_RE = /\[([A-Z0-9][A-Z0-9\-_./]{2,})\]/;
const SKU_LABEL_RE = /(?:p\/n|part\s*(?:no\.?|number|#)?|sku|item\s*(?:no\.?|code)?|mpn)\s*[:#]?\s*([A-Z0-9][A-Z0-9\-_]{2,})\b/i;
// The real-world PO tail: "QTY  Units  UNIT_PRICE  $  LINE_TOTAL" — note the unit
// price is a BARE number (no $), and only the line TOTAL carries the $ prefix.
const TAIL_RE = new RegExp(
  `\\b(\\d[\\d.,]*)\\s*(${Object.keys(TRADE_UNITS).join('|')})\\s+(\\d[\\d.,]*)\\s*\\$\\s*([\\d.,]+)`,
  'i',
);
const DATE_RE = /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g;
const TIME_RE = /\b\d{1,2}:\d{2}(?::\d{2})?\s?(?:[ap]\.?m\.?)?\b/gi;

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/,/g, '')) || 0;
}

/**
 * Parse one PO line (or a multi-line item block, already concatenated) into
 * { sku, description, quantity, unit, unitValue, totalValue }.
 *
 * Order of operations:
 *   1. Strip the line-number prefix ("1  ", "1. ", "1) ", "1- ").
 *   2. Extract the SKU / part number — bracketed [SKU], labelled "P/N:", or a
 *      hyphenated code (DR-CORD-18). Remove every occurrence from the line.
 *   3. Strip dates (MM/DD/YYYY) and times (HH:MM:SS) so their digits can't be
 *      mis-read as qty / unit price.
 *   4. Try the real-world PO tail: "QTY Units UNIT_PRICE $ LINE_TOTAL" — here the
 *      unit price is a BARE number and only the line TOTAL carries the $.
 *      Fallback: collect all $-prices (first=unit, last=total) and/or a
 *      "number + trade-unit" match.
 *   5. Build the description from whatever's left, minus sku / dates / qty+unit /
 *      prices.
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

  // 2. SKU / part number — bracketed [SKU] first, then labelled, then hyphenated
  let sku: string | undefined;
  const bracket = line.match(SKU_BRACKET_RE);
  if (bracket) {
    sku = bracket[1];
    line = line.replace(bracket[0], ' ');
  }
  const labelled = line.match(SKU_LABEL_RE);
  if (labelled) {
    sku = labelled[1].toUpperCase();
    line = line.replace(labelled[0], ' ');
  }
  // remove any (remaining) hyphenated SKU codes — incl. the unbracketed duplicate
  // that usually follows a bracketed marker, e.g. "[USWF-TK-…] USWF-TK-…"
  line = line.replace(SKU_RE, ' ');
  if (!sku) {
    const code = raw.match(SKU_RE); // fall back to first hyphenated code on the raw line
    if (code) sku = code[1];
  }

  // 3. strip dates and times (their digits would otherwise pollute qty/price logic)
  line = line.replace(DATE_RE, ' ').replace(TIME_RE, ' ');

  // 4. Try the real-world PO tail: QTY  UoM  UNIT_PRICE  $  LINE_TOTAL
  const tail = line.match(TAIL_RE);
  let quantity = 1;
  let unit: string | undefined;
  let unitValue = 0;
  let lineTotal: number | undefined;
  const priceSpans: [number, number][] = [];

  if (tail) {
    quantity = parseNum(tail[1]);
    unit = TRADE_UNITS[(tail[2] ?? '').toLowerCase()] ?? (tail[2] ?? '').toUpperCase();
    unitValue = parseNum(tail[3]);
    lineTotal = parseNum(tail[4]);
    line = line.replace(tail[0], ' ');
  } else {
    // fallback: collect all $-prefixed prices
    PRICE_RE.lastIndex = 0;
    const prices: number[] = [];
    let pm: RegExpExecArray | null;
    while ((pm = PRICE_RE.exec(line)) !== null) {
      const v = parseNum(pm[1] ?? pm[2]);
      if (v > 0) {
        prices.push(v);
        priceSpans.push([pm.index, pm.index + pm[0].length]);
      }
    }
    unitValue = prices.length >= 1 ? prices[0] : 0;
    lineTotal = prices.length >= 2 ? prices[prices.length - 1] : undefined;

    // quantity — total÷unit when possible, else last trade-unit, else bare number
    TRADE_UNIT_RE.lastIndex = 0;
    const trades: RegExpExecArray[] = [];
    let tm: RegExpExecArray | null;
    while ((tm = TRADE_UNIT_RE.exec(line)) !== null) trades.push(tm);
    const lastTrade = trades[trades.length - 1] ?? null;
    if (lastTrade) {
      unit = TRADE_UNITS[(lastTrade[2] ?? '').toLowerCase()] ?? (lastTrade[2] ?? '').toUpperCase();
    }
    if (lineTotal !== undefined && unitValue > 0 && Math.abs(lineTotal - unitValue) > 0.009) {
      quantity = Math.round((lineTotal / unitValue) * 100) / 100;
      if (!Number.isFinite(quantity) || quantity <= 0) quantity = 1;
    } else if (lastTrade) {
      quantity = parseNum(lastTrade[1]);
      if (quantity <= 0) quantity = 1;
    } else {
      const bare = [...line.matchAll(/\b(\d[\d.,]*)\b/g)]
        .map((m) => ({ val: parseNum(m[1]), idx: m.index ?? 0 }))
        .filter((x) => x.val > 1 && !priceSpans.some(([s, e]) => x.idx >= s && x.idx < e))
        .sort((a, b) => b.val - a.val);
      if (bare.length > 0) quantity = bare[0].val;
    }
  }

  // 5. description — strip remaining prices + trade-unit tokens, tidy
  let description = line;
  for (const [s, e] of priceSpans.sort((a, b) => b[0] - a[0])) {
    description = description.slice(0, s) + ' ' + description.slice(e);
  }
  description = description
    .replace(TRADE_UNIT_RE, ' ')
    .replace(/@/g, ' ')
    .replace(/\s*[,;:\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!description && !sku) return null;
  // if the description has no letters (just digits / punctuation / fragments
  // left over from a line-wrapped SKU), fall back to the SKU as the description.
  if (!description || !/[a-zA-Z]/.test(description)) {
    description = sku ?? `Line ${lineNumber}`;
  }

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
    // Origin + Incoterms fallbacks are NOW `undefined` (not 'CN'/'US'/'FOB')
    // when the parser couldn't infer them from the PO text — the upload UI
    // shows "—" instead of a fake default, and the user must set them via
    // the meta field on the upload-po route OR via the destination dropdown
    // before running the agent. The user can still override via the explicit
    // meta field on the upload-po route.
    originCountry: meta?.originCountry ?? extractedMeta.originCountry ?? undefined,
    destinationCountry: meta?.destinationCountry ?? extractedMeta.destinationCountry ?? undefined,
    currency: meta?.currency ?? extractedMeta.currency ?? 'USD',
    incoterm: meta?.incoterm ?? extractedMeta.incoterm ?? undefined,
    // NOTE: inference provenance (incotermInferred, originInferred) is computed
    // locally and logged on the server; not exposed on the returned PoInput
    // shape because the type is strict. If the UI later needs to surface
    // "inferred from supplier city 'Shenzhen'", add an optional field to the
    // PoInput type.
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
