import { z } from 'zod'
import { RESERVED_USERNAMES, USERNAME_REGEX } from '../common/rules/usernames'
import { PERMISSIONS, isRootOnly, type Permission } from '../permissions/catalog'

const ALL_IDS = PERMISSIONS as [Permission, ...Permission[]]
const GRANTABLE_IDS = PERMISSIONS.filter((p) => !isRootOnly(p)) as [Permission, ...Permission[]]

/* ---------- requests ---------- */

export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(USERNAME_REGEX, '3–32 karakter: huruf, angka, titik, garis bawah, atau tanda hubung (mulai dengan huruf/angka)')
  .refine((v) => !RESERVED_USERNAMES.has(v), 'Username ini tidak tersedia')

// Owner-only and unknown ids are rejected outright: they are not part of the contract
const permissionsInput = z.array(z.enum(GRANTABLE_IDS)).max(100)

export const createMemberSchema = z.object({
  username: usernameSchema,
  name: z.string().trim().max(80, 'Maksimal 80 karakter').optional(),
  permissions: permissionsInput.default([]),
})
export type CreateMemberInput = z.infer<typeof createMemberSchema>

export const updateMemberSchema = z
  .object({
    name: z.string().trim().max(80, 'Maksimal 80 karakter').optional(),
    permissions: permissionsInput.optional(),
  })
  .refine((v) => v.name !== undefined || v.permissions !== undefined, 'Tidak ada perubahan')
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>

export const idSchema = z.uuid()

/* ---------- responses (documentation + typing) ---------- */

export const memberViewSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  name: z.string().nullable(),
  permissions: z.array(z.enum(ALL_IDS)),
  status: z.enum(['active', 'disabled']),
  mustChangePassword: z.boolean(),
  tempPasswordExpiresAt: z.string().nullable(),
  notificationEmail: z.string().nullable(),
  notificationEmailVerified: z.boolean(),
  createdAt: z.string(),
  lastSignInAt: z.string().nullable(),
})
export type MemberView = z.infer<typeof memberViewSchema>

export const memberEnvelopeSchema = z.object({ member: memberViewSchema })
export const memberListSchema = z.object({ members: z.array(memberViewSchema) })
export const credentialsSchema = z.object({ member: memberViewSchema, tempPassword: z.string() })