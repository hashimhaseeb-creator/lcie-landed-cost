/**
 * Sample Purchase Orders for the LCIE demo
 * Green G(P)4 Supply Chain Framework
 *
 * Each sample is a realistic multi-line PO covering mixed categories
 * (apparel, electronics, food, machinery) so the AI agent's
 * US/UK/EU determination has something interesting to classify.
 */

export interface SamplePo {
  id: string;
  title: string;
  blurb: string;
  poNumber: string;
  supplier: string;
  originCountry: string;
  destinationCountry: string;
  currency: string;
  incoterm: string;
  freight: number;
  insurance: number;
  otherCharges: number;
  lineItems: Array<{
    lineNumber: number;
    sku: string;
    description: string;
    material?: string;
    quantity: number;
    unit: string;
    unitValue: number;
    originCountry?: string;
  }>;
}

export const SAMPLE_POS: SamplePo[] = [
  {
    id: 'mixed-retail',
    title: 'Mixed Retail Consignment (Apparel + Electronics)',
    blurb: '24-line department-store PO: cotton apparel, leather goods, smartphones, accessories — full US/UK/EU duty contrast.',
    poNumber: 'PO-GP4-2025-0417',
    supplier: 'Shenzhen GreenLeaf Trading Co., Ltd.',
    originCountry: 'CN',
    destinationCountry: 'US',
    currency: 'USD',
    incoterm: 'FOB',
    freight: 2850,
    insurance: 425,
    otherCharges: 180,
    lineItems: [
      { lineNumber: 1, sku: 'TS-COT-001', description: 'Cotton knit T-shirt, mens, 220gsm, heather grey', material: 'Cotton knit', quantity: 5000, unit: 'PCS', unitValue: 3.2, originCountry: 'CN' },
      { lineNumber: 2, sku: 'BG-LTH-220', description: 'Leather handbag, full-grain cowhide, 30x22x12cm', material: 'Cowhide leather', quantity: 800, unit: 'PCS', unitValue: 18.5, originCountry: 'CN' },
      { lineNumber: 3, sku: 'PH-SP-5G-A', description: '5G smartphone, 6.7 inch OLED, 128GB, dual SIM', material: 'Electronics', quantity: 1200, unit: 'PCS', unitValue: 142.0, originCountry: 'CN' },
      { lineNumber: 4, sku: 'JN-DEM-32', description: 'Denim jeans, mens, stretch 12oz, indigo wash', material: 'Cotton denim', quantity: 3000, unit: 'PCS', unitValue: 7.8, originCountry: 'CN' },
      { lineNumber: 5, sku: 'AC-USBC-2M', description: 'USB-C to USB-C braided cable, 2m, 60W PD', material: 'Electronics', quantity: 10000, unit: 'PCS', unitValue: 0.95, originCountry: 'CN' },
      { lineNumber: 6, sku: 'HD-BT-NC', description: 'Bluetooth over-ear headphones, active noise cancelling', material: 'Electronics', quantity: 1500, unit: 'PCS', unitValue: 24.0, originCountry: 'CN' },
    ],
  },
  {
    id: 'pantry-beauty',
    title: 'Pantry + Health & Beauty FCL',
    blurb: 'Specialty food and personal-care PO: coffee, chocolate, olive oil, perfume, soap — exercises reduced-VAT logic in UK/EU.',
    poNumber: 'PO-GP4-2025-0522',
    supplier: 'Istanbul Anatolian Exports A.S.',
    originCountry: 'TR',
    destinationCountry: 'GB',
    currency: 'USD',
    incoterm: 'CIF',
    freight: 1920,
    insurance: 280,
    otherCharges: 120,
    lineItems: [
      { lineNumber: 1, sku: 'CF-ARAB-1KG', description: 'Roasted Arabica coffee beans, 1kg foil valve bag', material: 'Coffee', quantity: 2000, unit: 'KG', unitValue: 6.4, originCountry: 'TR' },
      { lineNumber: 2, sku: 'CH-DARK-100', description: 'Dark chocolate bars, 70% cocoa, 100g', material: 'Chocolate', quantity: 8000, unit: 'PCS', unitValue: 1.15, originCountry: 'TR' },
      { lineNumber: 3, sku: 'OO-EV-750', description: 'Extra virgin olive oil, 750ml glass bottle', material: 'Olive oil', quantity: 4000, unit: 'PCS', unitValue: 4.2, originCountry: 'TR' },
      { lineNumber: 4, sku: 'PF-EDP-50', description: 'Eau de parfum, floral, 50ml atomiser', material: 'Perfume', quantity: 600, unit: 'PCS', unitValue: 11.0, originCountry: 'TR' },
      { lineNumber: 5, sku: 'SP-LAV-300', description: 'Lavender hand soap, 300ml pump bottle', material: 'Soap', quantity: 3000, unit: 'PCS', unitValue: 1.6, originCountry: 'TR' },
    ],
  },
  {
    id: 'tools-home',
    title: 'Tools + Home Goods LCL',
    blurb: 'Hardware and homeware PO: power drills, kitchen knives, ceramics, LED bulbs — covers MPF/HMF and specific-duty scenarios.',
    poNumber: 'PO-GP4-2025-0610',
    supplier: 'Ningbo Huaqiang Hardware Ltd.',
    originCountry: 'CN',
    destinationCountry: 'DE',
    currency: 'EUR',
    incoterm: 'CIF',
    freight: 1450,
    insurance: 210,
    otherCharges: 95,
    lineItems: [
      { lineNumber: 1, sku: 'DR-CORD-18', description: 'Cordless 18V drill driver, 2x2.0Ah Li-ion', material: 'Power tool', quantity: 1200, unit: 'PCS', unitValue: 26.0, originCountry: 'CN' },
      { lineNumber: 2, sku: 'KN-SS-8', description: 'Stainless steel kitchen knife, 8 inch chef, forged', material: 'Stainless steel', quantity: 2000, unit: 'PCS', unitValue: 4.5, originCountry: 'CN' },
      { lineNumber: 3, sku: 'PL-CER-27', description: 'Ceramic dinner plates, 27cm, stoneware, set of 4', material: 'Ceramic stoneware', quantity: 1500, unit: 'SET', unitValue: 8.2, originCountry: 'CN' },
      { lineNumber: 4, sku: 'BL-LED-9W', description: 'LED bulb, 9W, E27, 3000K warm white', material: 'LED', quantity: 20000, unit: 'PCS', unitValue: 0.48, originCountry: 'CN' },
      { lineNumber: 5, sku: 'GL-WINE-350', description: 'Crystal wine glasses, 350ml, stemware', material: 'Glass', quantity: 3000, unit: 'PCS', unitValue: 1.35, originCountry: 'CN' },
    ],
  },
  {
    id: 'au-water-filtration',
    title: 'AU Water Filtration (Australia dest)',
    blurb: 'Water-filter cartridges + housings consigned to Australia — exercises the ABF duty stack: FREE General rate, GST 10% on (CIF + duty), flat Import Processing Charge AUD 50.',
    poNumber: 'PO-GP4-2025-AU01',
    supplier: 'Hebei Chengda Water Technology Co., Ltd.',
    originCountry: 'CN',
    destinationCountry: 'AU',
    currency: 'USD',
    incoterm: 'CIF',
    freight: 3200,
    insurance: 480,
    otherCharges: 210,
    lineItems: [
      { lineNumber: 1, sku: 'USWF-TK-0835-RTB-BLK', description: 'USWF-TK-0835-RTB-BLK', material: 'Water filter cartridge', quantity: 200, unit: 'PCS', unitValue: 142.0, originCountry: 'CN' },
      { lineNumber: 2, sku: 'TIER1-P5-20BB', description: 'TIER1-P5-20BB', material: 'Sediment filter cartridge', quantity: 1500, unit: 'PCS', unitValue: 18.5, originCountry: 'CN' },
      { lineNumber: 3, sku: 'WH-PREFILTER-KIT-1', description: 'WH-PREFILTER-KIT-1', material: 'Water filter housing kit', quantity: 300, unit: 'PCS', unitValue: 64.0, originCountry: 'CN' },
      { lineNumber: 4, sku: 'USWF-BT-70L-BK', description: 'USWF-BT-70L-BK', material: 'Water filter tank', quantity: 120, unit: 'PCS', unitValue: 210.0, originCountry: 'CN' },
    ],
  },
];

export function getSamplePo(id: string): SamplePo | undefined {
  return SAMPLE_POS.find((s) => s.id === id);
}
