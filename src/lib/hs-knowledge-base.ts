/**
 * HS Code Knowledge Base + Duty/Tax Rules Reference
 * --------------------------------------------------
 * Static, lookup-only module used to ground the LCIE Landed Cost Agent
 * (Task 3 — `/api/lcie/determine-codes`) when it classifies purchase-order
 * line items against US HTS, UK Global Tariff and EU TARIC schedules.
 *
 * Contents:
 *   1. `HsCodeEntry` / `RegionalHsCode` / `DutyRule` types
 *   2. `HS_KNOWLEDGE_BASE` — 24 common traded products (3-4 per category)
 *   3. `DUTY_RULES` — US / UK / EU duty, VAT, MPF, HMF calculus rules
 *   4. `findHsEntries(query)` — keyword fuzzy-match helper (≤3 hits)
 *
 * All data is research-typical MFN / Column 1 / Third-Country duty.
 * The LLM still makes the final classification; this module is grounding only.
 *
 * No network calls. Plain `as const`-friendly data. TS 5 strict-safe.
 */

/* ------------------------------------------------------------------ *
 * 1. Types
 * ------------------------------------------------------------------ */

/**
 * Per-region HS code data for a single product.
 * `dutyRate` is the general / MFN ad valorem rate as a decimal
 * (0.165 = 16.5%). For `dutyType === 'specific'`, `dutyRate` represents
 * the per-unit charge (e.g. $/L); see `specialNotes` for unit.
 */
export interface RegionalHsCode {
  /** Full tariff code, country-specific digits (US 8-10, UK 10, EU CN8). */
  code: string;
  /** Official tariff / schedule description. */
  description: string;
  /** General / MFN ad valorem duty rate as decimal (0.165 = 16.5%). */
  dutyRate: number;
  /** "ad valorem" | "specific" | "free" */
  dutyType: string;
  /** Optional clarifications (ITA applicability, specific unit, quotas, etc.) */
  specialNotes?: string;
}

/**
 * A single product entry in the HS knowledge base.
 * Each entry carries parallel classification data for US / UK / EU.
 */
export interface HsCodeEntry {
  /** Short kebab-case slug, e.g. "cotton-tshirt". */
  id: string;
  /** Display category, e.g. "Apparel & Textiles". */
  category: string;
  /** Lowercase keywords used by `findHsEntries` for fuzzy matching. */
  productKeywords: string[];
  /** Human-readable product description. */
  productDescription: string;
  /** Typical material / construction, e.g. "Cotton knit". */
  typicalMaterial: string;
  /** US HTS 10-digit code + general (Column 1) duty. */
  us: RegionalHsCode;
  /** UK Global Tariff 10-digit commodity code + Third Country duty + UK VAT. */
  uk: RegionalHsCode & { vatRate: number };
  /** EU TARIC CN8 code + MFN duty + standard VAT + member-state VAT list. */
  eu: RegionalHsCode & {
    vatRate: number;
    memberStateVat?: { country: string; rate: number }[];
  };
  /** Australia (ABF) 8-digit tariff code + General duty + GST 10%. Optional — when
   *  absent the agent infers the AU classification from the 6-digit HS base + 0% General. */
  au?: RegionalHsCode & { gstRate: number };
}

/**
 * Duty / tax calculus rule for a single region. Drives the
 * landed-cost engine in Task 3 (`/api/lcie/calculate`).
 */
export interface DutyRule {
  /** Region display name, e.g. "United States". */
  label: string;
  /** Emoji flag for UI. */
  flag: string;
  /** Currency code. */
  currency: string;
  /** US Merchandise Processing Fee rate (0.3464%). */
  mpfRate?: number;
  /** MPF minimum in USD. */
  mpfMin?: number;
  /** MPF maximum in USD. */
  mpfMax?: number;
  /** US Harbor Maintenance Fee rate (0.125%, ocean only). */
  hmfRate?: number;
  /** Federal/national VAT rate (0 for US). For AU this is GST (10%). */
  vatRate?: number;
  /** Human-friendly VAT/GST label. */
  vatLabel?: string;
  /** Australia Import Processing Charge — flat fee for consignments ≥ AUD 10,000. */
  ipcFlat?: number;
  /** Australia IPC for consignments under AUD 10,000 but over AUD 1,000. */
  ipcFlatLow?: number;
  /** Duty assessment base: US uses FOB, UK/EU/AU use CIF. */
  dutyCalcBase: 'FOB' | 'CIF';
  /** VAT assessment base: UK/EU/AU use CIF+duty; US has no federal VAT. */
  vatCalcBase: 'CIF_plus_duty' | 'FOB' | 'n/a';
  /** Brief explanatory note for the UI / LLM prompt. */
  notes: string;
}

