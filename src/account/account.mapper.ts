import { parsePhoneNumberFromString } from 'libphonenumber-js'
import type { UserFull } from '../auth/auth.types'
import type { ProfileView } from './account.schemas'

export function toProfileView(u: UserFull): ProfileView {
  const a = u.account as NonNullable<UserFull['account']>
  const parsed = a.phone ? parsePhoneNumberFromString(a.phone) : undefined
  return {
    name: u.name ?? '',
    email: u.email as string,
    alias: a.alias,
    // Older rows have no stored country: fall back to what the number itself says
    phoneCountry: a.phoneCountry ?? parsed?.country ?? '',
    phoneNumber: parsed?.nationalNumber ?? '',
    country: a.country ?? '',
    address: a.address ?? '',
  }
}