import { getCountries } from 'libphonenumber-js'
import { z } from 'zod'
import { toE164 } from '../common/phone'
import { ALIAS_REGEX, RESERVED_ALIASES } from '../common/rules/alias'
import {
  OTHER_ROLE,
  PROFILE_KINDS,
  ROLES_BY_KIND,
  SESSION_PLAYER_ROLE,
  type ProfileKindName,
} from '../common/rules/roles'

const COUNTRIES = new Set<string>(getCountries())

const email = z.string().trim().toLowerCase().pipe(z.email({ error: 'Email tidak valid' }))
const password = z
  .string()
  .min(8, 'Password minimal 8 karakter')
  .max(128, 'Password maksimal 128 karakter')
const token = z.string().min(20).max(200)

export const aliasField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(ALIAS_REGEX, '3–63 karakter: huruf kecil, angka, tanda hubung')
  .refine((v) => !RESERVED_ALIASES.has(v), 'ID akun ini tidak tersedia')

const countryField = z
  .string()
  .trim()
  .toUpperCase()
  .refine((c) => COUNTRIES.has(c), 'Negara tidak valid')

const profileFields = {
  kind: z.enum(PROFILE_KINDS, { error: 'Pilih jenis akun' }),
  phoneCountry: countryField,
  phoneNumber: z.string().regex(/^\d{6,15}$/, 'Nomor telepon harus 6–15 digit'),
  country: countryField,
  address: z.string().trim().min(5, 'Alamat terlalu pendek').max(300),
  roles: z.array(z.string().trim().max(60)).min(1, 'Pilih minimal satu peran').max(8),
  otherRole: z.string().trim().max(100).optional(),
  instruments: z.string().trim().max(200).optional(),
}

type ProfileLike = {
  kind: ProfileKindName
  phoneCountry: string
  phoneNumber: string
  roles: string[]
  otherRole?: string
  instruments?: string
}
type IssueSink = {
  addIssue: (i: { code: 'custom'; path: string[]; message: string }) => void
}

function refineProfile(v: ProfileLike, ctx: IssueSink) {
  const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })

  if (v.roles.some((r) => !ROLES_BY_KIND[v.kind].includes(r))) {
    add('roles', 'Peran tidak sesuai dengan jenis akun')
  }
  if (v.roles.includes(OTHER_ROLE) && !v.otherRole) add('otherRole', 'Tuliskan peran Anda')
  if (v.kind === 'talent' && v.roles.includes(SESSION_PLAYER_ROLE) && !v.instruments) {
    add('instruments', 'Tuliskan instrumen Anda')
  }
  if (!toE164(v.phoneCountry, v.phoneNumber)) add('phoneNumber', 'Nomor telepon tidak valid')
}

const acceptTerms = z.literal(true, {
  error: 'Anda harus menyetujui Syarat & Ketentuan dan Kebijakan Privasi',
})

export const registerSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
    email,
    password,
    accountAlias: aliasField,
    acceptTerms,
    ...profileFields,
  })
  .superRefine(refineProfile)
export type RegisterInput = z.infer<typeof registerSchema>

export const completeProfileSchema = z
  .object({ accountAlias: aliasField, acceptTerms, ...profileFields })
  .superRefine(refineProfile)
export type CompleteProfileInput = z.infer<typeof completeProfileSchema>

export const signInRootSchema = z.object({ email, password: z.string().min(1).max(128) })
export type SignInRootInput = z.infer<typeof signInRootSchema>

export const signInIamSchema = z.object({
  account: z.string().trim().toLowerCase().min(1).max(63),
  username: z.string().trim().toLowerCase().min(1).max(64),
  password: z.string().min(1).max(128),
})
export type SignInIamInput = z.infer<typeof signInIamSchema>

export const googleSchema = z.object({ idToken: z.string().min(20).max(4096) })
export const verifyEmailSchema = z.object({ token })
export const emailOnlySchema = z.object({ email })
export const resetPasswordSchema = z.object({ token, password })
export const changePasswordSchema = z.object({ password })

export const aliasQuerySchema = z.object({ alias: z.string().trim().toLowerCase().max(80) })