/* ------------------------------------------------------------------ *
 * 2. HS Knowledge Base — 24 common traded products
 * ------------------------------------------------------------------ */

/**
 * Reference catalogue of 24 commonly-traded products spanning
 * Apparel & Textiles, Electronics & Technology, Food & Beverages,
 * Machinery & Tools, Home & Consumer Goods, and Health & Beauty.
 *
 * Codes follow real HS 6-digit international foundations extended to
 * country-specific digits (US 10-digit HTS, UK 10-digit Global Tariff,
 * EU 8-digit CN). Duty rates are MFN / Column 1 / Third-Country
 * ad valorem rates (decimals, e.g. 0.165 = 16.5%).
 */
export const HS_KNOWLEDGE_BASE: HsCodeEntry[] = [
  /* ---------- Apparel & Textiles ---------- */
  {
    id: 'cotton-tshirt',
    category: 'Apparel & Textiles',
    productKeywords: ['cotton', 't-shirt', 'tee', 'apparel', 'shirt', 'knitwear', 'vest'],
    productDescription: 'Knit cotton T-shirt / singlet / vest for casual wear',
    typicalMaterial: 'Cotton knit (single jersey)',
    us: {
      code: '6109.10.00.20',
      description:
        'T-shirts, singlets and other vests, knitted, of cotton, women\'s or girls\'',
      dutyRate: 0.165,
      dutyType: 'ad valorem',
      specialNotes: 'Standard Column 1 rate for cotton T-shirts. Subject to additional Section 301 duties on China-origin goods.',
    },
    uk: {
      code: '6109.10.00.00',
      description: 'T-shirts and vests, of cotton, knitted',
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '6109 10 00',
      description: 'T-shirts, singlets and other vests, knitted, of cotton',
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'leather-handbag',
    category: 'Apparel & Textiles',
    productKeywords: ['leather', 'handbag', 'purse', 'bag', 'accessory', 'calfskin', 'bovine'],
    productDescription: 'Handbag with outer surface of leather (bovine/calfskin)',
    typicalMaterial: 'Bovine leather',
    us: {
      code: '4202.21.60.00',
      description:
        'Trunks, suitcases, holsters... handbags, with outer surface of leather, of composition leather',
      dutyRate: 0.08,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 8%. Reptile-leather subheadings may differ.',
    },
    uk: {
      code: '4202.21.80.00',
      description: 'Handbags, with outer surface of leather (other than reptile)',
      dutyRate: 0.04,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '4202 21 00',
      description: 'Trunks, suitcases... handbags, with outer surface of leather',
      dutyRate: 0.04,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'denim-jeans',
    category: 'Apparel & Textiles',
    productKeywords: ['jeans', 'denim', 'trouser', 'pants', 'cotton', 'apparel', 'blue-jean'],
    productDescription: "Men's or boys' cotton denim trousers (jeans)",
    typicalMaterial: 'Cotton woven denim (blue)',
    us: {
      code: '6203.42.80.00',
      description:
        "Trousers, bib and brace overalls, breeches and shorts, men's or boys', of cotton, blue denim",
      dutyRate: 0.166,
      dutyType: 'ad valorem',
      specialNotes: 'Standard Column 1 rate 16.6%. PLI-1205 may reduce for certain woven cotton apparel.',
    },
    uk: {
      code: '6203.42.80.00',
      description: "Trousers, bib and brace overalls... men's or boys', of cotton, blue denim",
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '6203 42 90',
      description: "Men's or boys' trousers and breeches, of cotton, blue denim",
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'polyester-jacket',
    category: 'Apparel & Textiles',
    productKeywords: ['polyester', 'jacket', 'anorak', 'windbreaker', 'outerwear', 'man-made-fiber', 'apparel'],
    productDescription: "Men's anorak / windbreaker of man-made fibre (polyester)",
    typicalMaterial: 'Polyester woven, padded',
    us: {
      code: '6201.40.20.00',
      description:
        "Men's or boys' anoraks (including ski-jackets), windcheaters, of man-made fibres",
      dutyRate: 0.159,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 15.9%. Padded jackets of man-made fibre may also classify under 6201.40.10.',
    },
    uk: {
      code: '6201.40.80.00',
      description: "Men's or boys' anoraks, windcheaters, of man-made fibres (other)",
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '6201 40 90',
      description: "Men's or boys' anoraks, of man-made fibres, other",
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },

  /* ---------- Electronics & Technology ---------- */
  {
    id: 'smartphone',
    category: 'Electronics & Technology',
    productKeywords: ['smartphone', 'phone', 'mobile', 'iphone', 'android', 'cellular', 'device'],
    productDescription: 'Smartphone — cellular handset with touch screen',
    typicalMaterial: 'Electronics — multi-component assembly',
    us: {
      code: '8517.13.00.00',
      description: 'Smartphones',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    uk: {
      code: '8517.13.00.00',
      description: 'Smartphones',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    eu: {
      code: '8517 13 00',
      description: 'Smartphones',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
  },
  {
    id: 'laptop',
    category: 'Electronics & Technology',
    productKeywords: ['laptop', 'notebook', 'computer', 'macbook', 'pc', 'portable', 'adp'],
    productDescription: 'Portable laptop computer (≤10 kg) for general use',
    typicalMaterial: 'Electronics — multi-component assembly',
    us: {
      code: '8471.30.01.00',
      description: 'Portable digital ADP machines, weighing not more than 10 kg',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    uk: {
      code: '8471.30.00.00',
      description: 'Portable digital ADP machines, weighing ≤10 kg',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    eu: {
      code: '8471 30 00',
      description: 'Portable digital ADP machines, weighing ≤10 kg',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
  },
  {
    id: 'bluetooth-headphones',
    category: 'Electronics & Technology',
    productKeywords: ['bluetooth', 'headphone', 'earphone', 'earbud', 'wireless', 'audio', 'airpod'],
    productDescription: 'Wireless / Bluetooth headphones or earphones',
    typicalMaterial: 'Electronics — plastics + drivers',
    us: {
      code: '8518.30.20.00',
      description: 'Headphones, earphones... whether or not combined with microphone',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    uk: {
      code: '8518.30.20.00',
      description: 'Headphones and earphones, whether or not combined with a microphone',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    eu: {
      code: '8518 30 20',
      description: 'Headphones and earphones, whether or not combined with a microphone',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
  },
  {
    id: 'usb-cable',
    category: 'Electronics & Technology',
    productKeywords: ['usb', 'cable', 'charger', 'cord', 'wire', 'connector', 'lightning'],
    productDescription: 'Insulated electric conductor with connectors (USB / data cable)',
    typicalMaterial: 'Copper conductor + PVC insulation',
    us: {
      code: '8544.42.20.00',
      description: 'Insulated electric conductors, with connectors, ≤1000 V',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA) for ITA-covered connectors.',
    },
    uk: {
      code: '8544.42.20.00',
      description: 'Insulated electric conductors, fitted with connectors, ≤1000 V',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
    eu: {
      code: '8544 42 20',
      description: 'Insulated electric conductors, fitted with connectors, ≤1000 V',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'Duty-free under WTO Information Technology Agreement (ITA).',
    },
  },

  /* ---------- Food & Beverages ---------- */
  {
    id: 'roasted-coffee-beans',
    category: 'Food & Beverages',
    productKeywords: ['coffee', 'bean', 'roast', 'arabica', 'robusta', 'grind', 'beverage'],
    productDescription: 'Roasted coffee beans (whole or ground, caffeinated)',
    typicalMaterial: 'Roasted coffee',
    us: {
      code: '0901.21.00.00',
      description: 'Coffee, roasted, not decaffeinated',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for all roasted coffee origins.',
    },
    uk: {
      code: '0901.21.00.00',
      description: 'Coffee, roasted, not decaffeinated',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0,
      specialNotes: 'Duty-free Third Country rate. UK zero-rated VAT for food (coffee).',
    },
    eu: {
      code: '0901 21 00',
      description: 'Coffee, roasted, not decaffeinated',
      dutyRate: 0.075,
      dutyType: 'ad valorem',
      vatRate: 0.07,
      memberStateVat: [
        { country: 'Germany', rate: 0.07 },
        { country: 'France', rate: 0.055 },
        { country: 'Netherlands', rate: 0.09 },
        { country: 'Italy', rate: 0.04 },
        { country: 'Spain', rate: 0.1 },
      ],
      specialNotes: 'EU MFN 7.5% ad valorem. Member-state VAT on food typically reduced.',
    },
  },
  {
    id: 'chocolate-bars',
    category: 'Food & Beverages',
    productKeywords: ['chocolate', 'bar', 'candy', 'cocoa', 'confectionery', 'snack'],
    productDescription: 'Chocolate bars / slabs, not filled',
    typicalMaterial: 'Cocoa mass + sugar',
    us: {
      code: '1806.32.20.00',
      description: 'Chocolate, in blocks, slabs or bars, not filled, >2 kg',
      dutyRate: 0.045,
      dutyType: 'ad valorem',
      specialNotes: 'General Column 1 rate 4.5%. Milk-chocolate subheadings may differ.',
    },
    uk: {
      code: '1806.32.20.00',
      description: 'Chocolate, in blocks, slabs or bars, not filled, >2 kg',
      dutyRate: 0.08,
      dutyType: 'ad valorem',
      vatRate: 0.2,
      specialNotes: 'UK treats chocolate confectionery as standard-rated (20% VAT).',
    },
    eu: {
      code: '1806 32 20',
      description: 'Chocolate, in blocks, slab or bars, not filled, >2 kg',
      dutyRate: 0.08,
      dutyType: 'ad valorem',
      vatRate: 0.07,
      memberStateVat: [
        { country: 'Germany', rate: 0.07 },
        { country: 'France', rate: 0.055 },
        { country: 'Netherlands', rate: 0.09 },
        { country: 'Italy', rate: 0.1 },
        { country: 'Spain', rate: 0.1 },
      ],
      specialNotes: 'EU MFN 8%. Some member states tax confectionery at standard rate.',
    },
  },
  {
    id: 'olive-oil',
    category: 'Food & Beverages',
    productKeywords: ['olive', 'oil', 'extra-virgin', 'virgin', 'cooking', 'edible', 'mediterranean'],
    productDescription: 'Olive oil (extra-virgin or refined) for culinary use',
    typicalMaterial: 'Pressed olive oil',
    us: {
      code: '1509.90.00.00',
      description: 'Olive oil and fractions obtained from olives, other than virgin',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1). Virgin olive oil 1509.10.00.00 also free.',
    },
    uk: {
      code: '1509.90.10.00',
      description: 'Olive oil and fractions obtained from olives, other than virgin',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0,
      specialNotes: 'Duty-free Third Country rate. UK zero-rated VAT for food.',
    },
    eu: {
      code: '1509 90 10',
      description: 'Olive oil and fractions obtained from olives, other than virgin',
      dutyRate: 0.125,
      dutyType: 'ad valorem',
      vatRate: 0.07,
      memberStateVat: [
        { country: 'Germany', rate: 0.07 },
        { country: 'France', rate: 0.055 },
        { country: 'Netherlands', rate: 0.09 },
        { country: 'Italy', rate: 0.04 },
        { country: 'Spain', rate: 0.04 },
      ],
      specialNotes: 'EU MFN 12.5% ad valorem on non-virgin olive oil. Subject to specific safeguard quotas.',
    },
  },
  {
    id: 'wine',
    category: 'Food & Beverages',
    productKeywords: ['wine', 'red', 'white', 'sparkling', 'alcohol', 'grape', 'vintage', 'bottle'],
    productDescription: 'Still grape wine in containers ≤2 L',
    typicalMaterial: 'Fermented grape must',
    us: {
      code: '2204.21.00.00',
      description: 'Wine of fresh grapes, in containers holding 2 L or less',
      dutyRate: 0.2625,
      dutyType: 'specific',
      specialNotes: 'US specific duty: $0.2625 per liter on still grape wine in containers ≤2 L (under 16% alcohol). Sparkling wine (2204.10) rates differ.',
    },
    uk: {
      code: '2204.21.80.00',
      description: 'Wine of fresh grapes, in containers holding 2 L or less, of sparkling wine excluded',
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.2,
      specialNotes: 'UK Third Country duty 12%. Plus UK alcohol duty £297.28 per hectolitre of pure alcohol on still wine. Standard 20% VAT.',
    },
    eu: {
      code: '2204 21 00',
      description: 'Wine of fresh grapes, in containers holding 2 L or less',
      dutyRate: 0.08,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'EU MFN base rate 8% ad valorem + additional specific duty €0.08-0.27/L depending on wine classification. Member-state excise applies on alcohol.',
    },
  },

  /* ---------- Machinery & Tools ---------- */
  {
    id: 'electric-drill',
    category: 'Machinery & Tools',
    productKeywords: ['electric', 'drill', 'power-tool', 'cordless', 'rotary', 'machinery', 'tool'],
    productDescription: 'Portable electric hand drill (corded or cordless)',
    typicalMaterial: 'Electric motor + plastic/metal housing',
    us: {
      code: '8467.21.00.20',
      description: 'Tools for working in the hand, with self-contained electric motor, rotary drills',
      dutyRate: 0.014,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 1.4%. Some cordless tools classifiable under 8467.21.10.',
    },
    uk: {
      code: '8467.21.10.00',
      description: 'Tools for working in the hand, with self-contained electric motor, drills',
      dutyRate: 0.027,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '8467 21 00',
      description: 'Tools for working in the hand, with self-contained electric motor, rotary drills',
      dutyRate: 0.022,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'kitchen-knife',
    category: 'Machinery & Tools',
    productKeywords: ['knife', 'kitchen', 'blade', 'stainless-steel', 'cutlery', 'chef', 'carving'],
    productDescription: 'Stainless-steel fixed-blade kitchen knife with metal handle',
    typicalMaterial: 'Stainless steel blade + handle',
    us: {
      code: '8211.91.30.00',
      description: 'Knives having fixed blades, with metal handles, kitchen or table-type',
      dutyRate: 0.009,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 0.9%. Plastic-handled knives classifiable under 8211.92.',
    },
    uk: {
      code: '8211.91.91.00',
      description: 'Knives having fixed blades, with metal handles, other than hunting knives',
      dutyRate: 0.085,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '8211 91 91',
      description: 'Knives having fixed blades, with metal handles, kitchen or table-type',
      dutyRate: 0.085,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'hand-saw',
    category: 'Machinery & Tools',
    productKeywords: ['hand-saw', 'saw', 'blade', 'wood', 'carpentry', 'tool', 'pruning'],
    productDescription: 'Steel hand saw (for wood, tree-pruning, etc.)',
    typicalMaterial: 'Steel blade + wood/plastic handle',
    us: {
      code: '8202.10.10.00',
      description: 'Handsaws, including tree-pruning saws',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for hand saws.',
    },
    uk: {
      code: '8202.10.00.00',
      description: 'Handsaws, including tree-pruning saws',
      dutyRate: 0.027,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '8202 10 00',
      description: 'Handsaws, including tree-pruning saws',
      dutyRate: 0.027,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'led-bulb',
    category: 'Machinery & Tools',
    productKeywords: ['led', 'bulb', 'lamp', 'light', 'lighting', 'diode', 'illumination'],
    productDescription: 'LED lamp / bulb for general illumination',
    typicalMaterial: 'LED package + heat sink + driver',
    us: {
      code: '8539.52.00.00',
      description: 'Light-emitting diode (LED) lamps and modules',
      dutyRate: 0.039,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 3.9%. Subject to Section 301 duties on China-origin LED modules.',
    },
    uk: {
      code: '8539.52.00.00',
      description: 'Light-emitting diode (LED) lamps and modules',
      dutyRate: 0.04,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '8539 52 00',
      description: 'Light-emitting diode (LED) lamps and modules',
      dutyRate: 0.04,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },

  /* ---------- Home & Consumer Goods ---------- */
  {
    id: 'ceramic-plates',
    category: 'Home & Consumer Goods',
    productKeywords: ['ceramic', 'plate', 'porcelain', 'tableware', 'dish', 'dinnerware', 'china'],
    productDescription: 'Porcelain / ceramic tableware plates for dining',
    typicalMaterial: 'Porcelain / vitreous china',
    us: {
      code: '6911.10.45.00',
      description: 'Table and kitchen articles of porcelain, other than ornamental',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Column 1 free for porcelain tableware. Subject to additional Section 301 duties on China-origin goods.',
    },
    uk: {
      code: '6911.10.40.00',
      description: 'Table and kitchen articles of porcelain',
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '6911 10 90',
      description: 'Table and kitchen articles of porcelain, other',
      dutyRate: 0.12,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'drinking-glasses',
    category: 'Home & Consumer Goods',
    productKeywords: ['glass', 'drinking', 'tumbler', 'goblet', 'stemware', 'crystal', 'beverage'],
    productDescription: 'Glass drinking glasses / tumblers (non-crystal)',
    typicalMaterial: 'Soda-lime glass',
    us: {
      code: '7013.49.50.00',
      description: 'Drinking glasses, other than of glass-ceramics',
      dutyRate: 0.065,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 6.5%. Lead-crystal stemware classifiable under 7013.31.',
    },
    uk: {
      code: '7013.49.50.00',
      description: 'Drinking glasses, other than of glass-ceramics',
      dutyRate: 0.065,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '7013 49 50',
      description: 'Drinking glasses, other than of glass-ceramics',
      dutyRate: 0.065,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'wooden-furniture',
    category: 'Home & Consumer Goods',
    productKeywords: ['wooden', 'furniture', 'wood', 'table', 'chair', 'bed', 'cabinet', 'oak'],
    productDescription: 'Wooden household furniture (e.g. bedroom, dining)',
    typicalMaterial: 'Solid wood / wood veneer',
    us: {
      code: '9403.50.40.00',
      description: 'Wooden furniture of a kind used in the bedroom',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for most wooden furniture. Subject to antidumping duties on wooden bedroom furniture from China (Case A-570-815).',
    },
    uk: {
      code: '9403.50.40.00',
      description: 'Wooden furniture of a kind used in the bedroom',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free Third Country rate for most wooden furniture.',
    },
    eu: {
      code: '9403 50 00',
      description: 'Wooden furniture of a kind used in the bedroom',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'plastic-storage-boxes',
    category: 'Home & Consumer Goods',
    productKeywords: ['plastic', 'storage', 'box', 'container', 'bin', 'tote', 'household'],
    productDescription: 'Plastic household storage boxes / containers',
    typicalMaterial: 'Polypropylene / polyethylene',
    us: {
      code: '3924.10.20.00',
      description: 'Tableware and kitchenware of plastics, household articles',
      dutyRate: 0.034,
      dutyType: 'ad valorem',
      specialNotes: 'General rate 3.4% for plastic household articles.',
    },
    uk: {
      code: '3924.10.10.00',
      description: 'Tableware and kitchenware of plastics, household articles',
      dutyRate: 0.063,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '3924 10 10',
      description: 'Tableware and kitchenware of plastics, household articles',
      dutyRate: 0.063,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },

  /* ---------- Health & Beauty ---------- */
  {
    id: 'perfume',
    category: 'Health & Beauty',
    productKeywords: ['perfume', 'fragrance', 'cologne', 'eau-de-parfum', 'scent', 'beauty', 'cosmetic'],
    productDescription: 'Perfume containing >0.5% scent by weight (EDP / EDT)',
    typicalMaterial: 'Alcohol + fragrance oils',
    us: {
      code: '3303.00.20.00',
      description: 'Perfumes and toilet waters containing 0.5% or more of scent',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for perfumes.',
    },
    uk: {
      code: '3303.00.20.00',
      description: 'Perfumes and toilet waters containing 0.5% or more of scent',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free Third Country rate. Standard 20% VAT.',
    },
    eu: {
      code: '3303 00 20',
      description: 'Perfumes and toilet waters containing 0.5% or more of scent',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
      specialNotes: 'EU MFN duty-free for perfumes.',
    },
  },
  {
    id: 'hand-soap',
    category: 'Health & Beauty',
    productKeywords: ['soap', 'hand-soap', 'toilet-soap', 'bar', 'cleanser', 'beauty', 'hygiene'],
    productDescription: 'Toilet / hand soap in bars or cakes',
    typicalMaterial: 'Sodium soap of fatty acids',
    us: {
      code: '3401.11.50.00',
      description: 'Soap for toilet use, in bars, cakes, molded pieces or shapes',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for toilet soap.',
    },
    uk: {
      code: '3401.11.00.00',
      description: 'Soap for toilet use, in bars, cakes, molded pieces or shapes',
      dutyRate: 0.017,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '3401 11 00',
      description: 'Soap for toilet use, in bars, cakes, molded pieces or shapes',
      dutyRate: 0.017,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },
  {
    id: 'vitamins-supplements',
    category: 'Health & Beauty',
    productKeywords: ['vitamin', 'supplement', 'capsule', 'tablet', 'multivitamin', 'nutraceutical', 'health'],
    productDescription: 'Vitamins / dietary supplements packaged for retail sale',
    typicalMaterial: 'Vitamin concentrates + excipients',
    us: {
      code: '3004.50.00.00',
      description: 'Vitamins A, B1, B2, B3, B5, B6, B12, C, E, and other vitamins, packaged for retail sale',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for packaged vitamins. Some food supplements classifiable under 2106.99.',
    },
    uk: {
      code: '3004.50.00.00',
      description: 'Vitamins, packaged for retail sale',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
      specialNotes: 'Duty-free Third Country rate. UK treats food supplements as standard-rated (20% VAT).',
    },
    eu: {
      code: '3004 50 00',
      description: 'Vitamins, packaged for retail sale',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.07,
      memberStateVat: [
        { country: 'Germany', rate: 0.07 },
        { country: 'France', rate: 0.1 },
        { country: 'Netherlands', rate: 0.09 },
        { country: 'Italy', rate: 0.1 },
        { country: 'Spain', rate: 0.1 },
      ],
      specialNotes: 'EU MFN duty-free for packaged vitamins. Reduced member-state VAT applies for food supplements in some states.',
    },
  },
  {
    id: 'toothpaste',
    category: 'Health & Beauty',
    productKeywords: ['toothpaste', 'dentifrice', 'oral', 'hygiene', 'fluoride', 'dental', 'paste'],
    productDescription: 'Toothpaste / dentifrice in tubes for retail sale',
    typicalMaterial: 'Abrasives + humectants + fluoride',
    us: {
      code: '3306.10.00.00',
      description: 'Dentifrices, including toothpaste and toothpowder',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Duty-free (Column 1) for dentifrices.',
    },
    uk: {
      code: '3306.10.00.00',
      description: 'Dentifrices, including toothpaste and toothpowder',
      dutyRate: 0.045,
      dutyType: 'ad valorem',
      vatRate: 0.2,
    },
    eu: {
      code: '3306 10 00',
      description: 'Dentifrices, including toothpaste and toothpowder',
      dutyRate: 0.045,
      dutyType: 'ad valorem',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
  },

  /* ---------- Water Filtration (HS 8421.21 — duty-free) ---------- */
  {
    id: 'water-filter-cartridge',
    category: 'Water Filtration',
    productKeywords: [
      'water', 'filter', 'cartridge', 'sediment', 'carbon', 'carbon block',
      'big blue', 'tier1', 'uswf', 'us water', 'prefilter', 'postfilter',
      'p5', 'p1', 'p20', 'p25', 'p50', 'p10', 'ep5', 'ep10', 'epm',
      'dgd1', 'dgd', 'gradient', 'pleated', 'string wound', '20bb', '10bb',
      '20', '10', 'ro membrane', 'reverse osmosis', 'membrane',
    ],
    productDescription: 'Replaceable water filter cartridge — sediment, carbon block, dual-gradient, or RO membrane',
    typicalMaterial: 'Spun polypropylene / activated carbon block / PES membrane',
    us: {
      code: '8421.21.00.00',
      description: 'Filtering or purifying machinery and apparatus, for liquids, for filtering water (cartridge filter)',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Water filter cartridges are classified under 8421.21.00.00 (HTSUS). MFN/Column 1 rate is FREE. China-origin goods may be subject to Section 301 List 3 duty (25%) and IEEPA reciprocal tariff.',
    },
    uk: {
      code: '8421.21.00.00',
      description: 'Machinery and apparatus for filtering or purifying water',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
    },
    eu: {
      code: '8421 21 00',
      description: 'Filtering or purifying machinery and apparatus for water',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
    au: {
      code: '8421.21.00.90',
      description: 'Filtering or purifying machinery and apparatus for water (cartridge filter)',
      dutyRate: 0,
      dutyType: 'free',
      gstRate: 0.10,
      specialNotes: 'Australia General rate FREE. GST 10% on (customs value + duty). Import Processing Charge AUD 50 flat (≥ AUD 10,000).',
    },
  },
  {
    id: 'water-filter-housing-system',
    category: 'Water Filtration',
    productKeywords: [
      'housing', 'kit', 'tank', 'bracket', 'system', 'installation',
      'wh-prefilter', 'uswf-bt', 'uswf-ud', 'uswf-tk', 'under counter',
      'under sink', 'point of use', 'point of entry', 'whole house',
      'filter housing', 'filter kit', 'bracket', 'bw', 'rtb',
      'reverse osmosis system', 'ro system', 'ro tank', 'storage tank',
    ],
    productDescription: 'Water filter housing, bracket, tank, or complete filtration system / kit',
    typicalMaterial: 'Polypropylene housing / stainless steel bracket / FRP tank',
    us: {
      code: '8421.21.00.00',
      description: 'Filtering or purifying machinery and apparatus, for liquids, for filtering water (housing/system)',
      dutyRate: 0,
      dutyType: 'free',
      specialNotes: 'Water filter housings, tanks, brackets, and complete filtration systems are classified under 8421.21.00.00. MFN/Column 1 rate is FREE. Individual bare metal brackets may also be classified as parts under 8421.99.00.90 (also FREE).',
    },
    uk: {
      code: '8421.21.00.00',
      description: 'Machinery and apparatus for filtering or purifying water (housing/system)',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.2,
    },
    eu: {
      code: '8421 21 00',
      description: 'Filtering or purifying machinery and apparatus for water (housing/system)',
      dutyRate: 0,
      dutyType: 'free',
      vatRate: 0.19,
      memberStateVat: [
        { country: 'Germany', rate: 0.19 },
        { country: 'France', rate: 0.2 },
        { country: 'Netherlands', rate: 0.21 },
        { country: 'Italy', rate: 0.22 },
        { country: 'Spain', rate: 0.21 },
      ],
    },
    au: {
      code: '8421.21.00.90',
      description: 'Filtering or purifying machinery and apparatus for water (housing/system)',
      dutyRate: 0,
      dutyType: 'free',
      gstRate: 0.10,
      specialNotes: 'Australia General rate FREE. GST 10% on (customs value + duty). Import Processing Charge AUD 50 flat (≥ AUD 10,000).',
    },
  },
];

/* ------------------------------------------------------------------ *
 * 3. Duty / Tax Rules — per-region landed-cost calculus
 * ------------------------------------------------------------------ */

/**
 * Per-region landed-cost rules (US / UK / EU). Drives both the
 * calculation engine and the LLM system prompt so the model knows
 * which base, VAT and fees apply in each jurisdiction.
 */
export const DUTY_RULES: Record<'US' | 'UK' | 'EU' | 'AU', DutyRule> = {
  US: {
    label: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    mpfRate: 0.003464,
    mpfMin: 31.67,
    mpfMax: 614.35,
    hmfRate: 0.00125,
    vatRate: 0,
    vatLabel: 'Sales Tax (state-level, out of scope)',
    dutyCalcBase: 'FOB',
    vatCalcBase: 'n/a',
    notes:
      'US duty assessed on FOB value (Column 1 / MFN rate from HTS). ' +
      'Merchandise Processing Fee (MPF) = 0.3464% of FOB, floored at $31.67 and capped at $614.35 (formal entries). ' +
      'Harbor Maintenance Fee (HMF) = 0.125% of value applies only to ocean-borne shipments. ' +
      'No federal VAT; state/county sales tax is out of scope for the LCIE landed-cost calculation.',
  },
  UK: {
    label: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    vatRate: 0.2,
    vatLabel: 'VAT (standard 20%)',
    dutyCalcBase: 'CIF',
    vatCalcBase: 'CIF_plus_duty',
    notes:
      'UK Global Tariff applies Third Country (MFN) duty on CIF value (customs value = transaction value + freight + insurance + handling to UK border). ' +
      'Standard VAT 20% levied on (CIF + duty + any excise). Reduced rates apply to some goods (e.g. children\'s car seats 5%, domestic fuel 5%). ' +
      'No MPF / HMF equivalents. Excise duties apply separately to alcohol, tobacco, hydrocarbon oils.',
  },
  EU: {
    label: 'European Union',
    flag: '🇪🇺',
    currency: 'EUR',
    vatRate: 0.19,
    vatLabel: 'VAT (DE 19% default; varies by member state)',
    dutyCalcBase: 'CIF',
    vatCalcBase: 'CIF_plus_duty',
    notes:
      'EU TARIC applies MFN duty on CIF customs value (transaction value + freight + insurance to EU border) using the 8-digit CN code. ' +
      'VAT is levied by each member state on (CIF + duty + excise) at the national rate — Germany 19% (default), France 20%, Netherlands 21%, Italy 22%, Spain 21%. ' +
      'Reduced rates apply to food, books, medicines, etc. in most states. ' +
      'No MPF / HMF equivalents. Excise duties apply separately to alcohol, tobacco, energy products.',
  },
  AU: {
    label: 'Australia',
    flag: '🇦🇺',
    currency: 'AUD',
    vatRate: 0.10,
    vatLabel: 'GST (10%)',
    ipcFlat: 50,        // Import Processing Charge — flat AUD 50 for consignments ≥ AUD 10,000
    ipcFlatLow: 40,     // AUD 40 for consignments < AUD 10,000 but > AUD 1,000 (SAC = no charge under AUD 1,000)
    dutyCalcBase: 'CIF',
    vatCalcBase: 'CIF_plus_duty',
    notes:
      'Australia (ABF) applies the General / MFN customs duty on the customs value (transaction value + freight + insurance + other = CIF) using the 8-digit Australian Tariff code. ' +
      'Most consumer goods — incl. water filters (8421.21.00.90), electronics, food — carry a FREE (0%) General rate. ' +
      'Goods & Services Tax (GST) 10% is levied on (customs value + customs duty + other taxable charges) — equivalent to VAT on (CIF + duty). ' +
      'Import Processing Charge (IPC) is a FLAT AUD 50 for formal entries (consignments ≥ AUD 10,000), AUD 40 for consignments between AUD 1,000 and AUD 10,000; low-value (under AUD 1,000) via SAC attracts no charge. ' +
      'No MPF / HMF / Section 301 / IEEPA equivalents. Wine (WET 29%), luxury car tax (LCT), and excise on alcohol/tobacco/fuel apply separately to specific goods.',
  },
};

/* ------------------------------------------------------------------ *
 * 4. Helper — keyword fuzzy-match (≤3 hits) for LLM grounding
 * ------------------------------------------------------------------ */

/**
 * Keyword fuzzy-match lookup used to ground the LLM HS-code
 * classification step. Returns up to 3 `HsCodeEntry` records whose
 * `productKeywords` match the free-text query (case-insensitive
 * substring either direction: query→keyword or keyword→query).
 *
 * The LLM still makes the final classification decision; this helper
 * only surfaces plausible candidate entries from the static KB.
 *
 * @param query free-text line-item description from the PO
 * @returns up to 3 matching `HsCodeEntry` records (empty array if none)
 */
export function findHsEntries(query: string): HsCodeEntry[] {
  const q = (query ?? '').trim().toLowerCase();
  if (!q) return [];

  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const matches = HS_KNOWLEDGE_BASE.filter((entry) => {
    const keywords = entry.productKeywords.map((k) => k.toLowerCase());
    return tokens.some((token) =>
      keywords.some((kw) => kw.includes(token) || token.includes(kw)),
    );
  });

  return matches.slice(0, 3);
}
