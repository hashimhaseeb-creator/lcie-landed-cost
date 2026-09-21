/**
 * Comprehensive Free Trade Agreement (FTA) + preferential tariff rules module.
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 *
 * Maps every major exporting country → applicable FTA for each of the 4
 * destination regions (US, UK, EU, AU). Returns the preferential duty rate
 * (typically 0% duty-free for goods meeting rules of origin) alongside the
 * MFN/General rate so the engine can show both.
 *
 * Data sourced from official FTA texts + USTR / UK Gov / EU DG Trade / DFAT.
 * Preferential rate defaults to 0 (duty-free) for most industrial/consumer
 * goods under FTAs; rules of origin (RoO) must be met to claim the preference.
 */

import type { Region } from './types';

export interface FtaPreference {
  hasFta: boolean;
  ftaName: string | null;
  preferentialRate: number;     // the FTA preferential rate (0 = duty-free); -1 if no FTA
  note: string;
}

// ═══════════════════════════════════════════════════════════════════
// US FTAs (14 agreements, 20 countries)
// ═══════════════════════════════════════════════════════════════════

const US_FTA_PARTNERS: Record<string, { ftaName: string; note: string }> = {
  AU: { ftaName: 'AUSFTA', note: 'Duty-free under the Australia-US Free Trade Agreement (AUSFTA, 2005). Goods must satisfy AUSFTA rules of origin (generally: tariff shift or 50%+ regional value content).' },
  CA: { ftaName: 'USMCA', note: 'Duty-free under USMCA (2020, replaced NAFTA). Goods must satisfy USMCA rules of origin (tariff shift + regional value content + labour value content).' },
  MX: { ftaName: 'USMCA', note: 'Duty-free under USMCA (2020). Same rules of origin as Canada.' },
  CL: { ftaName: 'US-Chile FTA', note: 'Duty-free under the US-Chile Free Trade Agreement (2004). Tariff shift or 35%+ regional value content.' },
  CO: { ftaName: 'US-Colombia TPA', note: 'Duty-free under the US-Colombia Trade Promotion Agreement (2012).' },
  CR: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA (2006-2009).' },
  DO: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA.' },
  SV: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA.' },
  GT: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA.' },
  HN: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA.' },
  NI: { ftaName: 'DR-CAFTA', note: 'Duty-free under DR-CAFTA.' },
  IL: { ftaName: 'US-Israel FTA', note: 'Duty-free under the US-Israel Free Trade Agreement (1985). No quantitative restrictions.' },
  JO: { ftaName: 'US-Jordan FTA', note: 'Duty-free under the US-Jordan Free Trade Agreement (2001).' },
  KR: { ftaName: 'KORUS', note: 'Duty-free under KORUS (Korea-US Free Trade Agreement, 2012). Tariff shift or 35%+ RVC.' },
  MA: { ftaName: 'US-Morocco FTA', note: 'Duty-free under the US-Morocco Free Trade Agreement (2006).' },
  PA: { ftaName: 'US-Panama TPA', note: 'Duty-free under the US-Panama Trade Promotion Agreement (2012).' },
  PE: { ftaName: 'US-Peru TPA', note: 'Duty-free under the US-Peru Trade Promotion Agreement (2009).' },
  SG: { ftaName: 'USSFTA', note: 'Duty-free under the US-Singapore Free Trade Agreement (2004).' },
  BH: { ftaName: 'US-Bahrain FTA', note: 'Duty-free under the US-Bahrain Free Trade Agreement (2006).' },
  GB: { ftaName: 'US-UK (negotiating)', note: 'No comprehensive US-UK FTA in force. MFN/Third Country rate applies. A limited deal may be under negotiation.' },
  OM: { ftaName: 'US-Oman FTA', note: 'Duty-free under the US-Oman Free Trade Agreement (2009).' },
};

// ═══════════════════════════════════════════════════════════════════
// UK FTAs (39+ agreements, 70+ countries post-Brexit)
// ═══════════════════════════════════════════════════════════════════

