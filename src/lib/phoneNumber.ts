import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from 'libphonenumber-js/max';

export const PHONE_ERROR = 'Please enter a valid phone number for your country, or include its international country code.';

/** Checks numbering rules, not ownership or whether a number is connected. */
export function normalisePhoneNumber(value: unknown, country: unknown = 'GB'): string | null {
  if (typeof value !== 'string') return null;
  let raw = value.trim();
  if (!raw || raw.length > 40 || !/^[+\d][\d\s().-]*$/.test(raw)) return null;
  if (raw.startsWith('00')) raw = '+' + raw.slice(2);
  const region = typeof country === 'string' ? country.toUpperCase() : 'GB';
  if (!raw.startsWith('+') && !isSupportedCountry(region as CountryCode)) return null;
  const phone = parsePhoneNumberFromString(raw, {
    defaultCountry: isSupportedCountry(region as CountryCode) ? region as CountryCode : undefined,
    extract: false,
  });
  return phone?.isValid() ? phone.number : null;
}
