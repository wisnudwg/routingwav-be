import { z } from 'zod'
import { OTHER_ROLE, PROFILE_KINDS, ROLES_BY_KIND, SESSION_PLAYER_ROLE } from '../common/rules/roles'

export const addProfileSchema = z
  .object({
    kind: z.enum(PROFILE_KINDS, { error: 'Pilih jenis profil' }),
    roles: z.array(z.string().trim().max(60)).min(1, 'Pilih minimal satu peran').max(8),
    otherRole: z.string().trim().max(100).optional(),
    instruments: z.string().trim().max(200).optional(),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.roles.some((r) => !ROLES_BY_KIND[v.kind].includes(r))) add('roles', 'Peran tidak sesuai dengan jenis profil')
    if (v.roles.includes(OTHER_ROLE) && !v.otherRole) add('otherRole', 'Tuliskan peran Anda')
    if (v.kind === 'talent' && v.roles.includes(SESSION_PLAYER_ROLE) && !v.instruments) {
      add('instruments', 'Tuliskan instrumen Anda')
    }
  })

export type AddProfileInput = z.infer<typeof addProfileSchema>