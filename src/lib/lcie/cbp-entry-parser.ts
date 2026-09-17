/**
 * CBP Form 7501 (US Customs Entry Summary) parser — extracts the real
 * duty stack from a CBP entry so the LCIE engine's output can be compared
 * side-by-side against the actual filed entry (ground truth).
 *
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

import type { CbpEntry, CbpEntryLine, CbpEntryProvision } from './types';

function num(s: string | undefined | null): number {
  if (!s) return 0;
  const n = parseFloat(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
}
function pctToDecimal(s: string | undefined | null): number {
  if (!s) return 0;
  const t = String(s).trim().replace(/%/g, '').trim();
  if (/^free$/i.test(t)) return 0;
  const n = parseFloat(t.replace(/,/g, ''));
  if (!Number.isFinite(n)) return 0;
  return n / 100;
}
/** Collapse PDF spaced-out headings ("E N T E R E D V A L U E" → "ENTERED VALUE"). */
function collapseSpacedCaps(s: string): string {
  return s.replace(/([A-Z])\s(?=[A-Z])/g, '$1').replace(/\s{2,}/g, ' ');
}
function match1(s: string, re: RegExp): string | null {
  const m = s.match(re);
  return m ? (m[1] ?? m[0]).trim() : null;
}

/**
 * Parse the raw text extracted from a CBP Form 7501 duty-stack analysis PDF.
 */
export function parseCbpEntry(raw: string): CbpEntry {
  const text = raw.replace(/\u00a0/g, ' ').replace(/\r/g, '');
  const flat = collapseSpacedCaps(text.replace(/\n+/g, ' ').replace(/\s+/g, ' '));

  // ---- header fields ----
  const entryNumber = match1(flat, /Entry\s*(?:No\.?|Number)?\s*[:#]?\s*(H\d{2}-\d+-\d+)/i) ?? match1(flat, /(H\d{2}-\d+-\d+)/);
  const port = match1(flat, /Pembina,?\s*ND/) ?? match1(flat, /Port\s*\d{3,4}\s*[—\-]?\s*([A-Za-z .,]+)/);
  const modeOfTransport = match1(flat, /Mode of Transport\s*\d{1,2}\s*[—\-]\s*([A-Za-z]+)/) ?? match1(flat, /\b(Rail|Ocean|Air|Truck|Vessel)\b/);
  const countryOfOrigin = match1(flat, /Country of Origin\s*[:\-]?\s*(CN|US|GB|DE|FR|NL|IT|ES|JP|KR|TW|VN|IN|MX|CA)\b/) ?? match1(flat, /Exporting Country\s*([A-Z]{2})/);
  const enteredValue = num(match1(flat, /ENTERED\s*VALUE\s*\$?([\d.,]+)/i) ?? match1(flat, /total invoice\s*\$?([\d.,]+)/i));
  const grandTotal = num(match1(flat, /GRAND\s*TOTAL\s*\$?([\d.,]+)/i) ?? match1(flat, /ascertained[^$]*\$([\d.,]+)/i));
  const effectiveDutyPct = num(match1(flat, /EFFECTIVE\s*DUTY\s*([\d.]+)%/i) ?? match1(flat, /([\d.]+)%\s*stacked/i));
  const hmfAssessed = !/no\s+harbor\s+maintenance\s+fee\s*\(?HMF\)?\s*was\s+assessed/i.test(text) && /\bhmf\b/i.test(text) && !/not\s+assessed/i.test(text);

  // ---- line-by-line duty stack ----
  // Base HTS markers (8421.21.0000, 6815.19.0000) — NOT Chapter-99 provisions (9903.xx.xx),
  // which appear in the explanatory text. Each line block runs from one base HTS to the next.
  const lines: CbpEntryLine[] = [];
  const htsSplits: { idx: number; hts: string }[] = [];
  const htsRe = /HTS\s*(\d{4}\.\d{2}(?:\.\d{2,4})?)/g;
  let m: RegExpExecArray | null;
  while ((m = htsRe.exec(text)) !== null) {
    const code = m[1];
    if (code.startsWith('99')) continue; // skip Chapter-99 override provisions in the explanation
    htsSplits.push({ idx: m.index, hts: code });
  }
  for (let i = 0; i < htsSplits.length; i++) {
    const start = htsSplits[i].idx;
    const end = i + 1 < htsSplits.length ? htsSplits[i + 1].idx : text.indexOf('Table 3');
    const block = text.slice(start, end > start ? end : text.length);

    const hts = htsSplits[i].hts;
    const descMatch = block.match(/HTS\s*\d{4}\.\d{2}(?:\.\d{2,4})?\s*([^\n]+)/);
    const description = (descMatch?.[1] ?? '').replace(/^[\s—\-]+/, '').replace(/\s*\d{1,2}\/\d{1,2}\/\d{2,4}.*/, '').trim();
    const lineEntered = num(match1(block, /FREE\s+([\d.,]+)/) ?? match1(block, /\b(\d[\d.,]{3,})\s+\d[\d.,]*\.\d{2}\s*$/m));

    const provisions: CbpEntryProvision[] = [];
    // 9903.xx.xx rows: code — description ... rate% ... enteredValue ... amount
    const provRe = /(9903\.\d{2}\.\d{2})\s*[—\-]?\s*([^\n]+?)\n[\s\S]*?(\d+(?:\.\d+)?)%\s+([\d.,]+)\s+([\d.,]+)/g;
    let pm: RegExpExecArray | null;
    while ((pm = provRe.exec(block)) !== null) {
      provisions.push({ code: pm[1], description: pm[2].trim(), rate: pctToDecimal(pm[3]), amount: num(pm[5]) });
    }
    // MPF row
    const mpfMatch = block.match(/Merchandise Processing Fee[^\n]*?\n[\s\S]*?(\d+(?:\.\d+)?)%\s+([\d.,]+)\s+([\d.,]+)/i);
    if (mpfMatch) {
      provisions.push({ code: 'MPF', description: 'Merchandise Processing Fee (ad valorem)', rate: pctToDecimal(mpfMatch[1]), amount: num(mpfMatch[3]) });
    }
    // Base FREE row
    if (/Base column-1 duty\s+FREE/i.test(block)) {
      provisions.unshift({ code: 'Base', description: 'Base column-1 duty (MFN)', rate: 0, amount: 0 });
    }
    const lineTotal = provisions.reduce((s, p) => s + p.amount, 0);
    lines.push({ lineNumber: i + 1, hts, description, enteredValue: lineEntered, provisions, lineTotal });
  }

  return {
    entryNumber: entryNumber ?? undefined,
    port: port ?? undefined,
    modeOfTransport: modeOfTransport ?? undefined,
    countryOfOrigin: countryOfOrigin ?? undefined,
    enteredValue,
    grandTotal,
    effectiveDutyPct,
    hmfAssessed,
    lines,
    rawText: raw,
  };
}
