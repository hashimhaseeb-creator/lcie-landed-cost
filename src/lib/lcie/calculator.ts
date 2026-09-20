/**
 * LCIE Landed Cost Calculator (destination-aware)
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 *
 * Computes the duty stack for ONLY the PO's final destination country:
 *   - US → HTS duty on FOB + Section 301 + IEEPA + MPF + HMF (no federal VAT), in USD
 *   - UK → duty on CIF + 20% VAT on (CIF+duty), in GBP (live FX)
 *   - EU → duty on CIF + member-state VAT on (CIF+duty), in EUR / local (live FX)
 *
 * All amounts are computed in the PO (supplier) currency first, then
 * FX-converted to the destination currency using a live ECB reference rate.
 * The customer-supplied landed-cost inputs (freight, insurance, customs
 * broker fee, documentation, duty advance, harbor, inland delivery, …)
 * feed the CIF base and the final landed cost.
 */

import { db } from '@/lib/db';
import { DUTY_RULES } from '@/lib/hs-knowledge-base';
import { resolveDestination } from './destination';
import { getFxRate } from './fx';
import { resolveFta } from './fta';
import type { Region, RegionCalculation, LineBreakdown, CalculateResponse, LandedCostInputs, WaterfallStep, FtaAdvisory } from './types';

