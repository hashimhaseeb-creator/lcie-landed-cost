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
import { getRateSnapshot } from './regulatory-intelligence';
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

  // ---- Local-PO short-circuit: if origin country == destination country, no
  // customs border is crossed → no duty/VAT/MPF/HMF applies. Return a "Not
  // required" response immediately so the UI can prompt the user, instead of
  // computing a meaningless duty stack. ----
  const poOriginCC = (po.originCountry ?? '').toUpperCase().trim();
  const poDestCC = (po.destinationCountry ?? '').toUpperCase().trim();
  if (poOriginCC && poDestCC && poOriginCC === poDestCC) {
    return {
      poId,
      poNumber: po.poNumber,
      originCurrency: po.currency ?? 'USD',
      destination: {
        countryCode: poDestCC, countryName: poDestCC, region: 'US' as Region,
        currency: po.currency ?? 'USD', vatRate: 0, flag: '🏠', label: `${poDestCC} (local shipment)`,
      },
      fx: null,
      calculation: {
        region: 'US' as Region, label: `${poDestCC} (local shipment)`, flag: '🏠',
        currency: po.currency ?? 'USD', subtotal: 0, dutyTotal: 0, section301Total: 0,
        ieepaTotal: 0, chinaReciprocalTotal: 0, cnhkEoTotal: 0, anyCountryTotal: 0,
        vatTotal: 0, mpfTotal: 0, hmfTotal: 0, hmfApplies: false, modeOfTransport: inputs.modeOfTransport ?? 'Ocean',
        otherLevies: 0, freight: 0, insurance: 0, otherImportCharges: 0,
        totalLandedCost: 0, effectiveRate: 0,
        lineBreakdown: [],
        waterfall: [{
          label: '🏠 Not required — local shipment (no customs border crossed)',
          amount: 0, cumulative: 0,
          note: `Origin country (${poOriginCC}) == Destination country (${poDestCC}). No import/export duty, VAT, GST, MPF, or HMF applies. Only domestic sales tax (out of scope for LCIE) may apply.`,
        }],
        notes: 'Local shipment — origin and destination are the same country. No customs duty / VAT / MPF / HMF applies. If you expected an international shipment, check the PO\'s origin and destination country fields.',
      },
      calculatedAt: new Date().toISOString(),
    };
  }

  // ---- Missing destination short-circuit: if the PO didn't specify a
  // destination country (and the user didn't override via the UI dropdown),
  // return an explicit error so the UI can prompt the user to pick one. ----
  if (!poDestCC) {
    throw new Error('Destination country not specified — the parser could not infer it from the PO text. Please select a destination country from the dropdown above before running the LCIE agent.');
  }
  if (!poOriginCC) {
    throw new Error('Origin country not specified — the parser could not infer it from the PO text. Please select an origin country from the dropdown above before running the LCIE agent.');
  }

  // ---- resolve destination region + currency + VAT ----
  const dest = resolveDestination(poDestCC);
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

  // ─── MPF (US only) — entry-level ad valorem, clamped to FY2026 inflation-adjusted
  // floor ($34.58) and ceiling cap ($670.86), then allocated proportionally across
  // line items by FOB share. Uses safeSubtotalSrc with a fallback structural base
  // of 1 to prevent NaN / zero-division runtime crashes on sample / promotional
  // invoices where the global subtotal evaluates to 0. EXCLUSIVELY inside the
  // U.S. region condition (UK / EU / AU have no MPF equivalent). ───
  let mpfTotal = 0;
  if (region === 'US' && rule.mpfRate) {
    const raw = subtotalSrc * rule.mpfRate;
    // Clamp to [mpfMin, mpfMax] = [$34.58, $670.86] (FY2026 CBP fee schedule, effective Oct 1 2025)
    mpfTotal = Math.max(rule.mpfMin ?? 0, Math.min(rule.mpfMax ?? Infinity, raw));
    const mpfDest = x(mpfTotal);
    // Safe base for proportional allocation — falls back to structural 1 when
    // subtotalSrc is 0 (sample / promotional POs) to prevent NaN / zero-division.
    const safeSubtotalSrc = subtotalSrc > 0 ? subtotalSrc : 1;
    // Sum of FOB values across all line items (already FX-converted) — used as
    // the proportional-allocation denominator; falls back to safeSubtotalSrc when 0.
    const fobSum = lineBreakdown.reduce((s, l) => s + l.fobValue, 0);
    const safeFobSum = fobSum > 0 ? fobSum : safeSubtotalSrc;
    for (const lb of lineBreakdown) {
      const share = lb.fobValue / safeFobSum;
      lb.mpf = round(mpfDest * share);
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
  // The flat AUD 50 IPC is ASSESSED EXCLUSIVELY on consignments valued at AUD 10,000 or
  // greater — per the user's directive. AU GST (10%) is computed on the combined sum of
  // (Customs Value + Duty Total + International Freight + Insurance) — see the AU branch
  // of the per-line VAT loop above where vatBase = cifValue + duty = (FOB + freight +
  // insurance + other) + duty. ✓ already correctly implemented.
  let ipcTotal = 0;
  if (region === 'AU') {
    if (subtotal >= 10000) ipcTotal = rule.ipcFlat ?? 0;
    else if (subtotal >= 1000) ipcTotal = rule.ipcFlatLow ?? 0;
  }

  // ─── EU e-commerce parcel regime (Reg (EU) 2017/2455, in force 1 Jul 2021) ───
  // The historical €150 de minimis customs duty exemption has been PERMANENTLY REMOVED.
  // For all incoming B2C / parcel line items where the intrinsic value evaluates to €150
  // or less, apply:
  //   • a flat €3 customs duty fee per unique HS6 line item
  //   • a mandatory €2 handling fee per customs declaration line item
  // VAT must be calculated on top of (product value + this new duty baseline + handling).
  // The flat fees are in EUR — converted to destination currency via the same FX rate
  // applied to the rest of the shipment. Only fires for region === 'EU' AND when the
  // PO-level subtotal in EUR terms is ≤ the threshold (€150).
  let euParcelDutyTotal = 0;
  let euParcelHandlingTotal = 0;
  if (region === 'EU' && rule.euParcelFlatDutyPerHs6 && rule.euParcelHandlingFeePerLine && rule.euParcelThreshold) {
    // Compute the intrinsic value of the consignment in EUR — if it's ≤ €150 the flat
    // parcel regime applies to ALL line items (the threshold is consignment-level, not
    // per-line). Convert subtotal (already in destination currency) back to EUR using
    // the inverse FX rate. EUR is the destination currency for EU shipments, so subtotal
    // is already in EUR — no conversion needed.
    const intrinsicValueEUR = dest.currency === 'EUR'
      ? subtotal
      : subtotal / Math.max(0.0001, fx.rate);  // defensive — EU destination currency is always EUR
    if (intrinsicValueEUR <= rule.euParcelThreshold) {
      // Flat €3 customs duty per UNIQUE HS6 line item — collect the set of unique
      // first-6-digit HS codes across the breakdown, charge €3 each.
      const uniqueHs6 = new Set<string>();
      for (const lb of lineBreakdown) {
        const hs = (lb.hsCode ?? '').replace(/[^0-9]/g, '').slice(0, 6);
        if (hs.length >= 6) uniqueHs6.add(hs);
      }
      const flatDutyPerLinePerEUR = rule.euParcelFlatDutyPerHs6;  // €3
      const handlingPerLinePerEUR = rule.euParcelHandlingFeePerLine; // €2
      // Convert EUR fees to destination currency (if EU destination is non-EUR — e.g. PLN, SEK)
      const feeFx = dest.currency === 'EUR' ? 1 : fx.rate;
      euParcelDutyTotal = round(uniqueHs6.size * flatDutyPerLinePerEUR * feeFx);
      euParcelHandlingTotal = round(lineBreakdown.length * handlingPerLinePerEUR * feeFx);
      // Re-baseline the VAT: VAT must be calculated on (product value + new duty + handling).
      // The per-line VAT already computed (cifValue + duty) * vatRate — add the parcel fees
      // proportionally so VAT captures them. This adds an extra VAT top-up.
      const parcelFeesTotal = euParcelDutyTotal + euParcelHandlingTotal;
      vatTotal = round(vatTotal + parcelFeesTotal * dest.vatRate);
    }
  }

  // ─── Carbon penalty avoidance savings (UK ETS + EU ETS frameworks) ───
  // Distinct, un-blended metric — NOT added to totalLandedCost or effectiveRate.
  // Computes the carbon-cost savings from choosing the current modeOfTransport
  // vs the higher-emission air-freight baseline, valued at the destination
  // region's ETS carbon price (UK ETS £83/tCO2e; EU ETS €100/tCO2e as of 2026).
  //   • Air-freight emissions factor: 500g CO2e per tonne-km (highest)
  //   • Ocean-freight emissions factor: 16g CO2e per tonne-km (lowest)
  //   • Rail-freight emissions factor: 22g CO2e per tonne-km
  //   • Truck-freight emissions factor: 50g CO2e per tonne-km
  // The savings = (airFactor - modeFactor) * estimatedTonneKm * carbonPricePerTonne / 1000.
  // We use the freight cost as a proxy for tonne-km (since the PO doesn't carry weight
  // or distance explicitly) at a rough USD$1 = 1 tonne-km conversion factor — so the
  // savings are an order-of-magnitude estimate suitable for advisory display.
  let carbonSavings = 0;
  if (rule.etsCarbonPricePerTonne && (region === 'UK' || region === 'EU')) {
    const AIR_EMISSIONS_FACTOR = 0.5;    // kg CO2e per tonne-km
    const OCEAN_EMISSIONS_FACTOR = 0.016;
    const RAIL_EMISSIONS_FACTOR = 0.022;
    const TRUCK_EMISSIONS_FACTOR = 0.05;
    const mode = (inputs.modeOfTransport ?? 'Ocean').toLowerCase();
    const modeFactor = mode.includes('ocean') ? OCEAN_EMISSIONS_FACTOR
      : mode.includes('rail') ? RAIL_EMISSIONS_FACTOR
      : mode.includes('truck') ? TRUCK_EMISSIONS_FACTOR
      : mode.includes('air') ? AIR_EMISSIONS_FACTOR
      : OCEAN_EMISSIONS_FACTOR;  // default to ocean (most common)
    // No savings if the user picked Air (it IS the baseline) or if the savings factor is 0/negative.
    const emissionsDelta = AIR_EMISSIONS_FACTOR - modeFactor;
    if (emissionsDelta > 0 && freight > 0) {
      // Convert freight from PO currency to destination currency for ETS comparison
      const freightDestForCarbon = x(freight);
      // Rough proxy: USD$1 of freight ≈ 1 tonne-km (industry rule-of-thumb for ocean LCL)
      const estimatedTonneKm = freightDestForCarbon;
      const carbonPricePerTonne = rule.etsCarbonPricePerTonne;
      // Savings = (emissionsDelta in kg/tonne-km) * tonneKm * carbonPrice / 1000 (to convert kg → tonnes)
      carbonSavings = round(estimatedTonneKm * emissionsDelta * carbonPricePerTonne / 1000);
    }
  }

  const totalLandedCost = round(
    subtotal + freightDest + insuranceDest + otherChargesDest + dutyTotal + chinaReciprocalTotal +
    cnhkEoTotal + anyCountryTotal + vatTotal + mpfTotal + hmfTotal + otherLeviesTotal + otherImportChargesDest + ipcTotal +
    (euParcelDutyTotal + euParcelHandlingTotal)  // EU parcel regime fees (already added to VAT base above)
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
  // Snapshot-driven waterfall labels — the rate + effectiveDate + citation come from
  // the regulatory-intelligence module so they auto-update when the user clicks
  // "Verify current rates" on the UI (or after the 24-hour TTL cache expires).
  const snap = getRateSnapshot();
  const snapRec = (k: string) => snap.rates.find((r) => r.key === k);
  if (chinaReciprocalTotal > 0) {
    const e = snapRec('us-9903.88.x');
    push('+ 9903.88.x China reciprocal', chinaReciprocalTotal, avgRate(lineBreakdown, 'chinaReciprocalRate'),
      `${e?.citation ?? 'EO 14257 Chapter-99'} — effective ${e?.effectiveDate ?? 'N/A'} · rate-snapshot verified ${e?.lastVerifiedAt?.slice(0, 10) ?? 'N/A'}`);
  }
  if (cnhkEoTotal > 0) {
    const e = snapRec('us-9903.01.24');
    push('+ 9903.01.24 Fentanyl IEEPA', cnhkEoTotal, avgRate(lineBreakdown, 'cnhkEoRate'),
      `${e?.citation ?? 'IEEPA fentanyl tariff'} — effective ${e?.effectiveDate ?? 'N/A'} · rate-snapshot verified ${e?.lastVerifiedAt?.slice(0, 10) ?? 'N/A'}`);
  }
  if (anyCountryTotal > 0) {
    const e = snapRec('us-9903.01.25');
    push('+ 9903.01.25 any-country baseline reciprocal', anyCountryTotal, avgRate(lineBreakdown, 'anyCountryRate'),
      `${e?.citation ?? 'EO 14257 baseline reciprocal'} — effective ${e?.effectiveDate ?? 'N/A'} · rate-snapshot verified ${e?.lastVerifiedAt?.slice(0, 10) ?? 'N/A'}`);
  }
  if (vatTotal > 0) push(region === 'AU' ? '+ GST (Goods & Services Tax)' : '+ VAT', vatTotal, dest.vatRate, region !== 'US' ? `On (CIF + duty) — ${dest.countryName} ${region === 'AU' ? 'GST' : 'standard rate'}` : undefined);
  if (mpfTotal > 0) push('+ MPF (Merchandise Processing Fee)', mpfTotal, rule.mpfRate, 'US 0.3464%, floored/capped');
  if (hmfTotal > 0) push('+ HMF (Harbor Maintenance Fee)', hmfTotal, rule.hmfRate, 'US ocean 0.125% (not assessed for rail/air)');
  if (region === 'US' && !hmfApplies) waterfall.push({ label: '– HMF not assessed', amount: 0, cumulative: cum, note: `${mode} mode — HMF is ocean-only (19 U.S.C. §4462)` });
  if (region === 'AU' && ipcTotal > 0) push('+ Import Processing Charge (IPC)', ipcTotal, undefined, `ABF flat A$${ipcTotal} (≥ A$10,000 formal entry — exclusive threshold per FY2026 schedule)`);
  // EU e-commerce parcel regime waterfall steps (only when ≤ €150 de-minimis regime fires)
  if (region === 'EU' && euParcelDutyTotal > 0) push('+ EU parcel flat customs duty (€3 per unique HS6)', euParcelDutyTotal, undefined, `Reg (EU) 2017/2455 — €150 de minimis REMOVED 1 Jul 2021; flat €3 per unique HS6 line item for parcels ≤ €150`);
  if (region === 'EU' && euParcelHandlingTotal > 0) push('+ EU parcel handling fee (€2 per declaration line)', euParcelHandlingTotal, undefined, `Reg (EU) 2017/2455 — flat €2 per customs declaration line; VAT applied on top of (product value + duty + handling)`);
  // Carbon penalty avoidance savings — distinct, un-blended metric, NOT in the running cumulative
  // (it's a SAVINGS, not a cost; would subtract from the landed cost, but per the directive it's
  // surfaced separately as a payload attribute + DB row rather than blended into totalLandedCost).
  if (carbonSavings > 0) {
    waterfall.push({
      label: `🌍 Carbon penalty avoidance savings (${region} ETS)`,
      amount: -carbonSavings,
      cumulative: cum,
      note: `${region === 'UK' ? 'UK ETS' : 'EU ETS'} carbon-price valuation of (air - ${inputs.modeOfTransport ?? 'Ocean'}) emissions delta on freight. Distinct, un-blended metric — NOT added to total landed cost; surfaced as a separate payload attribute.`,
    });
  }
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
    euParcelDutyTotal: region === 'EU' ? euParcelDutyTotal : undefined,
    euParcelHandlingTotal: region === 'EU' ? euParcelHandlingTotal : undefined,
    carbonSavings: carbonSavings > 0 ? carbonSavings : undefined,
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
      carbonSavings: carbonSavings > 0 ? carbonSavings : null,
      euParcelDutyTotal: region === 'EU' && euParcelDutyTotal > 0 ? euParcelDutyTotal : null,
      euParcelHandlingTotal: region === 'EU' && euParcelHandlingTotal > 0 ? euParcelHandlingTotal : null,
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