const UK_FTA_PARTNERS: Record<string, { ftaName: string; note: string }> = {
  // EU member states (UK-EU Trade and Cooperation Agreement)
  AT: { ftaName: 'UK-EU TCA', note: 'Duty-free under the UK-EU Trade and Cooperation Agreement (2021). Goods must meet rules of origin (generally tariff shift or EU/UK processing).' },
  BE: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  BG: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  HR: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  CY: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  CZ: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  DK: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  EE: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  FI: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  FR: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  DE: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  GR: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  HU: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  IE: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  IT: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  LV: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  LT: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  LU: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  MT: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  NL: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  PL: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  PT: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  RO: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  SK: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  SI: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  ES: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  SE: { ftaName: 'UK-EU TCA', note: 'Duty-free under UK-EU TCA.' },
  // EFTA
  CH: { ftaName: 'UK-Switzerland FTA', note: 'Duty-free under the UK-Switzerland Trade Agreement (rollover from EU-Switzerland, 2021).' },
  NO: { ftaName: 'UK-Norway/Iceland FTA', note: 'Duty-free under the UK-Norway-Iceland FTA (2021).' },
  IS: { ftaName: 'UK-Norway/Iceland FTA', note: 'Duty-free under the UK-Norway-Iceland FTA.' },
  LI: { ftaName: 'UK-Switzerland FTA', note: 'Duty-free under UK-Switzerland FTA.' },
  // Other bilateral FTAs
  JP: { ftaName: 'UK-Japan CEPA', note: 'Duty-free under the UK-Japan Comprehensive Economic Partnership Agreement (2021).' },
  AU: { ftaName: 'A-UKFTA', note: 'Duty-free under the Australia-UK Free Trade Agreement (2023).' },
  NZ: { ftaName: 'UK-NZ FTA', note: 'Duty-free under the UK-New Zealand Free Trade Agreement (2023).' },
  KR: { ftaName: 'UK-Korea FTA', note: 'Duty-free under the UK-Korea FTA (rollover from EU-Korea FTA, 2021).' },
  CA: { ftaName: 'UK-Canada TCA', note: 'Duty-free under the UK-Canada Trade Continuity Agreement (2021).' },
  MX: { ftaName: 'UK-Mexico TCA', note: 'Duty-free under the UK-Mexico Trade Continuity Agreement (rollover, 2021).' },
  CL: { ftaName: 'UK-Chile FTA', note: 'Duty-free under the UK-Chile Trade Agreement (rollover, 2021).' },
  PE: { ftaName: 'UK-Peru FTA', note: 'Duty-free under the UK-Peru Trade Agreement (rollover, 2021).' },
  SG: { ftaName: 'UK-Singapore FTA', note: 'Duty-free under the UK-Singapore Free Trade Agreement (rollover, 2021).' },
  VN: { ftaName: 'UK-Vietnam FTA', note: 'Duty-free under the UK-Vietnam Free Trade Agreement (rollover from EVFTA, 2021).' },
  TR: { ftaName: 'UK-Turkey FTA', note: 'Preferential treatment under the UK-Turkey Free Trade Agreement (2021). Industrial goods generally duty-free.' },
  // CPTPP (UK joined 2024)
  BN: { ftaName: 'CPTPP (UK)', note: 'Duty-free under CPTPP (UK accession 2024).' },
  MY: { ftaName: 'CPTPP (UK)', note: 'Duty-free under CPTPP (UK accession 2024).' },
  BN2: { ftaName: 'CPTPP (UK)', note: 'Duty-free under CPTPP.' },
};

// ═══════════════════════════════════════════════════════════════════
// EU FTAs + GSP+
// ═══════════════════════════════════════════════════════════════════