export async function calculateLandedCost(
  poId: string,
  inputs: LandedCostInputs = {},
): Promise<CalculateResponse> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: { lineItems: { orderBy: { lineNumber: 'asc' } } },
  });
  if (!po) throw new Error('Purchase order not found.');

  // ---- resolve destination region + currency + VAT ----
  const dest = resolveDestination(po.destinationCountry ?? 'US');
  const region: Region = dest.region;

  // ---- user-supplied landed-cost inputs (default to PO-level values) ----
  const freight = num(inputs.freight ?? po.freight);
  const insurance = num(inputs.insurance ?? po.insurance);
  const otherCharges = num(inputs.otherCharges ?? po.otherCharges);
  const customsBrokerFee = num(inputs.customsBrokerFee);
  const documentationFee = num(inputs.documentationFee);
  const dutyAdvanceFee = num(inputs.dutyAdvanceFee);
  const harborOrPortFee = num(inputs.harborOrPortFee);
  const inlandDelivery = num(inputs.inlandDestinationDelivery);
  const otherImportCharges =
    customsBrokerFee + documentationFee + dutyAdvanceFee + harborOrPortFee + inlandDelivery;

  // ---- FX: PO currency → destination currency ----
  const poCurrency = po.currency ?? 'USD';
  const fx = await getFxRate(poCurrency, dest.currency);
  const x = (n: number) => n * fx.rate; // PO-currency → destination-currency

  // ---- load AI determinations for THIS region only ----
  const determinations = await db.hsDetermination.findMany({
    where: { lineItem: { poId }, region },
  });
  const detByLine = new Map<string, (typeof determinations[number] | undefined)>();
  for (const li of po.lineItems) {
    detByLine.set(li.id, determinations.find((d) => d.lineItemId === li.id));
  }

  const rule = DUTY_RULES[region];
  const subtotalSrc = po.lineItems.reduce((s, li) => s + li.quantity * li.unitValue, 0);

  const lineBreakdown: LineBreakdown[] = [];
  let dutyTotal = 0, section301Total = 0, ieepaTotal = 0,
    chinaReciprocalTotal = 0, cnhkEoTotal = 0, anyCountryTotal = 0,
    vatTotal = 0, hmfTotal = 0, otherLeviesTotal = 0;

  // HMF applies only to ocean-mode shipments (19 U.S.C. §4462). Rail/air/truck = no HMF.
  const mode = (inputs.modeOfTransport ?? 'Ocean').toLowerCase();
  const hmfApplies = region === 'US' && mode.includes('ocean');

  for (const li of po.lineItems) {
    const fobValue = li.quantity * li.unitValue; // PO currency
    const share = subtotalSrc > 0 ? fobValue / subtotalSrc : 0;
    const lineFreight = freight * share;
    const lineInsurance = insurance * share;
    const lineOther = otherCharges * share;
    const cifValue = fobValue + lineFreight + lineInsurance + lineOther; // PO currency

    const det = detByLine.get(li.id);
    const dutyRate = det?.dutyRate ?? 0;
    const vatRate = region === 'US' ? 0 : (det?.vatRate ?? dest.vatRate ?? 0);

    // parse the 2025 Chapter-99 provisions from the determination's additionalLevies JSON.
    // The agent stores: ChinaReciprocal (9903.88.01, 25%), CNHKEO (9903.01.24, 20%),
    // AnyCountry (9903.01.25, 10%), MPF, HMF. Legacy Section301/IEEPA keys are mapped.
    let chinaReciprocalRate = 0, cnhkEoRate = 0, anyCountryRate = 0, lineOtherLevies = 0;
    if (det?.additionalLevies) {
      try {
        const obj = JSON.parse(det.additionalLevies) as Record<string, number>;
        if (region === 'US') {
          chinaReciprocalRate = num(obj.ChinaReciprocal ?? obj.Section301);
          cnhkEoRate = num(obj.CNHKEO ?? obj.CNHK_EO);
          anyCountryRate = num(obj.AnyCountry ?? obj.AnyCountryReciprocal);
          // legacy IEEPA fallback: if only IEEPA present (old determinations), split 20%+10%
          if (!cnhkEoRate && !anyCountryRate && obj.IEEPA) {
            cnhkEoRate = Math.min(0.20, num(obj.IEEPA));
            anyCountryRate = Math.max(0, num(obj.IEEPA) - 0.20) || 0.10;
          }
        }
        // Aggregator: only rates between 0 and 1 (i.e. genuine ad-valorem levy
        // rates) qualify as "other levies" to be multiplied by the cif base.
        // Anything else (e.g. `gstRate: 0.10`, `vatRate: 0.20`, `ipcFlat: 50`)
        // is meta/structural config stored alongside the determination, NOT a
        // duty to be assessed here — the calculator already applies GST/VAT
        // and the flat Import Processing Charge from the DutyRule separately.
        // Excluded keys (US Chapter-99 / MPF / HMF) are also skipped because
        // they are handled as their own waterfall steps.
        const EXCLUDED = new Set([
          'MPF', 'HMF', 'Section301', 'IEEPA',
          'ChinaReciprocal', 'CNHKEO', 'CNHK_EO', 'AnyCountry', 'AnyCountryReciprocal',
          // meta fields stored by the agent — NOT levies to be assessed here:
          'vatRate', 'gstRate', 'ipcFlat', 'ipcFlatLow',
        ]);
        for (const [k, v] of Object.entries(obj)) {
          if (EXCLUDED.has(k)) continue;
          if (typeof v === 'number' && v > 0 && v < 1) {
            lineOtherLevies += cifValue * v;
          }
        }
      } catch { /* ignore */ }
    }
    const isCn = ((li.originCountry ?? po.originCountry ?? 'CN') + '').toUpperCase() === 'CN';
    // 9903.88.01 (25%) + 9903.01.24 (20%) apply only to China origin; 9903.01.25 (10%) to any country.
    const section301Rate = chinaReciprocalRate;            // back-compat alias
    const ieepaRate = cnhkEoRate + anyCountryRate;          // back-compat alias

    const dutyBase = rule.dutyCalcBase === 'CIF' ? cifValue : fobValue;
    const duty = dutyBase * dutyRate;
    const chinaReciprocal = region === 'US' && isCn ? fobValue * chinaReciprocalRate : 0;
    const cnhkEo = region === 'US' && isCn ? fobValue * cnhkEoRate : 0;
    const anyCountry = region === 'US' ? fobValue * anyCountryRate : 0;
    const section301 = chinaReciprocal;                    // back-compat alias
    const ieepa = cnhkEo + anyCountry;                      // back-compat alias
    let hmf = 0;
    if (hmfApplies && rule.hmfRate) hmf = fobValue * rule.hmfRate;
    let vat = 0;
    if (region !== 'US') {
      const vatBase = rule.vatCalcBase === 'CIF_plus_duty' ? cifValue + duty : cifValue;
      vat = vatBase * vatRate;
    }

    dutyTotal += duty;
    section301Total += section301; chinaReciprocalTotal += chinaReciprocal;
    ieepaTotal += ieepa; cnhkEoTotal += cnhkEo; anyCountryTotal += anyCountry;
    vatTotal += vat;
    hmfTotal += hmf;
    otherLeviesTotal += lineOtherLevies;

    lineBreakdown.push({
      lineItemId: li.id,
      lineNumber: li.lineNumber,
      description: li.description,
      hsCode: det?.hsCode ?? '—',
      tariffDescription: det?.tariffDescription ?? undefined,
      dutyRate, dutyType: det?.dutyType ?? 'ad valorem',
      vatRate, section301Rate, ieepaRate,
      chinaReciprocalRate, cnhkEoRate, anyCountryRate,
      confidence: det?.confidence ?? 0,
      reasoning: det?.reasoning ?? undefined,
      fobValue: round(x(fobValue)),
      cifValue: round(x(cifValue)),
      duty: round(x(duty)),
      section301: round(x(section301)),
      ieepa: round(x(ieepa)),
      chinaReciprocal: round(x(chinaReciprocal)),
      cnhkEo: round(x(cnhkEo)),
      anyCountry: round(x(anyCountry)),
      vat: round(x(vat)),
      mpf: 0, // allocated after PO-level MPF
      hmf: round(x(hmf)),
      otherLevies: round(x(lineOtherLevies)),
      lineLandedCost: 0,
    });
  }

  // MPF (US only) at entry level, clamped, then allocated proportionally
  let mpfTotal = 0;
  if (region === 'US' && rule.mpfRate) {
    const raw = subtotalSrc * rule.mpfRate;
    mpfTotal = Math.max(rule.mpfMin ?? 0, Math.min(rule.mpfMax ?? Infinity, raw));
    const mpfDest = x(mpfTotal);
    for (const lb of lineBreakdown) {
      const share = subtotalSrc > 0 ? 0 : 0;
      void share;
      lb.mpf = round(mpfDest * (lineBreakdown.reduce((s, l) => s + l.fobValue, 0) > 0
        ? (lb.fobValue / lineBreakdown.reduce((s, l) => s + l.fobValue, 0))
        : 0));
    }
  }

  // finalize per-line landed cost (destination currency)
  for (const lb of lineBreakdown) {
    const share = lineBreakdown.reduce((s, l) => s + l.fobValue, 0) > 0
      ? lb.fobValue / lineBreakdown.reduce((s, l) => s + l.fobValue, 0)
      : 0;
    lb.lineLandedCost = round(
      lb.fobValue + lb.duty + lb.section301 + lb.ieepa + lb.vat + lb.mpf + lb.hmf + lb.otherLevies +
      x(freight + insurance + otherCharges) * share
    );
  }

  // ---- totals (destination currency) ----
  const subtotal = round(x(subtotalSrc));
  const freightDest = round(x(freight));
  const insuranceDest = round(x(insurance));
  const otherChargesDest = round(x(otherCharges));
  const otherImportChargesDest = round(x(otherImportCharges));
  const cifTotal = round(subtotal + freightDest + insuranceDest + otherChargesDest);

  dutyTotal = round(x(dutyTotal));
  section301Total = round(x(section301Total));
  ieepaTotal = round(x(ieepaTotal));
  chinaReciprocalTotal = round(x(chinaReciprocalTotal));
  cnhkEoTotal = round(x(cnhkEoTotal));
  anyCountryTotal = round(x(anyCountryTotal));
  vatTotal = round(x(vatTotal));
  mpfTotal = round(x(mpfTotal));
  hmfTotal = round(x(hmfTotal));
  otherLeviesTotal = round(x(otherLeviesTotal));

  // Australia Import Processing Charge — a FLAT fee in AUD (the destination currency),
  // not ad valorem. AUD 50 for formal entries (≥ AUD 10,000), AUD 40 between AUD 1,000
  // and AUD 10,000, no charge for low-value (under AUD 1,000, SAC).
  let ipcTotal = 0;
  if (region === 'AU') {
    if (subtotal >= 10000) ipcTotal = rule.ipcFlat ?? 0;
    else if (subtotal >= 1000) ipcTotal = rule.ipcFlatLow ?? 0;
  }

  const totalLandedCost = round(
    subtotal + freightDest + insuranceDest + otherChargesDest + dutyTotal + chinaReciprocalTotal +
    cnhkEoTotal + anyCountryTotal + vatTotal + mpfTotal + hmfTotal + otherLeviesTotal + otherImportChargesDest + ipcTotal
  );
  const effectiveRate = subtotal > 0 ? totalLandedCost / subtotal - 1 : 0;

  // ---- FTA (Free Trade Agreement) preferential-tariff advisory ----
  // Resolves the in-force FTA covering origin→destination (USMCA, AUSFTA,
  // UK-EU TCA, EU FTA network, RCEP, CPTPP, etc.) and surfaces the preferential
  // rate vs the MFN rate so the importer can decide whether to claim it.
  // Eligibility still requires a valid proof of origin + meeting the rule.
  const originISO2 = (po.originCountry ?? '').toUpperCase();
  const destISO2 = dest.countryCode;
  const weightedMfn = avgDutyRate(lineBreakdown) ?? 0;
  const ftaResolution = resolveFta(originISO2, destISO2, weightedMfn);
  const ftaAdvisory: FtaAdvisory = {
    originISO2,
    destinationISO2: destISO2,
    applies: ftaResolution.preferential.applies,
    agreementName: ftaResolution.preferential.agreementName,
    agreementShortName: ftaResolution.preferential.agreementShortName,
    preferentialRate: ftaResolution.preferential.preferentialRate,
    preferentialType: ftaResolution.preferential.preferentialType,
    mfnRate: weightedMfn,
    savingVsMfn: Math.max(0, weightedMfn - ftaResolution.preferential.preferentialRate),
    ruleOfOriginSummary: ftaResolution.preferential.ruleOfOriginSummary,
    notes: ftaResolution.preferential.notes,
    alternatives: ftaResolution.alternatives.map((a) => ({
      agreementShortName: a.agreementShortName,
      preferentialRate: a.preferentialRate,
      preferentialType: a.preferentialType,
    })),
  };

  // ---- waterfall: the detailed step-by-step duty stack ----
  const waterfall: WaterfallStep[] = [];
  let cum = 0;
  const push = (label: string, amount: number, rate?: number, note?: string) => {
    cum = round(cum + amount);
    waterfall.push({ label, rate, amount: round(amount), cumulative: cum, note });
  };
  push('FOB subtotal (goods value)', subtotal, undefined, 'Sum of line item values, pre-freight');
  if (freightDest > 0) push('+ Freight', freightDest);
  if (insuranceDest > 0) push('+ Insurance', insuranceDest);
  if (otherChargesDest > 0) push('+ Other handling', otherChargesDest);
  if (freightDest || insuranceDest || otherChargesDest) {
    waterfall.push({ label: '= CIF value (customs value)', amount: cifTotal, cumulative: cifTotal, note: rule.dutyCalcBase === 'CIF' ? 'Duty base for UK/EU' : 'US assesses duty on FOB' });
    cum = cifTotal;
  }
  if (dutyTotal > 0) push(`+ Import duty (MFN)`, dutyTotal, avgDutyRate(lineBreakdown), 'AI-determined HS rate × calc base');
  // FTA advisory step — shows the preferential rate available under the in-force
  // FTA between this origin and destination, with the duty saving vs MFN.
  // Not added to the running total (claim requires proof of origin); surfaced for transparency.
  if (ftaAdvisory.applies) {
    const prefDuty = round(dutyTotal * ftaAdvisory.preferentialRate / Math.max(0.0001, weightedMfn || 1));
    const saving = round(dutyTotal - prefDuty);
    waterfall.push({
      label: `FTA ${ftaAdvisory.agreementShortName} preferential`,
      amount: prefDuty,
      rate: ftaAdvisory.preferentialRate,
      cumulative: cum,
      note: `${ftaAdvisory.agreementName} · preferential ${(ftaAdvisory.preferentialRate * 100).toFixed(1)}% vs MFN ${(weightedMfn * 100).toFixed(1)}% · saves ${sym(dest.currency)}${saving.toLocaleString()} (claim requires proof of origin)`,
    });
  }
  if (chinaReciprocalTotal > 0) push('+ 9903.88.x China 10% reciprocal (held per Nov 10 2025 deal)', chinaReciprocalTotal, avgRate(lineBreakdown, 'chinaReciprocalRate'), 'EO 14358 Nov 4 2025 + Nov 10 2025 US-China agreement held China reciprocal at 10% through Nov 10 2026 (was briefly 34% Apr-Nov 2025; supersedes legacy Section 301 25%)');
  if (cnhkEoTotal > 0) push('+ 9903.01.24 Fentanyl IEEPA 10% (reduced Nov 10 2025)', cnhkEoTotal, avgRate(lineBreakdown, 'cnhkEoRate'), 'CSMS 66749380 Nov 7 2025 + EO 14358 Nov 4 2025 — fentanyl IEEPA reduced 20% → 10% effective Nov 10 2025');
  if (anyCountryTotal > 0) push('+ 9903.01.25 any-country reciprocal 10% baseline', anyCountryTotal, avgRate(lineBreakdown, 'anyCountryRate'), 'EO 14257 Apr 2 2025 baseline reciprocal — 24% additional portion SUSPENDED through Nov 10 2026; only the 10% baseline remains in effect');
  if (vatTotal > 0) push(region === 'AU' ? '+ GST (Goods & Services Tax)' : '+ VAT', vatTotal, dest.vatRate, region !== 'US' ? `On (CIF + duty) — ${dest.countryName} ${region === 'AU' ? 'GST' : 'standard rate'}` : undefined);
  if (mpfTotal > 0) push('+ MPF (Merchandise Processing Fee)', mpfTotal, rule.mpfRate, 'US 0.3464%, floored/capped');
  if (hmfTotal > 0) push('+ HMF (Harbor Maintenance Fee)', hmfTotal, rule.hmfRate, 'US ocean 0.125% (not assessed for rail/air)');
  if (region === 'US' && !hmfApplies) waterfall.push({ label: '– HMF not assessed', amount: 0, cumulative: cum, note: `${mode} mode — HMF is ocean-only (19 U.S.C. §4462)` });
  if (region === 'AU' && ipcTotal > 0) push('+ Import Processing Charge (IPC)', ipcTotal, undefined, `ABF flat A$${ipcTotal} (≥ A$10,000 formal entry)`);
  if (otherLeviesTotal > 0) push('+ Other levies', otherLeviesTotal);
  if (customsBrokerFee) push('+ Customs broker fee', x(customsBrokerFee));
  if (documentationFee) push('+ Documentation fee', x(documentationFee));
  if (dutyAdvanceFee) push('+ Duty advance fee', x(dutyAdvanceFee));
  if (harborOrPortFee) push('+ Harbor / port fee', x(harborOrPortFee));
  if (inlandDelivery) push('+ Inland destination delivery', x(inlandDelivery));
  waterfall.push({ label: '= Total landed cost', amount: totalLandedCost, cumulative: totalLandedCost, note: `Effective rate ${(effectiveRate * 100).toFixed(2)}%` });

  const calculation: RegionCalculation = {
    region, label: dest.label, flag: dest.flag, currency: dest.currency,
    subtotal, dutyTotal, section301Total, ieepaTotal,
    chinaReciprocalTotal, cnhkEoTotal, anyCountryTotal,
    vatTotal, mpfTotal, hmfTotal, hmfApplies, modeOfTransport: inputs.modeOfTransport ?? 'Ocean',
    otherLevies: otherLeviesTotal, freight: freightDest, insurance: insuranceDest,
    otherImportCharges: otherImportChargesDest,
    totalLandedCost, effectiveRate, fta: ftaAdvisory,
    lineBreakdown, waterfall, notes: rule.notes,
  };

  // persist (single region; the 2025 Chapter-99 provisions folded into otherLevies for the DB row)
  await db.landedCostCalculation.create({
    data: {
      poId, region,
      subtotal, dutyTotal, vatTotal, mpfTotal, hmfTotal,
      otherLevies: otherLeviesTotal + chinaReciprocalTotal + cnhkEoTotal + anyCountryTotal,
      freight: freightDest, insurance: insuranceDest,
      totalLandedCost, breakdownJson: JSON.stringify(lineBreakdown),
      // destination / FX / effective-rate snapshot fields (Task 16-b)
      destinationCountry: dest.countryCode,
      destinationCurrency: dest.currency,
      originCurrency: poCurrency,
      effectiveRate,
      fxSnapshotJson: fx ? JSON.stringify({
        from: poCurrency,
        to: dest.currency,
        rate: fx.rate,
        source: fx.source,
        date: fx.date,
        fetchedAt: fx.fetchedAt,
      }) : null,
      // FTA snapshot — populated by Task 18 wiring
      ftaName: ftaAdvisory.applies ? ftaAdvisory.agreementShortName : null,
      ftaPreferentialRate: ftaAdvisory.applies ? ftaAdvisory.preferentialRate : null,
      mfnRate: weightedMfn,
      poNumber: po.poNumber,
      destinationLabel: dest.label,
      originCountry: po.originCountry ?? null,
    },
  });

  return {
    poId,
    poNumber: po.poNumber,
    originCurrency: poCurrency,
    destination: {
      countryCode: dest.countryCode, countryName: dest.countryName,
      region: dest.region, currency: dest.currency, vatRate: dest.vatRate,
      flag: dest.flag, label: dest.label,
    },
    fx: fx.source === 'identity' && poCurrency === dest.currency ? null : {
      fromCurrency: poCurrency,
      toCurrency: dest.currency,
      rate: fx.rate, source: fx.source, date: fx.date, fetchedAt: fx.fetchedAt,
    },
    calculation,
    calculatedAt: new Date().toISOString(),
  };
}

