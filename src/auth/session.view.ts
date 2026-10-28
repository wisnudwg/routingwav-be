import type { AuthContext } from './auth.types'

export function toSessionView(a: AuthContext) {
  const u = a.user
  const profiles = (u.account?.profiles ?? []).map((p) => (p.kind === 'TALENT' ? 'talent' : 'client'))

  if (u.type === 'ROOT') {
    return {
      type: 'root' as const,
      email: u.email as string,
      name: u.name ?? undefined,
      alias: u.account?.alias,
      profiles,
      pending: a.pending === 'complete-profile' ? ('complete-profile' as const) : undefined,
    }
  }

  return {
    type: 'iam' as const,
    account: u.account?.alias as string,
    username: u.username as string,
    name: u.name ?? undefined,
    profiles,
    permissions: u.permissions,
    pending: a.pending === 'change-password' ? ('change-password' as const) : undefined,
  }
}

export type SessionView = ReturnType<typeof toSessionView>