const EU_FTA_PARTNERS: Record<string, { ftaName: string; note: string }> = {
  GB: { ftaName: 'EU-UK TCA', note: 'Duty-free under the EU-UK Trade and Cooperation Agreement (2021).' },
  JP: { ftaName: 'EU-Japan EPA', note: 'Duty-free under the EU-Japan Economic Partnership Agreement (2019). Most industrial goods duty-free.' },
  KR: { ftaName: 'EU-Korea FTA', note: 'Duty-free under the EU-South Korea Free Trade Agreement (2011/2015).' },
  SG: { ftaName: 'EU-Singapore FTA', note: 'Duty-free under the EU-Singapore Free Trade Agreement (2019).' },
  VN: { ftaName: 'EU-Vietnam FTA', note: 'Preferential rates under the EU-Vietnam Free Trade Agreement (2020). Tariff elimination phased — most goods duty-free by 2027.' },
  CA: { ftaName: 'CETA', note: 'Duty-free under the EU-Canada Comprehensive Economic and Trade Agreement (CETA, provisional 2017).' },
  CL: { ftaName: 'EU-Chile FTA', note: 'Preferential rates under the EU-Chile Association Agreement (2003). Modernized agreement pending.' },
  PE: { ftaName: 'EU-Peru/Colombia FTA', note: 'Preferential rates under the EU-Peru-Colombia Trade Agreement (2013).' },
  CO: { ftaName: 'EU-Peru/Colombia FTA', note: 'Preferential rates under the EU-Peru-Colombia Trade Agreement.' },
  CH: { ftaName: 'EU-Switzerland FTA', note: 'Duty-free under the EU-Switzerland Free Trade Agreement (1972). All industrial goods duty-free.' },
  NO: { ftaName: 'EU-EFTA', note: 'Duty-free under the EU-EFTA Agreement (industrial goods).' },
  IS: { ftaName: 'EU-EFTA', note: 'Duty-free under the EU-EFTA Agreement.' },
  LI: { ftaName: 'EU-EFTA', note: 'Duty-free under the EU-EFTA Agreement.' },
  TR: { ftaName: 'EU-Turkey Customs Union', note: 'Duty-free for industrial goods under the EU-Turkey Customs Union (1995). Agricultural goods use MFN.' },
  MX: { ftaName: 'EU-Mexico (modernizing)', note: 'Preferential rates under the EU-Mexico Global Agreement (2000). Modernized agreement pending.' },
  // GSP+ (Generalised Scheme of Preferences Plus — duty-free/reduced for vulnerable developing countries)
  PK: { ftaName: 'EU GSP+', note: 'Duty-free or reduced rates under the EU GSP+ (Generalised Scheme of Preferences Plus). Pakistan qualifies for zero-duty on most products.' },
  LK: { ftaName: 'EU GSP+', note: 'Duty-free under EU GSP+. Sri Lanka qualifies for zero-duty on most products.' },
  PH: { ftaName: 'EU GSP+', note: 'Duty-free under EU GSP+. Philippines qualifies for zero-duty on most products.' },
  BO: { ftaName: 'EU GSP+', note: 'Duty-free under EU GSP+.' },
  BD: { ftaName: 'EU GSP (EBA)', note: 'Duty-free/quota-free under the EU Everything But Arms (EBA) initiative for LDCs. Bangladesh qualifies.' },
  KH: { ftaName: 'EU GSP (EBA)', note: 'Duty-free under EU EBA (Least Developed Countries).' },
  MM: { ftaName: 'EU GSP (EBA)', note: 'Duty-free under EU EBA.' },
};

// ═══════════════════════════════════════════════════════════════════
// Australia FTAs (19+ agreements)
// ═══════════════════════════════════════════════════════════════════

