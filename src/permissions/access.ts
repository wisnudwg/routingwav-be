import type { UserFull } from '../auth/auth.types'
import { isRootOnly, limitToProfiles, normalizePermissions, type Permission } from './catalog'

export function profileKindsOf(user: UserFull) {
  return (user.account?.profiles ?? []).map((p) => (p.kind === 'TALENT' ? ('talent' as const) : ('client' as const)))
}

/** What a user may actually do right now: stored grants, normalized, limited to the account's profiles */
export function effectivePermissions(user: UserFull): Permission[] {
  return limitToProfiles(normalizePermissions(user.permissions), profileKindsOf(user))
}

export function can(user: UserFull, permission: Permission): boolean {
  if (user.type === 'ROOT') return true
  return !isRootOnly(permission) && effectivePermissions(user).includes(permission)
}