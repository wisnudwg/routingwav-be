import { z } from 'zod'
import { PERMISSIONS, type Permission } from '../permissions/catalog'

const ALL_IDS = PERMISSIONS as [Permission, ...Permission[]]

export const permissionsMetaSchema = z.object({
  permissions: z.array(
    z.object({
      id: z.enum(ALL_IDS),
      scope: z.enum(['talent', 'client', 'shared']),
      group: z.string().nullable(),
      label: z.string(),
      description: z.string(),
      requires: z.array(z.enum(ALL_IDS)),
      sensitive: z.boolean(),
      rootOnly: z.boolean(),
    }),
  ),
  presets: z.array(
    z.object({
      id: z.string(),
      label: z.string(),
      description: z.string(),
      permissions: z.array(z.enum(ALL_IDS)),
    }),
  ),
})

export const rulesSchema = z.object({
  withdrawal: z.object({
    feeBps: z.number(),
    minAmount: z.number(),
    dailyLimit: z.number(),
    payoutHours: z.number(),
  }),
  messages: z.object({
    maxTextLength: z.number(),
    maxAudioMb: z.number(),
    editWindowMinutes: z.number(),
  }),
  team: z.object({ maxMembers: z.number(), tempPasswordTtlDays: z.number() }),
})