/**
 * LCIE Landed Cost Calculator
 * Green G(P)4 Supply Chain Framework
 *
 * Computes per-region landed cost (US / UK / EU) given a stored PO,
 * its line items, and the AI agent's HS determinations.
 *
 * Calculus rules:
 *   US  — duty on FOB; MPF = clamp(FOB·0.3464%, $31.67, $614.35); HMF = FOB·0.125% (ocean); no federal VAT
 *   UK  — duty on CIF; VAT = (CIF + duty) · 20%; no MPF/HMF
 *   EU  — duty on CIF; VAT = (CIF + duty) · VAT_rate (DE 19% default); no MPF/HMF
 *
 * CIF is line-level: fobValue + allocated freight + allocated insurance + other charges.
 * Freight / insurance are allocated proportionally to FOB value across line items.
 */

import { db } from '@/lib/db';
import { DUTY_RULES } from '@/lib/hs-knowledge-base';
import type { Region, RegionCalculation, LineBreakdown, CalculateResponse } from './types';

export async function calculateLandedCost(poId: string): Promise<CalculateResponse> {
  const po = await db.purchaseOrder.findUnique({
    where: { id: poId },
    include: {
      lineItems: { orderBy: { lineNumber: 'asc' } },
    },
  });
  if (!po) throw new Error('Purchase order not found.');

  const determinations = await db.hsDetermination.findMany({
    where: { lineItem: { poId } },
  });

  const subtotal = po.lineItems.reduce((s, li) => s + li.quantity * li.unitValue, 0);
  const { freight, insurance, otherCharges } = po;

  const calculations: RegionCalculation[] = [];

  for (const region of ['US', 'UK', 'EU'] as Region[]) {
    const rule = DUTY_RULES[region];
    const detByLine = new Map<string, (typeof determinations[number] | undefined)>();
    for (const li of po.lineItems) {
      const d = determinations.find((x) => x.lineItemId === li.id && x.region === region);
      detByLine.set(li.id, d);
    }

    // Allocate freight / insurance / other proportionally to FOB
    const lineBreakdown: LineBreakdown[] = [];
    let dutyTotal = 0;
    let vatTotal = 0;
    let hmfTotal = 0;
    let otherLeviesTotal = 0;

    for (const li of po.lineItems) {
      const fobValue = li.quantity * li.unitValue;
      const share = subtotal > 0 ? fobValue / subtotal : 0;
      const lineFreight = freight * share;
      const lineInsurance = insurance * share;
      const lineOther = otherCharges * share;
      const cifValue = fobValue + lineFreight + lineInsurance + lineOther;

      const det = detByLine.get(li.id);
      const dutyRate = det?.dutyRate ?? 0;
      const vatRate = region === 'US' ? 0 : det?.vatRate ?? rule.vatRate ?? 0;

      const dutyBase = rule.dutyCalcBase === 'CIF' ? cifValue : fobValue;
      const duty = dutyBase * dutyRate;

      // HMF (US ocean) — per line, on FOB
      let hmf = 0;
      if (region === 'US' && rule.hmfRate) {
        hmf = fobValue * rule.hmfRate;
      }

      // VAT (UK/EU) on (CIF + duty)
      let vat = 0;
      if (region !== 'US') {
        const vatBase = rule.vatCalcBase === 'CIF_plus_duty' ? cifValue + duty : cifValue;
        vat = vatBase * vatRate;
      }

      // Other levies from determination JSON (e.g. excise) — US MPF handled at PO level
      let lineOtherLevies = 0;
      if (det?.additionalLevies) {
        try {
          const obj = JSON.parse(det.additionalLevies) as Record<string, number>;
          for (const [k, v] of Object.entries(obj)) {
            if (k === 'MPF' || k === 'HMF') continue; // handled separately
            if (typeof v === 'number') lineOtherLevies += cifValue * v;
          }
        } catch {
          /* ignore */
        }
      }

      dutyTotal += duty;
      vatTotal += vat;
      hmfTotal += hmf;
      otherLeviesTotal += lineOtherLevies;

      lineBreakdown.push({
        lineItemId: li.id,
        lineNumber: li.lineNumber,
        description: li.description,
        hsCode: det?.hsCode ?? '—',
        fobValue,
        duty,
        vat,
        mpf: 0, // allocated after PO-level MPF computed
        hmf,
        otherLevies: lineOtherLevies,
        lineLandedCost: 0, // finalized after MPF allocation
      });
    }

    // MPF (US only) — computed at PO/entry level then allocated proportionally to FOB
    let mpfTotal = 0;
    if (region === 'US' && rule.mpfRate) {
      const raw = subtotal * rule.mpfRate;
      mpfTotal = Math.max(rule.mpfMin ?? 0, Math.min(rule.mpfMax ?? Infinity, raw));
      // allocate
      for (const lb of lineBreakdown) {
        const share = subtotal > 0 ? lb.fobValue / subtotal : 0;
        lb.mpf = mpfTotal * share;
      }
    }

    // finalize line landed cost
    for (const lb of lineBreakdown) {
      lb.lineLandedCost = lb.fobValue + lb.duty + lb.vat + lb.mpf + lb.hmf + lb.otherLevies + freight * (subtotal > 0 ? lb.fobValue / subtotal : 0) + insurance * (subtotal > 0 ? lb.fobValue / subtotal : 0);
    }

    const totalLandedCost = subtotal + dutyTotal + vatTotal + mpfTotal + hmfTotal + otherLeviesTotal + freight + insurance;
    const effectiveRate = subtotal > 0 ? totalLandedCost / subtotal - 1 : 0;

    calculations.push({
      region,
      label: rule.label,
      flag: rule.flag,
      currency: po.currency,
      subtotal,
      dutyTotal,
      vatTotal,
      mpfTotal,
      hmfTotal,
      otherLevies: otherLeviesTotal,
      freight,
      insurance,
      totalLandedCost,
      effectiveRate,
      lineBreakdown,
      notes: rule.notes,
    });

    // persist the calculation
    await db.landedCostCalculation.create({
      data: {
        poId,
        region,
        subtotal,
        dutyTotal,
        vatTotal,
        mpfTotal,
        hmfTotal,
        otherLevies: otherLeviesTotal,
        freight,
        insurance,
        totalLandedCost,
        breakdownJson: JSON.stringify(lineBreakdown),
      },
    });
  }

  return {
    poId,
    poNumber: po.poNumber,
    originCurrency: po.currency,
    calculations,
    calculatedAt: new Date().toISOString(),
  };
}
