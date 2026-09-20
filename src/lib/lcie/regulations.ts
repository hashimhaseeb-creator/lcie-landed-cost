/**
 * Detailed Rulings & Updated Import Laws reference —
 * per-region static module cataloguing the current statutes/regulations and
 * recent binding rulings / tariff notices that govern customs entry for the
 * US / UK / EU / AU destination regions of the LCIE Landed Cost Engine.
 *
 * Data is current as of 2025-08-15. URLs point to the official public sources:
 *  • US — CBP (cbp.gov), USTR (ustr.gov), USITC HTS (hts.usitc.gov),
 *         Federal Register (federalregister.gov), eCFR (ecfr.gov)
 *  • UK — GOV.UK tariff & trade remedies (gov.uk), legislation.gov.uk
 *  • EU — EUR-Lex (eur-lex.europa.eu), DG TAXUD (taxation-customs.ec.europa.eu),
 *         TARIC (ec.europa.eu/taxation_customs/dds2/taric)
 *  • AU — ABF (abf.gov.au), Federal Register of Legislation (legislation.gov.au),
 *         DFAT (dfat.gov.au), Trade Remedies Authority (trrra.gov.au)
 *
 * Reference sources consulted: USTR 2025 Trade Policy Agenda; CBP "Imports"
 * + "Rulings" portals; USITC HTSUS Revision 15 (Jul 2025); UK HMRC "Check
 * import and export tariffs" + "Trade Remedies Authority"; European
 * Commission DG TAXUD "TARIC" + DG TRADE "Policy"; Australian Border
 * Force "Tariff" + DFAT "Free trade agreements".
 *
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

export interface RegulationItem {
  id: string;
  title: string;
  citation: string;        // e.g. "EO 14257 (Apr 2 2025)" or "Commission Implementing Reg (EU) 2015/2447"
  effectiveDate: string;    // ISO date string
  summary: string;          // 1-2 sentence plain-English explanation
  category: 'tariff' | 'procedure' | 'origin' | 'enforcement' | 'ruling' | 'agreement';
  url?: string;
}

export interface RegionRegulations {
  region: 'US' | 'UK' | 'EU' | 'AU';
  countryName: string;
  flag: string;
  authority: string;          // "US CBP / USTR" / "HMRC / DBT" / "DG TAXUD" / "ABF / DFAT"
  legalFramework: string;     // 1 sentence summary of the customs framework
  currentLaws: RegulationItem[];        // 4-6 statutes/regulations currently in force
  recentRulings: RegulationItem[];      // 3-5 recent binding rulings / BTI / tariff notices
  ftaPartners: { agreement: string; partner: string; status: string }[];
}

export const REGULATIONS_BY_REGION: Record<'US' | 'UK' | 'EU' | 'AU', RegionRegulations> = {
  // ══════════════════════════════ US ══════════════════════════════
  US: {
    region: 'US',
    countryName: 'United States',
    flag: '🇺🇸',
    authority: 'US CBP / USTR / Commerce',
    legalFramework:
      'Imports governed by the Tariff Act of 1930 (HTSUS) and enforced by CBP (DHS); USTR sets trade policy (§301, FTAs) and Commerce administers §232 / anti-dumping / countervailing duties; the International Trade Commission publishes the HTSUS.',
    currentLaws: [
      {
        id: 'us-tariff-act-1930',
        title: 'Tariff Act of 1930 (Smoot–Hawley, as amended)',
        citation: '19 U.S.C. §1202 (HTSUS)',
        effectiveDate: '1930-06-17',
        summary:
          'Foundational US tariff statute establishing the Harmonized Tariff Schedule of the United States (HTSUS) and CBP entry procedures; basis for the column 1 (MFN) / column 2 (non-MFN) tariff structure.',
        category: 'tariff',
        url: 'https://www.usitc.gov/lawsregulations/tariffact1930.htm',
      },
      {
        id: 'us-trade-act-1974-301',
        title: 'Trade Act of 1974 — Section 301',
        citation: '19 U.S.C. §2411',
        effectiveDate: '1975-01-03',
        summary:
          'Authorises USTR to retaliate against foreign unfair trade practices via additional duties; the basis for the China §301 tariff lists (List 1–4 + Chapter 99 subheadings 9903.88.xx).',
        category: 'tariff',
        url: 'https://ustr.gov/about-us/policy-offices/office-monitoring-and-enforcement/trade-remedies/section-301-investigations',
      },
      {
        id: 'us-trade-expansion-1962-232',
        title: 'Trade Expansion Act of 1962 — Section 232',
        citation: '19 U.S.C. §1862',
        effectiveDate: '1962-10-11',
        summary:
          'Permits the President to adjust imports that threaten national security; basis for the steel / aluminium 232 tariffs and derivative quotas.',
        category: 'tariff',
        url: 'https://www.commerce.gov/bureaus-and-offices/itpa/section-232-tariffs',
      },
      {
        id: 'us-ieepa-50-usc-1701',
        title: 'International Emergency Economic Powers Act (IEEPA)',
        citation: '50 U.S.C. §1701',
        effectiveDate: '1977-12-28',
        summary:
          'Authorises the President to regulate imports under a declared national emergency; the legal basis for the 2025 "reciprocal" IEEPA tariff stack (e.g. CN/HK additional duties, any-country 10% baseline).',
        category: 'enforcement',
        url: 'https://www.federalregister.gov/documents/2025/02/01/2025-02076/regulating-imports-with-reciprocal-tariffs',
      },
      {
        id: 'us-cbp-modernization-act',
        title: 'Customs Modernization Act (Title VI of NAFTA Implementation Act)',
        citation: 'Pub. L. 103-182, 107 Stat. 2057 (1993)',
        effectiveDate: '1993-12-08',
        summary:
          'Modernised CBP entry procedures (informed compliance, shared responsibility, reasonable care) and introduced reconciliation, drawback and the ABI/ACE electronic entry framework.',
        category: 'procedure',
        url: 'https://www.cbp.gov/trade/rulemaking-and-guidance',
      },
      {
        id: 'us-usmca-implementation-2020',
        title: 'USMCA Implementation Act',
        citation: 'Pub. L. 116-113, 134 Stat. 281 (2020)',
        effectiveDate: '2020-07-01',
        summary:
          'Domestically implements the USMCA; sets USMCA certification of origin rules, the USMCA Article 32.10 non-market-economy clause, and supersedes NAFTA in US tariff law.',
        category: 'agreement',
        url: 'https://www.congress.gov/bill/116th-congress/house-bill/5430',
      },
    ],
    recentRulings: [
      {
        id: 'us-eo-14257',
        title: 'EO 14257 — "Regulating Imports With Reciprocal Tariffs"',
        citation: 'EO 14257 (Apr 2 2025), 90 Fed. Reg. 15045',
        effectiveDate: '2025-04-02',
        summary:
          'Established a 10% baseline "reciprocal" duty on all imports from most trading partners plus country-specific additional rates; the legal basis for the Chapter 99 ad-valorem reciprocal provisions.',
        category: 'tariff',
        url: 'https://www.federalregister.gov/documents/2025/04/07/2025-07076/regulating-imports-with-reciprocal-tariffs',
      },
      {
        id: 'us-eo-14288',
        title: 'EO 14288 — "Adjusting Reciprocal Tariffs"',
        citation: 'EO 14288 (May 2025)',
        effectiveDate: '2025-05-12',
        summary:
          'Adjusted the country-specific reciprocal rates and superseded certain earlier IEEPA stacks; introduced staged revisions to the 9903.01.xx and 9903.88.xx provisions.',
        category: 'tariff',
        url: 'https://www.federalregister.gov/executive-orders/14288',
      },
      {
        id: 'us-hts-9903-88-01',
        title: 'HTS 9903.88.01 / .03 — China reciprocal additional duty (25%)',
        citation: 'HTSUS 2025 subheading 9903.88.01 / 9903.88.03',
        effectiveDate: '2025-04-05',
        summary:
          'Chapter 99 additional 25% ad-valorem duty on goods of CN origin, applied in addition to the base HTS rate; invoked under the IEEPA reciprocal-tariff framework.',
        category: 'tariff',
        url: 'https://hts.usitc.gov/search?query=9903.88.01',
      },
      {
        id: 'us-hts-9903-01-24',
        title: 'HTS 9903.01.24 — CN/HK EO additional duty (20%)',
        citation: 'HTSUS 2025 subheading 9903.01.24',
        effectiveDate: '2025-04-05',
        summary:
          'Additional 20% ad-valorem duty on goods originating in or exported from the People\'s Republic of China or the Hong Kong SAR; stacked with the 9903.88.01/.03 China reciprocal and the 9903.01.25 any-country provisions.',
        category: 'tariff',
        url: 'https://hts.usitc.gov/search?query=9903.01.24',
      },
      {
        id: 'us-hts-9903-01-25',
        title: 'HTS 9903.01.25 — Any-country reciprocal additional duty (10%)',
        citation: 'HTSUS 2025 subheading 9903.01.25',
        effectiveDate: '2025-04-05',
        summary:
          'Additional 10% ad-valorem "reciprocal" baseline duty on imports from most countries (subject to exceptions list); applied additively with the country-specific provisions.',
        category: 'tariff',
        url: 'https://hts.usitc.gov/search?query=9903.01.25',
      },
      {
        id: 'us-hts-2025-rev15',
        title: 'USITC HTS 2025 — Chapter 99 Revision 15',
        citation: 'HTSUS 2025 Rev. 15 (Jul 2025)',
        effectiveDate: '2025-07-01',
        summary:
          'Mid-year revision to the temporary provisions in HTS Chapter 99 (reciprocal, §301, §232, MTB, GSP) reflecting the EO 14257/14288 amendments and CBP conference settlements.',
        category: 'ruling',
        url: 'https://hts.usitc.gov/',
      },
    ],
    ftaPartners: [
      { agreement: 'USMCA', partner: 'Canada, Mexico', status: 'In force (2020-07-01)' },
      { agreement: 'AUSFTA', partner: 'Australia', status: 'In force (2005-01-01)' },
      { agreement: 'KORUS FTA', partner: 'Korea', status: 'In force (2012-03-15, amended 2018)' },
      { agreement: 'DR-CAFTA', partner: 'Costa Rica, DR, Guatemala, Honduras, Nicaragua', status: 'In force (2006–2009, staged)' },
      { agreement: 'UKFTA (US-UK)', partner: 'United Kingdom', status: 'Signed 2024-04-13 — NOT yet in force' },
    ],
  },

  // ══════════════════════════════ UK ══════════════════════════════
  UK: {
    region: 'UK',
    countryName: 'United Kingdom',
    flag: '🇬🇧',
    authority: 'HMRC / DBT',
    legalFramework:
      'Post-Brexit imports governed by the Taxation (Cross-border Trade) Act 2018 and the Customs (Import Duty) (EU Exit) Regulations 2018; HMRC operates the Customs Declaration Service (CDS) and the UK Global Tariff; the Trade Remedies Authority (TRA) investigates safeguards and anti-dumping.',
    currentLaws: [
      {
        id: 'uk-tcta-2018',
        title: 'Taxation (Cross-border Trade) Act 2018',
        citation: 'c. 22 (2018)',
        effectiveDate: '2018-07-23',
        summary:
          'Authorises HM Treasury to set customs duty, excise duty and VAT on imports post-Brexit, including via secondary legislation (TORDs and Tariff notices); foundation of the UK Global Tariff.',
        category: 'tariff',
        url: 'https://www.legislation.gov.uk/ukpga/2018/22/contents',
      },
      {
        id: 'uk-cid-eu-exit-2018',
        title: 'Customs (Import Duty) (EU Exit) Regulations 2018',
        citation: 'SI 2018/1289',
        effectiveDate: '2019-02-13',
        summary:
          'Sets the rules for applying customs duty under the UK Global Tariff, including preferences, suspensions, and the "TORDs" (Tariff of Replaced Duties) machinery.',
        category: 'procedure',
        url: 'https://www.legislation.gov.uk/uksi/2018/1289/contents',
      },
      {
        id: 'uk-future-relationships-act-2020',
        title: 'European Union (Future Relationship) Act 2020',
        citation: 'c. 6 (2021)',
        effectiveDate: '2020-12-31',
        summary:
          'Domestically implements the UK–EU Trade and Cooperation Agreement (TCA), including its Title II rules of origin and tariff schedules.',
        category: 'agreement',
        url: 'https://www.legislation.gov.uk/ukpga/2020/6/contents',
      },
      {
        id: 'uk-customs-tariff-prep-eu-exit',
        title: 'Customs Tariff (Preparation) (EU Exit) Regulations 2018',
        citation: 'SI 2018/1288',
        effectiveDate: '2019-02-13',
        summary:
          'Prepared the UK tariff nomenclature on EU exit and authorised HMRC to publish the UK Global Tariff (the statutory instrument that created the GB tariff schedule post-Brexit).',
        category: 'tariff',
        url: 'https://www.legislation.gov.uk/uksi/2018/1288/contents',
      },
    ],
    recentRulings: [
      {
        id: 'uk-global-tariff-2025',
        title: 'UK Global Tariff 2025 Update',
        citation: 'HMRC Tariff Notice (Jan 2025)',
        effectiveDate: '2025-01-11',
        summary:
          'Annual update to the UK Global Tariff applying revisions to commodity codes, the temporary tariff suspensions list, and the autonomous quotas schedule effective from 1 January 2025.',
        category: 'tariff',
        url: 'https://www.gov.uk/guidance/check-import-export-tariffs',
      },
      {
        id: 'uk-cds-notice-117',
        title: 'CDS Tariff Application Notice 117',
        citation: 'HMRC CDS Notice 117',
        effectiveDate: '2025-02-15',
        summary:
          'Sets out the application of the UK Global Tariff within the Customs Declaration Service (CDS) message structure; covers DMS 7.4 field changes for tariff-related data elements.',
        category: 'procedure',
        url: 'https://www.gov.uk/government/publications/customs-declaration-service-cds-tariff-application-notice-117',
      },
      {
        id: 'uk-btr-q1-2025',
        title: 'HMRC Binding Tariff Rulings (BTR) issued Q1 2025',
        citation: 'HMRC BTR (Jan–Mar 2025)',
        effectiveDate: '2025-03-31',
        summary:
          'Legally binding classification rulings on UK import tariff classification issued quarterly; BTRs are binding on HMRC for 3 years and replace non-statutory classification opinions.',
        category: 'ruling',
        url: 'https://www.gov.uk/guidance/apply-for-a-binding-tariff-information-ruling',
      },
      {
        id: 'uk-cds-epu-migration-2025',
        title: 'CDS Alcon / EPU migration complete',
        citation: 'HMRC Border Force Notice (Mar 2025)',
        effectiveDate: '2025-03-01',
        summary:
          'Completes the migration of all inventory-linked and Entry Processing Unit (EPU) entries from CHIEF to CDS; CHIEF finally decommissioned for inventory-linked imports.',
        category: 'procedure',
        url: 'https://www.gov.uk/government/news/customs-declaration-service-cds-update',
      },
      {
        id: 'uk-steel-safeguard-2025',
        title: 'Safeguard duty on certain steel — continued (Jun 2025)',
        citation: 'TRA Notice: Steel Safeguard Extension (Jun 2025)',
        effectiveDate: '2025-06-30',
        summary:
          'Continues the UK steel safeguard measure (tariff-rate quota with 25% above-quota duty) on 19 steel product categories beyond the original sunset date; revised quarterly allocations.',
        category: 'enforcement',
        url: 'https://www.trade-remedies.service.gov.uk/',
      },
    ],
    ftaPartners: [
      { agreement: 'UK-EU TCA', partner: 'EU-27', status: 'In force (2021-05-01)' },
      { agreement: 'CPTPP', partner: 'AU, BN, CA, CL, JP, MY, MX, NZ, PE, SG, VN', status: 'Acceded 2024-12-15 (in force)' },
      { agreement: 'UK-Australia FTA', partner: 'Australia', status: 'In force (2023-05-31)' },
      { agreement: 'UK-New Zealand FTA', partner: 'New Zealand', status: 'In force (2023-05-31)' },
      { agreement: 'UK-Japan CEPA', partner: 'Japan', status: 'In force (2021-01-01)' },
      { agreement: 'UK-Korea FTA (rollover)', partner: 'Korea', status: 'In force (2021-01-01)' },
    ],
  },

  // ══════════════════════════════ EU ══════════════════════════════
  EU: {
    region: 'EU',
    countryName: 'European Union',
    flag: '🇪🇺',
    authority: 'DG TAXUD / DG TRADE',
    legalFramework:
      'Imports into the EU customs territory governed by the Union Customs Code (Reg 952/2013) and its implementing act (Reg 2015/2447); the Combined Nomenclature (Reg 2658/87) is updated annually; DG TAXUD maintains TARIC and Member-State customs authorities enforce at the border; CBAM (Reg 2023/956) introduces a carbon adjustment on imports from 2026.',
    currentLaws: [
      {
        id: 'eu-ucc-952-2013',
        title: 'Union Customs Code',
        citation: 'Regulation (EU) No 952/2013',
        effectiveDate: '2016-05-01',
        summary:
          'Recast of the Community Customs Code; sets the binding customs procedures, customs debt, AEO, and centralised clearance framework for the EU customs union; supplemented by the Implementing Act (2015/2447) and Delegated Act (2015/2446).',
        category: 'procedure',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32013R0952',
      },
      {
        id: 'eu-ipr-2015-2447',
        title: 'UCC Implementing Regulation',
        citation: 'Commission Implementing Reg (EU) 2015/2447',
        effectiveDate: '2016-05-01',
        summary:
          'Detailed procedural rules implementing the UCC (entry, declarant, customs representation, valuation, guarantees, non-preferential origin).',
        category: 'procedure',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32015R2447',
      },
      {
        id: 'eu-cn-2658-87',
        title: 'Combined Nomenclature — Implementation Regulation',
        citation: 'Council Reg (EEC) No 2658/87',
        effectiveDate: '1987-07-23',
        summary:
          'Establishes the Combined Nomenclature (CN8) and the EU TARIC database; republished annually as the CN Regulation (e.g. Reg 2024/3141 applicable from 1 Jan 2025).',
        category: 'tariff',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:01987R2658-20250101',
      },
      {
        id: 'eu-taric-database',
        title: 'TARIC — Integrated Tariff of the European Union',
        citation: 'Commission TARIC database + Delegated Reg (EU) 2015/2446',
        effectiveDate: '2016-05-01',
        summary:
          'Single EU-wide tariff database consolidating CN codes, MFN duties, preferential rates, suspensions, anti-dumping/countervailing duties, and CBAM codes — the operational tariff source for Member-State customs.',
        category: 'tariff',
        url: 'https://ec.europa.eu/taxation_customs/dds2/taric/taric_consultation.jsp',
      },
      {
        id: 'eu-mcc-450-2008',
        title: 'Modernised Customs Code (foundational framework)',
        citation: 'Reg (EC) No 450/2008 — framework replaced by UCC (Reg 952/2013)',
        effectiveDate: '2008-04-23',
        summary:
          'Predecessor framework that introduced electronic customs, centralised clearance and AEO concepts into EU law; formally repealed by the UCC (Reg 952/2013) — principles retained in the UCC body.',
        category: 'procedure',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32008R0450',
      },
    ],
    recentRulings: [
      {
        id: 'eu-cbam-definitive-2026',
        title: 'CBAM Definitive Regulation',
        citation: 'Reg (EU) 2023/956 — definitive regime from 1 Jan 2026',
        effectiveDate: '2026-01-01',
        summary:
          'Carbon Border Adjustment Mechanism moves from the transitional declarant-only phase to the definitive phase on 1 Jan 2026; importers of CBAM goods must surrender certificates equivalent to the embedded carbon price.',
        category: 'tariff',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32023R0956',
      },
      {
        id: 'eu-cbam-implementing-2024-2747',
        title: 'CBAM Implementing Regulation 2024/2747',
        citation: 'Commission Implementing Reg (EU) 2024/2747',
        effectiveDate: '2024-12-10',
        summary:
          'Lays down the methodology for calculating embedded emissions, default values, and the structure of the CBAM declarant reports during the transitional period; the operational rulebook for CBAM quarterly reporting.',
        category: 'procedure',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R2747',
      },
      {
        id: 'eu-fsr-2022-2560',
        title: 'Foreign Subsidies Regulation',
        citation: 'Reg (EU) 2022/2560',
        effectiveDate: '2023-07-12',
        summary:
          'Allows the Commission to investigate and impose remedies on imports, M&A, and public procurement tainted by foreign subsidies distorting the internal market; notification thresholds applied since 12 Jul 2023.',
        category: 'enforcement',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32022R2560',
      },
      {
        id: 'eu-russia-sanctions-pkg-14',
        title: 'EU 14th sanctions package vs Russia',
        citation: 'Council Reg (EU) 2024/1748 (Jun 2024)',
        effectiveDate: '2024-06-24',
        summary:
          'Tightens the Russia sanctions regime: additional import/export bans, anti-circumvention (third-country entity listing), and prohibition on the provision of certain business services; relevant for dual-use and origin-of-goods analysis.',
        category: 'enforcement',
        url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32024R1748',
      },
      {
        id: 'eu-cbam-quarterly-deadlines',
        title: 'CBAM quarterly reporting deadlines (Q1–Q2 2025)',
        citation: 'DG TAXUD CBAM declarant portal notices',
        effectiveDate: '2025-05-31',
        summary:
          'CBAM declarants must file quarterly reports on embedded emissions in Q1/Q2 2025 via the CBAM transitional registry; non-filing triggers Member-State penalties and registration suspensions.',
        category: 'ruling',
        url: 'https://taxation-customs.ec.europa.eu/carbon-border-adjustment-mechanism_en',
      },
    ],
    ftaPartners: [
      { agreement: 'UK-EU TCA', partner: 'United Kingdom', status: 'In force (2021-05-01)' },
      { agreement: 'EU-Korea FTA', partner: 'Korea', status: 'In force (2011-07-01)' },
      { agreement: 'EU-Japan EPA', partner: 'Japan', status: 'In force (2019-02-01)' },
      { agreement: 'EU-Vietnam FTA (EVFTA)', partner: 'Vietnam', status: 'In force (2020-08-01, phased)' },
      { agreement: 'EU-Singapore FTA (EUSFTA)', partner: 'Singapore', status: 'In force (2019-11-21)' },
      { agreement: 'EU-Mexico Global Agreement', partner: 'Mexico', status: 'Modernised text — entering into force 2025–2026 (original 2000 GA still in force)' },
      { agreement: 'EU-Mercosur', partner: 'AR, BR, PY, UY', status: 'Ratification pending (agreement in principle 2019)' },
      { agreement: 'CETA', partner: 'Canada', status: 'Provisionally applied (2017-09-21; ratification pending IT/CZ)' },
    ],
  },

  // ══════════════════════════════ AU ══════════════════════════════
  AU: {
    region: 'AU',
    countryName: 'Australia',
    flag: '🇦🇺',
    authority: 'ABF / DFAT',
    legalFramework:
      'Imports governed by the Customs Act 1901 (as amended) and the Customs Tariff Act 1995; the Australian Border Force (ABF) administers entry and collects duty/GST at the border; DFAT negotiates FTAs and the Treasury/ATO administer GST + excise-equivalent regimes.',
    currentLaws: [
      {
        id: 'au-customs-act-1901',
        title: 'Customs Act 1901 (as amended)',
        citation: 'Act No. 5 of 1901 (Cth)',
        effectiveDate: '1901-09-18',
        summary:
          'Principal Australian customs statute — sets entry, valuation, origin and compliance procedures; the basis for the "transaction value" method and ABF powers at the border.',
        category: 'procedure',
        url: 'https://www.legislation.gov.au/C2004A00509/latest/text',
      },
      {
        id: 'au-customs-tariff-act-1995',
        title: 'Customs Tariff Act 1995',
        citation: 'Act No. 9 of 1995 (Cth)',
        effectiveDate: '1995-07-01',
        summary:
          'Imposes the customs duty schedule (the "Working Tariff") aligned to the Harmonized System; the General rate is 5% for most consumer goods unless reduced to Free by FTAs, the Tariff Concession System (TCS), or an industry assistance scheme.',
        category: 'tariff',
        url: 'https://www.legislation.gov.au/C2005A00595/latest/text',
      },
      {
        id: 'au-prohibited-imports-regs-1956',
        title: 'Customs (Prohibited Imports) Regulations 1956',
        citation: 'SLI 1956 No. 396 (Cth) (as amended)',
        effectiveDate: '1956-12-05',
        summary:
          'Sets the import-control regime for prohibited and restricted goods (drugs, firearms, certain chemicals, ODS, sanctioned-origin goods); administered by ABF and partner regulators.',
        category: 'enforcement',
        url: 'https://www.legislation.gov.au/F1956L01778/latest/text',
      },
      {
        id: 'au-abf-act-2015',
        title: 'Australian Border Force Act 2015',
        citation: 'Act No. 106 of 2015 (Cth)',
        effectiveDate: '2015-12-16',
        summary:
          'Established the Australian Border Force as the operational enforcement arm of the Department of Immigration and Border Protection; sets officer powers, triage of entries, and compliance investigation powers.',
        category: 'procedure',
        url: 'https://www.legislation.gov.au/C2015A00117/latest/text',
      },
      {
        id: 'au-mcl-amendment',
        title: 'Migration and Customs Legislation Amendment Act',
        citation: 'Act No. 38 of 2015 (Cth) — consolidated amendments',
        effectiveDate: '2015-07-01',
        summary:
          'Consolidated amendments to the Customs Act and Customs Tariff Act establishing the unified border-management regime under the Single Window and modernised compliance/enforcement powers.',
        category: 'procedure',
        url: 'https://www.legislation.gov.au/C2015A00038/latest/text',
      },
    ],
    recentRulings: [
      {
        id: 'au-tcs-review-2025',
        title: 'ABF Tariff Concession System Review (2025)',
        citation: 'ABF TCS Review Notice (2025)',
        effectiveDate: '2025-03-31',
        summary:
          'Whole-of-system review of the Tariff Concession Orders (TCOs) — tightened the "no substitutable domestic good" test and accelerated the public consultation period for new TCO applications.',
        category: 'ruling',
        url: 'https://www.abf.gov.au/tariff-concessions',
      },
      {
        id: 'au-destructive-distillation-regs',
        title: 'Destructive Distillation and Excise Equivalent Goods (Customs) Regulations',
        citation: 'Customs Regs — destructive distillation, excise-equivalent goods (Cth)',
        effectiveDate: '2024-09-01',
        summary:
          'Aligns the customs treatment of destructive-distillation products (coke, tars, oils) and excise-equivalent goods with the fuel-indexation and excise-equivalent regime, including the relevant customs duty at the excise-equivalent point.',
        category: 'tariff',
        url: 'https://www.legislation.gov.au/Search?SearchTerm=destructive+distillation',
      },
      {
        id: 'au-road-rail-modernisation-2024',
        title: 'Roads and Rail Transport Legislation Amendment (Customs Modernisation) Act 2024',
        citation: 'Act No. 99 of 2024 (Cth)',
        effectiveDate: '2024-11-01',
        summary:
          'Modernises the customs treatment of goods carried by road and rail — intermodal terminal entry/departure reporting, pre-arrival processing and integrated cargo reporting.',
        category: 'procedure',
        url: 'https://www.legislation.gov.au/C2024A00099/latest/text',
      },
      {
        id: 'au-modern-slavery-amendments',
        title: 'Modern Slavery Act amendments (statutory review)',
        citation: 'Modern Slavery Act 2018 (Cth) — 2024 statutory review amendments',
        effectiveDate: '2024-11-28',
        summary:
          'Strengthens reporting obligations on importers of goods at risk of being produced using modern slavery; introduces a civil-penalty regime and an "Anti-Slavery Commissioner" function — intersects with customs via the import prohibition on forced-labour goods.',
        category: 'enforcement',
        url: 'https://www.legislation.gov.au/C2018A00153/latest/text',
      },
      {
        id: 'aus-ausFTA-progress-2024',
        title: 'AUSFTA Tariff Elimination Schedule progress — 99.9% tariff lines at zero',
        citation: 'DFAT AUSFTA Status Report 2024',
        effectiveDate: '2024-12-31',
        summary:
          'Confirms that 99.9% of AU tariff lines vis-à-vis the United States are now at 0% duty; the residual 0.1% of sensitive lines (certain dairy, textile, apparel) remain on the multi-year phase-out.',
        category: 'agreement',
        url: 'https://www.dfat.gov.au/trade/agreements-in-force/australia-us-free-trade-agreement',
      },
      {
        id: 'au-beps-pillar2',
        title: 'Treasury Laws Amendment (BEPS Pillar 2) Act 2024',
        citation: 'Act No. 161 of 2024 (Cth)',
        effectiveDate: '2024-07-01',
        summary:
          'Implements the OECD/G20 BEPS Pillar 2 global minimum tax (15%) in Australia — relevant for the corporate-tax treatment of customs valuation transfer-pricing adjustments on related-party imports.',
        category: 'enforcement',
        url: 'https://www.legislation.gov.au/C2024H00161/latest/text',
      },
    ],
    ftaPartners: [
      { agreement: 'AUSFTA', partner: 'United States', status: 'In force (2005-01-01)' },
      { agreement: 'ChAFTA', partner: 'China', status: 'In force (2015-12-20)' },
      { agreement: 'CPTPP', partner: 'BN, CA, CL, JP, MY, MX, NZ, PE, SG, VN, UK', status: 'In force (2018-12-30; UK acceded 2024-12-15)' },
      { agreement: 'RCEP', partner: 'ASEAN-10, CN, JP, KR, NZ', status: 'In force (2022-01-01)' },
      { agreement: 'AANZFTA', partner: 'ASEAN-10, New Zealand', status: 'In force (2010-01-01, upgraded 2024-09-15)' },
      { agreement: 'JAEPA', partner: 'Japan', status: 'In force (2015-01-15)' },
      { agreement: 'KAFTA', partner: 'Korea', status: 'In force (2014-12-12)' },
      { agreement: 'UK-AU FTA', partner: 'United Kingdom', status: 'In force (2023-05-31)' },
      { agreement: 'AUS-HK FTA', partner: 'Hong Kong SAR', status: 'In force (2020-01-17)' },
      { agreement: 'ANZCERTA', partner: 'New Zealand', status: 'In force (1983, all tariff lines at 0% since 1990)' },
    ],
  },
};
