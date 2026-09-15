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
import type { Region, RegionCalculation, LineBreakdown, CalculateResponse, LandedCostInputs, WaterfallStep } from './types';

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
  let dutyTotal = 0, section301Total = 0, ieepaTotal = 0, vatTotal = 0,
    hmfTotal = 0, otherLeviesTotal = 0;

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

    // parse Section 301 / IEEPA / other from the determination's additionalLevies JSON
    let section301Rate = 0, ieepaRate = 0, lineOtherLevies = 0;
    if (det?.additionalLevies) {
      try {
        const obj = JSON.parse(det.additionalLevies) as Record<string, number>;
        if (region === 'US') {
          section301Rate = typeof obj.Section301 === 'number' ? obj.Section301 : 0;
          ieepaRate = typeof obj.IEEPA === 'number' ? obj.IEEPA : 0;
        }
        for (const [k, v] of Object.entries(obj)) {
          if (k === 'MPF' || k === 'HMF' || k === 'Section301' || k === 'IEEPA') continue;
          if (typeof v === 'number') lineOtherLevies += cifValue * v;
        }
      } catch { /* ignore */ }
    }

    const dutyBase = rule.dutyCalcBase === 'CIF' ? cifValue : fobValue;
    const duty = dutyBase * dutyRate;
    const section301 = region === 'US' ? fobValue * section301Rate : 0;
    const ieepa = region === 'US' ? fobValue * ieepaRate : 0;
    let hmf = 0;
    if (region === 'US' && rule.hmfRate) hmf = fobValue * rule.hmfRate;
    let vat = 0;
    if (region !== 'US') {
      const vatBase = rule.vatCalcBase === 'CIF_plus_duty' ? cifValue + duty : cifValue;
      vat = vatBase * vatRate;
    }

    dutyTotal += duty;
    section301Total += section301;
    ieepaTotal += ieepa;
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
      confidence: det?.confidence ?? 0,
      reasoning: det?.reasoning ?? undefined,
      fobValue: round(x(fobValue)),
      cifValue: round(x(cifValue)),
      duty: round(x(duty)),
      section301: round(x(section301)),
      ieepa: round(x(ieepa)),
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
  vatTotal = round(x(vatTotal));
  mpfTotal = round(x(mpfTotal));
  hmfTotal = round(x(hmfTotal));
  otherLeviesTotal = round(x(otherLeviesTotal));

  const totalLandedCost = round(
    subtotal + freightDest + insuranceDest + otherChargesDest + dutyTotal + section301Total +
    ieepaTotal + vatTotal + mpfTotal + hmfTotal + otherLeviesTotal + otherImportChargesDest
  );
  const effectiveRate = subtotal > 0 ? totalLandedCost / subtotal - 1 : 0;

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
  if (section301Total > 0) push('+ Section 301 surcharge', section301Total, avgRate(lineBreakdown, 'section301Rate'), 'CN-origin trade remedy');
  if (ieepaTotal > 0) push('+ IEEPA reciprocal tariff', ieepaTotal, avgRate(lineBreakdown, 'ieepaRate'), '2025 IEEPA reciprocal duty');
  if (vatTotal > 0) push('+ VAT', vatTotal, dest.vatRate, region !== 'US' ? `On (CIF + duty) — ${dest.countryName} standard rate` : undefined);
  if (mpfTotal > 0) push('+ MPF (Merchandise Processing Fee)', mpfTotal, rule.mpfRate, 'US 0.3464%, floored/capped');
  if (hmfTotal > 0) push('+ HMF (Harbor Maintenance Fee)', hmfTotal, rule.hmfRate, 'US ocean 0.125%');
  if (otherLeviesTotal > 0) push('+ Other levies', otherLeviesTotal);
  if (customsBrokerFee) push('+ Customs broker fee', x(customsBrokerFee));
  if (documentationFee) push('+ Documentation fee', x(documentationFee));
  if (dutyAdvanceFee) push('+ Duty advance fee', x(dutyAdvanceFee));
  if (harborOrPortFee) push('+ Harbor / port fee', x(harborOrPortFee));
  if (inlandDelivery) push('+ Inland destination delivery', x(inlandDelivery));
  waterfall.push({ label: '= Total landed cost', amount: totalLandedCost, cumulative: totalLandedCost, note: `Effective rate ${(effectiveRate * 100).toFixed(2)}%` });

  const calculation: RegionCalculation = {
    region, label: dest.label, flag: dest.flag, currency: dest.currency,
    subtotal, dutyTotal, section301Total, ieepaTotal, vatTotal, mpfTotal, hmfTotal,
    otherLevies: otherLeviesTotal, freight: freightDest, insurance: insuranceDest,
    otherImportCharges: otherImportChargesDest,
    totalLandedCost, effectiveRate, lineBreakdown, waterfall, notes: rule.notes,
  };

  // persist (single region now; Section 301 + IEEPA folded into otherLevies for the DB row)
  await db.landedCostCalculation.create({
    data: {
      poId, region,
      subtotal, dutyTotal, vatTotal, mpfTotal, hmfTotal,
      otherLevies: otherLeviesTotal + section301Total + ieepaTotal,
      freight: freightDest, insurance: insuranceDest,
      totalLandedCost, breakdownJson: JSON.stringify(lineBreakdown),
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
      fromCurrency: fx.fromCurrency ?? poCurrency,
      toCurrency: fx.toCurrency ?? dest.currency,
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
function avgDutyRate(lines: LineBreakdown[]): number | undefined {
  const fob = lines.reduce((s, l) => s + l.fobValue, 0);
  if (fob <= 0) return undefined;
  return lines.reduce((s, l) => s + l.dutyRate * l.fobValue, 0) / fob;
}
function avgRate(lines: LineBreakdown[], key: 'section301Rate' | 'ieepaRate'): number | undefined {
  const fob = lines.reduce((s, l) => s + l.fobValue, 0);
  if (fob <= 0) return undefined;
  return lines.reduce((s, l) => s + l[key] * l.fobValue, 0) / fob;
}