const AU_FTA_PARTNERS: Record<string, { ftaName: string; note: string }> = {
  // AANZFTA (ASEAN-Australia-New Zealand)
  BN: { ftaName: 'AANZFTA', note: 'Duty-free under AANZFTA (ASEAN-Australia-NZ FTA, 2010). Most goods duty-free.' },
  KH: { ftaName: 'AANZFTA', note: 'Duty-free under AANZFTA.' },
  ID: { ftaName: 'AANZFTA + IA-CEPA', note: 'Duty-free under AANZFTA + the Indonesia-Australia Comprehensive Economic Partnership Agreement (IA-CEPA, 2020). Most goods duty-free.' },
  LA: { ftaName: 'AANZFTA', note: 'Duty-free under AANZFTA.' },
  MY: { ftaName: 'AANZFTA + CPTPP', note: 'Duty-free under AANZFTA + CPTPP. Most goods duty-free.' },
  MM: { ftaName: 'AANZFTA', note: 'Duty-free under AANZFTA.' },
  PH: { ftaName: 'AANZFTA', note: 'Duty-free under AANZFTA.' },
  SG: { ftaName: 'AANZFTA + SAFTA', note: 'Duty-free under AANZFTA + the Singapore-Australia FTA (SAFTA, 2003). All goods duty-free.' },
  TH: { ftaName: 'AANZFTA + TAFTA', note: 'Duty-free under AANZFTA + the Thailand-Australia FTA (TAFTA, 2005). Most goods duty-free.' },
  VN: { ftaName: 'AANZFTA + CPTPP', note: 'Duty-free under AANZFTA + CPTPP.' },
  // Bilateral FTAs
  CN: { ftaName: 'ChAFTA', note: 'Preferential rates under the China-Australia FTA (ChAFTA, 2015). Most goods duty-free, but trade tensions + anti-dumping measures may apply to specific products. Rules of origin required.' },
  JP: { ftaName: 'JAEPA', note: 'Duty-free under the Japan-Australia Economic Partnership Agreement (JAEPA, 2015).' },
  KR: { ftaName: 'KAFTA', note: 'Duty-free under the Korea-Australia FTA (KAFTA, 2014).' },
  US: { ftaName: 'AUSFTA', note: 'Duty-free under AUSFTA (2005).' },
  GB: { ftaName: 'A-UKFTA', note: 'Duty-free under the Australia-UK FTA (2023).' },
  NZ: { ftaName: 'ANZCERTA', note: 'Duty-free under the Australia-NZ Closer Economic Relations Trade Agreement (ANZCERTA, 1983). All goods duty-free.' },
  CL: { ftaName: 'CPTPP', note: 'Duty-free under CPTPP (Comprehensive and Progressive Trans-Pacific Partnership).' },
  CA: { ftaName: 'CPTPP', note: 'Duty-free under CPTPP.' },
  PE: { ftaName: 'CPTPP', note: 'Duty-free under CPTPP.' },
  MX: { ftaName: 'CPTPP', note: 'Duty-free under CPTPP.' },
  BN2: { ftaName: 'CPTPP', note: 'Duty-free under CPTPP.' },
  AE: { ftaName: 'A-UAE CEPA', note: 'Preferential rates under the Australia-UAE CEPA (2025). Most goods duty-free.' },
  IN: { ftaName: 'AI-ECTA (negotiating)', note: 'No FTA in force. MFN/General rate applies. The Australia-India Economic Cooperation and Trade Agreement (AI-ECTA) is under negotiation.' },
  // RCEP
  CN2: { ftaName: 'RCEP', note: 'Preferential rates under RCEP (Regional Comprehensive Economic Partnership, 2022) for ASEAN + China/Japan/Korea/NZ/AU.' },
};

// ═══════════════════════════════════════════════════════════════════
// Lookup function
// ═══════════════════════════════════════════════════════════════════

const FTA_TABLES: Record<string, Record<string, { ftaName: string; note: string }>> = {
  US: US_FTA_PARTNERS,
  UK: UK_FTA_PARTNERS,
  EU: EU_FTA_PARTNERS,
  AU: AU_FTA_PARTNERS,
};

/**
 * Look up the applicable FTA / preferential tariff for a given destination
 * region + origin country. Returns the FTA name + preferential rate (0 =
 * duty-free for most goods) + a note about rules of origin.
 *
 * If no FTA applies, returns hasFta: false and the MFN/General rate applies.
 */
export function getFtaPreference(region: Region, originCountry?: string | null): FtaPreference {
  const cc = (originCountry ?? '').toUpperCase().trim();
  if (!cc) return { hasFta: false, ftaName: null, preferentialRate: -1, note: 'No origin country specified — MFN/General rate applies.' };

  const table = FTA_TABLES[region];
  if (!table) return { hasFta: false, ftaName: null, preferentialRate: -1, note: 'Unknown destination region.' };

  const entry = table[cc];
  if (!entry || /negotiating|pending/i.test(entry.ftaName)) {
    // No FTA in force (either no entry, or the entry is marked as negotiating/pending)
    return {
      hasFta: false,
      ftaName: entry?.ftaName ?? null,
      preferentialRate: -1,
      note: entry?.note ?? `No FTA between ${cc} and ${region}. MFN/General rate applies. ${cc === 'CN' && region !== 'AU' ? 'For China→US: the 9903.88.42 reciprocal tariff at 125% applies. ' : ''}Consider GSP (if active) or preferential origin claims if applicable.`,
    };
  }

  return {
    hasFta: true,
    ftaName: entry.ftaName,
    preferentialRate: 0, // FTA preferential rate = 0% (duty-free) for most industrial/consumer goods
    note: entry.note,
  };
}

/**
 * Get a summary of all applicable FTA preferences for a PO across 4 regions.
 */
export function getFtaSummary(originCountry: string): Record<Region, FtaPreference> {
  return {
    US: getFtaPreference('US', originCountry),
    UK: getFtaPreference('UK', originCountry),
    EU: getFtaPreference('EU', originCountry),
    AU: getFtaPreference('AU', originCountry),
  };
}
