import { CountryCode, parsePhoneNumberFromString } from 'libphonenumber-js'

/** National digits + ISO country → "+6281234567890", or null if it can't be a real number */
export function toE164(country: string, digits: string): string | null {
  const parsed = parsePhoneNumberFromString(digits, country as CountryCode)
  return parsed?.isPossible() ? parsed.number : null
}