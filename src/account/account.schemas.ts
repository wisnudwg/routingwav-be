import { z } from 'zod'
import { countryField } from '../auth/auth.schemas'
import { toE164 } from '../common/phone'

/* ---------- profile ---------- */

export const updateProfileSchema = z
  .object({
    name: z.string().trim().min(2, 'Nama minimal 2 karakter').max(100),
    phoneCountry: countryField,
    phoneNumber: z.string().regex(/^\d{6,15}$/, 'Nomor telepon harus 6–15 digit'),
    country: countryField,
    address: z.string().trim().min(5, 'Alamat terlalu pendek').max(300),
  })
  .superRefine((v, ctx) => {
    if (!toE164(v.phoneCountry, v.phoneNumber)) {
      ctx.addIssue({ code: 'custom', path: ['phoneNumber'], message: 'Nomor telepon tidak valid' })
    }
  })
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>

export const profileViewSchema = z.object({
  name: z.string(),
  email: z.string(),
  alias: z.string(),
  phoneCountry: z.string(),
  phoneNumber: z.string(),
  country: z.string(),
  address: z.string(),
})
export type ProfileView = z.infer<typeof profileViewSchema>
export const profileEnvelopeSchema = z.object({ profile: profileViewSchema })

/* ---------- activity ---------- */

export const activityQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().max(200).optional(),
  category: z.enum(['all', 'auth', 'team', 'account']).default('all'),
})
export type ActivityQuery = z.infer<typeof activityQuerySchema>

export const activityPageSchema = z.object({
  events: z.array(
    z.object({
      id: z.uuid(),
      at: z.string(),
      action: z.string(),
      label: z.string(),
      detail: z.string().nullable(),
      actor: z.string(),
    }),
  ),
  nextCursor: z.string().nullable(),
})