/**
 * Phone number normalization + E.164 validation.
 *
 * SMS (Twilio / Africa's Talking) and WhatsApp (Meta Cloud API) all require a
 * deliverable number in E.164 form: a leading '+' then the country code and
 * subscriber number, 8–15 digits total, no leading zero on the country code.
 * Capturing whatever the user typed ("0712 345 678", "+254-712-345678",
 * "254712345678", "whatsapp:+254712345678") and storing it verbatim means the
 * provider rejects it later with no useful signal — so normalize at the edge
 * (registration + profile update) and store only valid E.164.
 *
 * Local-format numbers (no country code, e.g. Kenya's "0712...") are resolved
 * against DEFAULT_COUNTRY_CODE (env PHONE_DEFAULT_CC, default 254) so a user
 * can type the number the way they'd dial it domestically.
 */

// Default country calling code used to expand local-format numbers. This
// project's payment rails (Safaricom/M-Pesa, Africa's Talking) are Kenya-
// centric, so 254 is the sensible default; override via PHONE_DEFAULT_CC.
const DEFAULT_CC = String(process.env.PHONE_DEFAULT_CC || '254').replace(/\D/g, '');

// Final E.164 shape: '+' + 8..15 digits, first digit after '+' non-zero.
const E164 = /^\+[1-9]\d{7,14}$/;

/**
 * Normalize arbitrary user input to E.164, or return null if it can't be
 * resolved to a valid number. Never throws — callers decide how to react.
 *
 * @param {string} input
 * @param {string} [defaultCountryCode] override for this call's local-format CC
 * @returns {string|null} E.164 (e.g. "+254712345678") or null if invalid
 */
function normalizePhone(input, defaultCountryCode) {
  if (input === undefined || input === null) return null;

  let raw = String(input).trim();
  if (!raw) return null;

  // Strip the WhatsApp scheme prefix if a UI/api caller passed one.
  raw = raw.replace(/^whatsapp:/i, '');

  // Keep only leading '+' and digits; drop spaces, dashes, parens, dots.
  const hadPlus = raw.trimStart().startsWith('+');
  const digits = raw.replace(/\D/g, '');
  if (!digits) return null;

  // Already international: '+' or an explicit country code present.
  if (hadPlus) {
    return E164.test(`+${digits}`) ? `+${digits}` : null;
  }

  const cc = String(defaultCountryCode || DEFAULT_CC).replace(/\D/g, '');

  // "00<cc>..." international dialing prefix.
  if (digits.startsWith('00')) {
    const intl = `+${digits.slice(2)}`;
    return E164.test(intl) ? intl : null;
  }

  // Local format: leading trunk '0' (e.g. "0712..."), or a bare national
  // number with no country code. Prepend the configured country code and
  // drop the trunk zero.
  if (cc) {
    const national = digits.startsWith('0') ? digits.replace(/^0+/, '') : digits;
    const candidate = `+${cc}${national}`;
    return E164.test(candidate) ? candidate : null;
  }

  // No country code configured and number isn't clearly international — treat
  // a bare digit string as international only if it's already long enough to
  // plausibly include a country code; otherwise reject.
  return E164.test(`+${digits}`) ? `+${digits}` : null;
}

/** True iff `input` normalizes to a valid E.164 number. */
function isValidPhone(input, defaultCountryCode) {
  return normalizePhone(input, defaultCountryCode) !== null;
}

module.exports = { normalizePhone, isValidPhone };
