/**
 * Free Trade Agreement (FTA) preferential-tariff resolver —
 * pure static data module.
 *
 * Determines which in-force FTA(s) apply between the origin country and the
 * destination country of a Purchase Order, picks the BEST preferential rate
 * (lowest duty; ties → 'free' > 'ad_valorem' > 'reduced'), and exposes the
 * matching rule-of-origin summary + agreement citation so the UI can render
 * a "Detailed Rulings & Updated Import Laws" reference and an FTA advisory.
 *
 * Data is current as of 2025-08-15 covering the major FTAs that affect
 * US / UK / EU / AU importers. "In-force" status per:
 *  • WTO RTA-IS database                 https://rtais.wto.org
 *  • USTR                                https://ustr.gov/trade-agreements
 *  • European Commission DG-TRADE        https://policy.trade.ec.europa.eu
 *  • Australian DFAT                     https://www.dfat.gov.au/international-relations/regional-architecture/trade-agreements
 *  • UK Govt "Trade agreements"           https://www.gov.uk/government/collections/uk-trade-agreements
 *
 * NOTE: the module does NOT replace the destination-region calculator — it
 * only surfaces preferential rate / agreement data for advisory purposes.
 * Eligibility to preferential treatment still requires the importer to
 * possess a valid proof of origin (self-declaration, certificate, etc.)
 * and meet the rule of origin — see `ruleOfOriginSummary`.
 *
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

export interface FtaProvision {
  applies: boolean;
  agreementName: string;           // long-form name, e.g. "United States–Mexico–Canada Agreement"
  agreementShortName: string;      // "USMCA" | "AUSFTA" | "UK-EU TCA" | ...
  partnerCountries: string[];      // ISO-2 codes of all parties to the agreement
  preferentialRate: number;        // decimal (0 = duty-free)
  preferentialType: 'free' | 'ad_valorem' | 'reduced';
  ruleOfOriginSummary: string;     // one concise sentence describing the rule
  notes: string;                   // citation of the agreement text + entry-into-force status
}

export interface FtaResolution {
  originISO2: string;
  destinationISO2: string;
  mfnRate: number;                 // MFN/General rate (decimal) — populated by caller; default 0
  preferential: FtaProvision;      // the best FTA (if any) that applies between origin→destination
  alternatives: FtaProvision[];    // other FTAs that also apply (UI can show alternatives)
}

/** EU-27 ISO-2 codes (post-Brexit — excludes UK/GB). */
const EU_27: string[] = [
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR',
  'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK',
  'SI', 'ES', 'SE',
];

/** ASEAN-10 ISO-2 codes. */
const ASEAN_10: string[] = [
  'BN', 'KH', 'ID', 'LA', 'MY', 'MM', 'PH', 'SG', 'TH', 'VN',
];

/** CPTPP parties (post-UK accession 2024-12-15). */
const CPTPP: string[] = [
  'AU', 'BN', 'CA', 'CL', 'JP', 'MY', 'MX', 'NZ', 'PE', 'SG', 'VN', 'GB',
];

/** RCEP parties (ASEAN-10 + CN, JP, KR, AU, NZ). */
const RCEP: string[] = [...ASEAN_10, 'CN', 'JP', 'KR', 'AU', 'NZ'];

/**
 * FTA agreement register — current 2025 in-force status.
 * Order is presentation order only — `resolveFta` sorts by best rate.
 */