function num(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
function round(n: number): number {
  return Math.round(n * 100) / 100;
}
/** Currency symbol for the destination currency (used in waterfall notes). */
function sym(currency: string): string {
  const map: Record<string, string> = {
    USD: '$', GBP: '£', EUR: '€', AUD: 'A$', CAD: 'C$', JPY: '¥', CNY: '¥',
    INR: '₹', PKR: '₨', BRL: 'R$', MXN: 'MX$', NZD: 'NZ$', SEK: 'kr',
    PLN: 'zł', DKK: 'kr', NOK: 'kr', CZK: 'Kč', HUF: 'Ft', RON: 'lei',
    BGN: 'лв', HRK: 'kn', TRY: '₺', AED: 'AED', SAR: 'SAR',
  };
  return map[currency.toUpperCase()] ?? currency + ' ';
}
function avgDutyRate(lines: LineBreakdown[]): number | undefined {
  const fob = lines.reduce((s, l) => s + l.fobValue, 0);
  if (fob <= 0) return undefined;
  return lines.reduce((s, l) => s + l.dutyRate * l.fobValue, 0) / fob;
}
function avgRate(lines: LineBreakdown[], key: 'section301Rate' | 'ieepaRate' | 'chinaReciprocalRate' | 'cnhkEoRate' | 'anyCountryRate'): number | undefined {
  const fob = lines.reduce((s, l) => s + l.fobValue, 0);
  if (fob <= 0) return undefined;
  return lines.reduce((s, l) => s + l[key] * l.fobValue, 0) / fob;
}
