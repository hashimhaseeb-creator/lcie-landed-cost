/**
 * Destination resolver — maps a PO's destination country (ISO-2) to the
 * LCIE duty region (US / UK / EU), the destination currency, the standard
 * VAT rate, and display metadata. Drives the single-region duty stack and
 * the live FX conversion.
 *
 * Green G(P)⁴™ Global Operations — LCIE Landed Cost Engine
 */

import { DUTY_RULES, type Region } from '@/lib/hs-knowledge-base';

export interface DestinationInfo {
  countryCode: string;
  countryName: string;
  region: Region;            // 'US' | 'UK' | 'EU'
  currency: string;           // 'USD' | 'GBP' | 'EUR' | 'PLN' | 'SEK' | …
  vatRate: number;            // standard VAT for this country (0 for US)
  flag: string;
  label: string;              // "United States" | "United Kingdom" | "Germany" …
  destinationLevyNotes: string;
}

/** ISO-2 → { name, currency, vatRate, flag } for trade-relevant countries. */
const COUNTRY: Record<string, { name: string; currency: string; vatRate: number; flag: string }> = {
  // North America
  US: { name: 'United States', currency: 'USD', vatRate: 0, flag: '🇺🇸' },
  CA: { name: 'Canada', currency: 'CAD', vatRate: 0.05, flag: '🇨🇦' }, // GST federal; provinces vary
  MX: { name: 'Mexico', currency: 'MXN', vatRate: 0.16, flag: '🇲🇽' },
  // United Kingdom
  GB: { name: 'United Kingdom', currency: 'GBP', vatRate: 0.20, flag: '🇬🇧' },
  UK: { name: 'United Kingdom', currency: 'GBP', vatRate: 0.20, flag: '🇬🇧' },
  // Eurozone (EU — EUR)
  AT: { name: 'Austria', currency: 'EUR', vatRate: 0.20, flag: '🇦🇹' },
  BE: { name: 'Belgium', currency: 'EUR', vatRate: 0.21, flag: '🇧🇪' },
  HR: { name: 'Croatia', currency: 'EUR', vatRate: 0.25, flag: '🇭🇷' },
  CY: { name: 'Cyprus', currency: 'EUR', vatRate: 0.19, flag: '🇨🇾' },
  EE: { name: 'Estonia', currency: 'EUR', vatRate: 0.22, flag: '🇪🇪' },
  FI: { name: 'Finland', currency: 'EUR', vatRate: 0.255, flag: '🇫🇮' },
  FR: { name: 'France', currency: 'EUR', vatRate: 0.20, flag: '🇫🇷' },
  DE: { name: 'Germany', currency: 'EUR', vatRate: 0.19, flag: '🇩🇪' },
  GR: { name: 'Greece', currency: 'EUR', vatRate: 0.24, flag: '🇬🇷' },
  IE: { name: 'Ireland', currency: 'EUR', vatRate: 0.23, flag: '🇮🇪' },
  IT: { name: 'Italy', currency: 'EUR', vatRate: 0.22, flag: '🇮🇹' },
  LV: { name: 'Latvia', currency: 'EUR', vatRate: 0.21, flag: '🇱🇻' },
  LT: { name: 'Lithuania', currency: 'EUR', vatRate: 0.21, flag: '🇱🇹' },
  LU: { name: 'Luxembourg', currency: 'EUR', vatRate: 0.17, flag: '🇱🇺' },
  MT: { name: 'Malta', currency: 'EUR', vatRate: 0.18, flag: '🇲🇹' },
  NL: { name: 'Netherlands', currency: 'EUR', vatRate: 0.21, flag: '🇳🇱' },
  PT: { name: 'Portugal', currency: 'EUR', vatRate: 0.23, flag: '🇵🇹' },
  SK: { name: 'Slovakia', currency: 'EUR', vatRate: 0.20, flag: '🇸🇰' },
  SI: { name: 'Slovenia', currency: 'EUR', vatRate: 0.22, flag: '🇸🇮' },
  ES: { name: 'Spain', currency: 'EUR', vatRate: 0.21, flag: '🇪🇸' },
  // Non-euro EU (own currency)
  BG: { name: 'Bulgaria', currency: 'BGN', vatRate: 0.20, flag: '🇧🇬' },
  CZ: { name: 'Czechia', currency: 'CZK', vatRate: 0.21, flag: '🇨🇿' },
  DK: { name: 'Denmark', currency: 'DKK', vatRate: 0.25, flag: '🇩🇰' },
  HU: { name: 'Hungary', currency: 'HUF', vatRate: 0.27, flag: '🇭🇺' },
  PL: { name: 'Poland', currency: 'PLN', vatRate: 0.23, flag: '🇵🇱' },
  RO: { name: 'Romania', currency: 'RON', vatRate: 0.19, flag: '🇷🇴' },
  SE: { name: 'Sweden', currency: 'SEK', vatRate: 0.25, flag: '🇸🇪' },
  // Other trade partners (treated as "other" — duty on CIF, local VAT)
  AU: { name: 'Australia', currency: 'AUD', vatRate: 0.10, flag: '🇦🇺' }, // GST
  NZ: { name: 'New Zealand', currency: 'NZD', vatRate: 0.15, flag: '🇳🇿' }, // GST
  IN: { name: 'India', currency: 'INR', vatRate: 0.18, flag: '🇮🇳' }, // GST
  PK: { name: 'Pakistan', currency: 'PKR', vatRate: 0.18, flag: '🇵🇰' }, // GST
  CN: { name: 'China', currency: 'CNY', vatRate: 0.13, flag: '🇨🇳' }, // VAT
  JP: { name: 'Japan', currency: 'JPY', vatRate: 0.10, flag: '🇯🇵' }, // CT
  AE: { name: 'UAE', currency: 'AED', vatRate: 0.05, flag: '🇦🇪' },
  SA: { name: 'Saudi Arabia', currency: 'SAR', vatRate: 0.15, flag: '🇸🇦' },
  TR: { name: 'Turkey', currency: 'TRY', vatRate: 0.20, flag: '🇹🇷' },
  BR: { name: 'Brazil', currency: 'BRL', vatRate: 0.18, flag: '🇧🇷' },
};

const EU_COUNTRIES = new Set([
  'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU',
  'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/**
 * Resolve a destination country code (ISO-2) to its duty region, currency,
 * VAT rate, and display metadata. Falls back to US/USD if unknown.
 */
export function resolveDestination(countryCode?: string | null): DestinationInfo {
  const cc = (countryCode ?? 'US').toUpperCase().trim();
  const c = COUNTRY[cc] ?? COUNTRY.US;
  let region: Region;
  if (cc === 'US') region = 'US';
  else if (cc === 'GB' || cc === 'UK') region = 'UK';
  else if (EU_COUNTRIES.has(cc)) region = 'EU';
  else region = 'US'; // default fallback for unknown countries

  const rules = DUTY_RULES[region];
  return {
    countryCode: cc,
    countryName: c.name,
    region,
    currency: c.currency,
    vatRate: c.vatRate,
    flag: c.flag,
    label: c.name,
    destinationLevyNotes: rules.notes,
  };
}

/** Currencies the FX service can convert (superset of supported destinations). */
export const SUPPORTED_CURRENCIES = Array.from(
  new Set(Object.values(COUNTRY).map((c) => c.currency)),
).sort();