export const FTA_AGREEMENTS: FtaProvision[] = [
  // ─────────────────────── Americas ───────────────────────
  {
    applies: true,
    agreementName: 'United States–Mexico–Canada Agreement',
    agreementShortName: 'USMCA',
    partnerCountries: ['US', 'MX', 'CA'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Tariff-shift Rule A (any change in classification to the heading of a good under HS Chapters 1–97); RVC alternate (≥60% transaction-value method or ≥50% net-cost method for most goods).',
    notes:
      'USMCA Annex 4-B (Product-Specific Rules of Origin); Article 4.6 (Regional Value Content). In force 2020-07-01; most tariff lines duty-free on originating goods.',
  },
  {
    applies: true,
    agreementName: 'United States–Korea Free Trade Agreement',
    agreementShortName: 'KORUS FTA',
    partnerCountries: ['US', 'KR'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Tariff shift (CTC) + RVC alternate (≥35% build-up method or ≥45% FOB build-down) per Annex 6-A.',
    notes:
      'KORUS FTA Annex 6-A (PSR); in force 2012-03-15 (amended 2018). 99% of tariff lines at 0% on entry into force; full phase-out completed.',
  },
  {
    applies: true,
    agreementName: 'Dominican Republic–Central America–United States Free Trade Agreement',
    agreementShortName: 'DR-CAFTA',
    partnerCountries: ['US', 'CR', 'DO', 'GT', 'HN', 'NI'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Tariff shift (CTC) + RVC alternate (≥35% transaction-value, FOB) per Annex 4.1.',
    notes:
      'DR-CAFTA Annex 4.1 (PSR); in force 2006–2009 (staged). 100% of tariff lines at 0% since 2015.',
  },
  {
    applies: false,
    agreementName: 'United States–United Kingdom Free Trade Agreement',
    agreementShortName: 'UKFTA',
    partnerCountries: ['US', 'GB'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Tariff shift + RVC alternate — text finalised but agreement NOT yet in force (ratification pending).',
    notes:
      'Signed 2024-04-13; not in force as of 2025-08 (US implementing legislation pending). Assess at MFN/HTS rate until entry into force.',
  },
  // ─────────────────────── US–Pacific ───────────────────────
  {
    applies: true,
    agreementName: 'Australia–United States Free Trade Agreement',
    agreementShortName: 'AUSFTA',
    partnerCountries: ['US', 'AU'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Tariff shift to the heading of the good OR Regional Value Content ≥ 55% (transaction-value method); 99% of tariff lines at 0% since entry into force.',
    notes:
      'AUSFTA Annex 3 (Tariff Elimination Schedule); Article 5.4 (Regional Value Content). In force 2005-01-01; 99.9% of AU tariff lines duty-free.',
  },
  // ─────────────────────── UK agreements ───────────────────────
  {
    applies: true,
    agreementName: 'UK–EU Trade and Cooperation Agreement',
    agreementShortName: 'UK-EU TCA',
    partnerCountries: ['GB', ...EU_27],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Zero tariffs / zero quotas on originating goods; cumulated rules of origin using the PEM-convention framework (wholly obtained, sufficient transformation, cumulation with EU/UK materials).',
    notes:
      'TCA Title II (Trade in Goods); Annexes ORIG-1 to ORIG-3 (Rules of Origin). In force 2021-05-01 (provisional application since 2021-01-01).',
  },
  {
    applies: true,
    agreementName: 'UK–Japan Comprehensive Economic Partnership Agreement',
    agreementShortName: 'UK-Japan CEPA',
    partnerCountries: ['GB', 'JP'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient transformation — PSR per Annex 2; cumulation with UK/JP materials.',
    notes:
      'UK-Japan CEPA Annex 2 (PSR); in force 2021-01-01. 99% of tariff lines at 0% on entry into force.',
  },
  {
    applies: true,
    agreementName: 'UK–Australia Free Trade Agreement',
    agreementShortName: 'UK-AU FTA',
    partnerCountries: ['GB', 'AU'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient processing — PSR per Annex 2; full cumulation with UK/AU materials.',
    notes:
      'UK-AU FTA Annex 2 (PSR); in force 2023-05-31. 99% of UK & AU tariff lines at 0% on entry into force.',
  },
  {
    applies: true,
    agreementName: 'UK–New Zealand Free Trade Agreement',
    agreementShortName: 'UK-NZ FTA',
    partnerCountries: ['GB', 'NZ'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient transformation — PSR per Annex 2; cumulation with UK/NZ materials.',
    notes:
      'UK-NZ FTA Annex 2 (PSR); in force 2023-05-31. 99% of tariff lines at 0% on entry into force.',
  },
  // ─────────────────────── EU FTA network ───────────────────────
  {
    applies: true,
    agreementName: 'EU–Korea Free Trade Agreement',
    agreementShortName: 'EU-Korea FTA',
    partnerCountries: [...EU_27, 'KR'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficiently worked/processed — product-specific rules (PSR) per Annex II; cumulation with EU materials permitted.',
    notes:
      'EU-Korea FTA Annex II (PSR); in force 2011-07-01. 99% of EU & KR tariff lines at 0% since the 5-year phase-out completed.',
  },
  {
    applies: true,
    agreementName: 'EU–Japan Economic Partnership Agreement',
    agreementShortName: 'EU-Japan EPA',
    partnerCountries: [...EU_27, 'JP'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Originating goods via wholly obtained, wholly produced, or PSR (CTC + optional RVC / specific processing) per Annex 3-A; diagonal cumulation not provided.',
    notes:
      'EU-Japan EPA Annex 3-A (PSR); in force 2019-02-01. 99% of tariff lines at 0%.',
  },
  {
    applies: true,
    agreementName: 'EU–Vietnam Free Trade Agreement',
    agreementShortName: 'EVFTA',
    partnerCountries: [...EU_27, 'VN'],
    preferentialRate: 0.05,
    preferentialType: 'reduced',
    ruleOfOriginSummary:
      'Wholly obtained or sufficiently worked/processed per PSR (Annex II); VN inputs cumulated with EU materials under full cumulation.',
    notes:
      'EVFTA Annex II (PSR); in force 2020-08-01. Tariffs phased over 7–10 years — most lines duty-free, ~5% average residual for sensitive lines still in phase-out.',
  },
  {
    applies: true,
    agreementName: 'EU–Singapore Free Trade Agreement',
    agreementShortName: 'EUSFTA',
    partnerCountries: [...EU_27, 'SG'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficiently worked/processed — PSR per Annex I; ASEAN cumulation permitted for originating materials.',
    notes:
      'EUSFTA Annex I (PSR); in force 2019-11-21. All EU tariff lines duty-free since entry into force; SG phasing out remaining lines.',
  },
  {
    applies: true,
    agreementName: 'EU–Mexico Global Agreement (modernised)',
    agreementShortName: 'EU-Mexico GA',
    partnerCountries: [...EU_27, 'MX'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficiently processed — PSR per Annex; full cumulation with EU and MX materials.',
    notes:
      'Modernised EU-Mexico Global Agreement (in-principle agreement 2018, revised 2024). Original 2000 EU-Mexico GA still in force; modernised text entering into force 2025–2026.',
  },
  {
    applies: true,
    agreementName: 'Canada–European Union Comprehensive Economic and Trade Agreement',
    agreementShortName: 'CETA',
    partnerCountries: [...EU_27, 'CA'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient transformation — PSR per Annex V; full cumulation with EU/CA materials.',
    notes:
      'CETA Annex V (PSR); provisionally applied 2017-09-21 (ratification pending IT/CZ). 99% of tariff lines at 0%.',
  },
  // ─────────────────────── Asia-Pacific ───────────────────────
  {
    applies: true,
    agreementName: 'Regional Comprehensive Economic Partnership',
    agreementShortName: 'RCEP',
    partnerCountries: RCEP,
    preferentialRate: 0.05,
    preferentialType: 'reduced',
    ruleOfOriginSummary:
      'Regional Value Content ≥ 40% (build-down or build-up method) OR product-specific CTC rule; intra-regional cumulation among all 15 parties.',
    notes:
      'RCEP Annex 2 (PSR) + Article 2.5 (RVC); in force 2022-01-01 (CN, JP, AU, NZ, BN, KH, LA, SG, TH, VN, MY), 2022-03-18 (KR). Tariffs phased over 20 years.',
  },
  {
    applies: true,
    agreementName: 'Comprehensive and Progressive Agreement for Trans-Pacific Partnership',
    agreementShortName: 'CPTPP',
    partnerCountries: CPTPP,
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or CTC + RVC alternate (PSR per Annex 2); cumulation among all 12 parties (UK acceded 2024-12-15).',
    notes:
      'CPTPP Annex 2 (PSR); in force 2018-12-30 (AU, NZ, JP, CA, MX, SG, BN, MY, VN), 2019–2022 (PE, CL secondary); UK acceded 2024-12-15.',
  },
  {
    applies: true,
    agreementName: 'China–Australia Free Trade Agreement',
    agreementShortName: 'ChAFTA',
    partnerCountries: ['CN', 'AU'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or CTC + RVC alternate (Annex 3); direct consignment rule applies.',
    notes:
      'ChAFTA Annex 3 (PSR); in force 2015-12-20. 99% of AU tariff lines duty-free (full phase-out by 2026).',
  },
  {
    applies: true,
    agreementName: 'ASEAN–Australia–New Zealand Free Trade Area',
    agreementShortName: 'AANZFTA',
    partnerCountries: [...ASEAN_10, 'AU', 'NZ'],
    preferentialRate: 0.02,
    preferentialType: 'reduced',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient processing — CTC + RVC alternate (Annex 3); full cumulation among AANZFTA parties.',
    notes:
      'AANZFTA Annex 3 (PSR); in force 2010-01-01 (upgraded 2024-09-15). Most tariff lines duty-free; small residual on sensitive ASEAN lines still phasing.',
  },
  {
    applies: true,
    agreementName: 'Japan–Australia Economic Partnership Agreement',
    agreementShortName: 'JAEPA',
    partnerCountries: ['JP', 'AU'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient transformation — PSR per Annex 2; cumulation with JP/AU materials.',
    notes:
      'JAEPA Annex 2 (PSR); in force 2015-01-15. 99% of AU tariff lines at 0% on entry into force; JP finished phasing in 2020.',
  },
  {
    applies: true,
    agreementName: 'Korea–Australia Free Trade Agreement',
    agreementShortName: 'KAFTA',
    partnerCountries: ['KR', 'AU'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient processing — CTC + RVC alternate (Annex 2); direct consignment rule.',
    notes:
      'KAFTA Annex 2 (PSR); in force 2014-12-12. 99% of AU & KR tariff lines at 0% since entry into force.',
  },
  {
    applies: true,
    agreementName: 'Australia–New Zealand Closer Economic Relations Trade Agreement',
    agreementShortName: 'ANZCERTA',
    partnerCountries: ['AU', 'NZ'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or substantial transformation — 50% RVC safe-harbour (FOB method) for goods not wholly originating.',
    notes:
      'ANZCERTA (1983); Protocol on Rules of Origin 1991 (amended 2011). All tariff lines at 0% since 1990.',
  },
  {
    applies: true,
    agreementName: 'Australia–Hong Kong Free Trade Agreement',
    agreementShortName: 'AUS-HK FTA',
    partnerCountries: ['AU', 'HK'],
    preferentialRate: 0,
    preferentialType: 'free',
    ruleOfOriginSummary:
      'Wholly obtained or sufficient processing — CTC + RVC alternate (Annex 2); direct consignment rule.',
    notes:
      'AUS-HK FTA Annex 2 (PSR); in force 2020-01-17. All AU & HK tariff lines at 0% on entry into force.',
  },
];

/** Sentinel provision returned when no FTA links origin and destination. */
const NULL_PROVISION: FtaProvision = {
  applies: false,
  agreementName: '—',
  agreementShortName: '—',
  partnerCountries: [],
  preferentialRate: 0,
  preferentialType: 'free',
  ruleOfOriginSummary:
    'No preferential FTA in force between origin and destination; assess at MFN/General rate.',
  notes:
    'No in-force preferential trade agreement directly links the origin and destination country. Assess duties at the destination country\'s MFN/General (WTO) rate; consider unilateral preference schemes (e.g. EU GSP+, AU PPS, UK DTS) where the origin country is eligible.',
};

/** Lower rank = preferred in tie-breaks. */
const TYPE_RANK: Record<FtaProvision['preferentialType'], number> = {
  free: 0,
  ad_valorem: 1,
  reduced: 2,
};

/**
 * Resolve the BEST in-force FTA preference between origin and destination.
 *
 * An FTA applies when BOTH the origin and destination ISO-2 codes are inside
 * the agreement's `partnerCountries` set (an FTA is bilateral / plurilateral
 * self-contained — imports only qualify between parties), the agreement is
 * marked `applies=true` (i.e. in force), and the origin is not the same as
 * the destination (intra-country shipments are not imports).
 *
 * The BEST provision is selected by lowest `preferentialRate`; ties are
 * broken by `preferentialType` rank (free > ad_valorem > reduced). Other
 * matching provisions are returned in `alternatives` so the UI can render
 * "Other applicable FTAs" alongside the recommended one.
 *
 * @param originISO2      ISO-2 of the country of export/manufacture.
 * @param destinationISO2 ISO-2 of the country of import (the LCIE destination).
 * @param mfnRate         MFN/General rate (decimal) — echoed for advisory UI
 *                        (e.g. "MFN 5% → FTA 0% (-100%)"); default 0.
 */
export function resolveFta(
  originISO2: string,
  destinationISO2: string,
  mfnRate: number = 0,
): FtaResolution {
  const origin = (originISO2 ?? '').trim().toUpperCase();
  const destination = (destinationISO2 ?? '').trim().toUpperCase();

  const matches: FtaProvision[] = FTA_AGREEMENTS.filter(
    (a) =>
      a.applies &&
      origin !== destination &&
      a.partnerCountries.includes(origin) &&
      a.partnerCountries.includes(destination),
  );

  if (matches.length === 0) {
    return {
      originISO2: origin,
      destinationISO2: destination,
      mfnRate,
      preferential: { ...NULL_PROVISION },
      alternatives: [],
    };
  }

  const sorted = [...matches].sort((a, b) => {
    if (a.preferentialRate !== b.preferentialRate) {
      return a.preferentialRate - b.preferentialRate;
    }
    return TYPE_RANK[a.preferentialType] - TYPE_RANK[b.preferentialType];
  });

  const [best, ...rest] = sorted;

  return {
    originISO2: origin,
    destinationISO2: destination,
    mfnRate,
    preferential: best,
    alternatives: rest,
  };
}
