/**
 * Locale-based currency default — resolves the browser's region to the
 * REAL local currency (ISO 3166-1 alpha-2 → ISO 4217), e.g. Kenya → KES,
 * not a forced USD/EUR binary. Falls back to USD only when the region is
 * unknown/undetectable. The backend can quote a real rate for any of these
 * against USD (see services/fxService.js — open.er-api.com, ~166 currencies).
 */
const REGION_CURRENCY: Record<string, string> = {
  // Africa
  KE: 'KES', NG: 'NGN', ZA: 'ZAR', GH: 'GHS', UG: 'UGX', TZ: 'TZS', RW: 'RWF',
  ET: 'ETB', EG: 'EGP', MA: 'MAD', DZ: 'DZD', TN: 'TND', ZM: 'ZMW', ZW: 'ZWL',
  BW: 'BWP', NA: 'NAD', MZ: 'MZN', SN: 'XOF', CI: 'XOF', CM: 'XAF', AO: 'AOA',
  SD: 'SDG', LY: 'LYD', MW: 'MWK', ML: 'XOF', BF: 'XOF', BJ: 'XOF', TG: 'XOF',
  NE: 'XOF', GA: 'XAF', CD: 'CDF', SS: 'SSP', SO: 'SOS', DJ: 'DJF', ER: 'ERN',
  MG: 'MGA', MU: 'MUR', SC: 'SCR', LS: 'LSL', SZ: 'SZL', GM: 'GMD', SL: 'SLE',
  LR: 'LRD', GN: 'GNF', BI: 'BIF',
  // Europe (Eurozone)
  AT: 'EUR', BE: 'EUR', CY: 'EUR', EE: 'EUR', FI: 'EUR', FR: 'EUR', DE: 'EUR',
  GR: 'EUR', IE: 'EUR', IT: 'EUR', LV: 'EUR', LT: 'EUR', LU: 'EUR', MT: 'EUR',
  NL: 'EUR', PT: 'EUR', SK: 'EUR', SI: 'EUR', ES: 'EUR', HR: 'EUR',
  // Europe (non-Eurozone)
  GB: 'GBP', CH: 'CHF', NO: 'NOK', SE: 'SEK', DK: 'DKK', PL: 'PLN', CZ: 'CZK',
  HU: 'HUF', RO: 'RON', BG: 'BGN', IS: 'ISK', RS: 'RSD', UA: 'UAH', TR: 'TRY',
  RU: 'RUB', AL: 'ALL', BA: 'BAM', MK: 'MKD', MD: 'MDL', GE: 'GEL', AM: 'AMD',
  AZ: 'AZN', BY: 'BYN',
  // Americas
  US: 'USD', CA: 'CAD', MX: 'MXN', BR: 'BRL', AR: 'ARS', CL: 'CLP', CO: 'COP',
  PE: 'PEN', VE: 'VES', EC: 'USD', UY: 'UYU', PY: 'PYG', BO: 'BOB', CR: 'CRC',
  GT: 'GTQ', HN: 'HNL', NI: 'NIO', PA: 'PAB', DO: 'DOP', JM: 'JMD', TT: 'TTD',
  BS: 'BSD', BB: 'BBD', HT: 'HTG', CU: 'CUP', SV: 'USD',
  // Asia
  CN: 'CNY', JP: 'JPY', KR: 'KRW', IN: 'INR', PK: 'PKR', BD: 'BDT', LK: 'LKR',
  NP: 'NPR', ID: 'IDR', MY: 'MYR', SG: 'SGD', TH: 'THB', VN: 'VND', PH: 'PHP',
  MM: 'MMK', KH: 'KHR', LA: 'LAK', TW: 'TWD', HK: 'HKD', MN: 'MNT', KZ: 'KZT',
  UZ: 'UZS', AF: 'AFN',
  // Middle East
  SA: 'SAR', AE: 'AED', IL: 'ILS', QA: 'QAR', KW: 'KWD', BH: 'BHD', OM: 'OMR',
  JO: 'JOD', LB: 'LBP', IQ: 'IQD', IR: 'IRR', YE: 'YER', SY: 'SYP',
  // Oceania
  AU: 'AUD', NZ: 'NZD', FJ: 'FJD', PG: 'PGK',
};

export function detectDefaultCurrency(): string {
  try {
    const locale = navigator.language || (navigator.languages && navigator.languages[0]) || '';
    const region = new Intl.Locale(locale).region;
    if (region && REGION_CURRENCY[region]) return REGION_CURRENCY[region];
  } catch {
    // Intl.Locale unsupported or locale unparsable — fall through to USD.
  }
  return 'USD';
}

/** A curated shortlist for quick-select UI — not exhaustive, just the most commonly needed alongside whatever was auto-detected. */
export const COMMON_CURRENCIES = ['USD', 'EUR', 'GBP', 'KES', 'NGN', 'ZAR', 'INR', 'JPY'];
