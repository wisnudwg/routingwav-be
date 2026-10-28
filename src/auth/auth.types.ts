import type { Prisma } from '../generated/prisma/client'

export const userArgs = {
  include: { account: { include: { profiles: true } } },
} satisfies Prisma.UserDefaultArgs

export type UserFull = Prisma.UserGetPayload<typeof userArgs>

export type PendingStep = 'complete-profile' | 'change-password'

export interface AuthContext {
  sessionId: string
  user: UserFull
  pending?: PendingStep
}

export function pendingOf(u: UserFull): PendingStep | undefined {
  if (u.type === 'ROOT') return u.accountId ? undefined : 'complete-profile'
  return u.mustChangePassword ? 'change-password' : undefined
}

export const makeContext = (sessionId: string, user: UserFull): AuthContext => ({
  sessionId,
  user,
  pending: pendingOf(user),
})