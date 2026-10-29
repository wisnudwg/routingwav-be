import type { ProfileKindName } from '../common/rules/roles'
import type { User } from '../generated/prisma/client'
import { limitToProfiles, normalizePermissions } from '../permissions/catalog'
import type { MemberView } from './team.schemas'

export function toMemberView(u: User, profiles: readonly ProfileKindName[]): MemberView {
  return {
    id: u.id,
    username: u.username as string,
    name: u.name,
    permissions: limitToProfiles(normalizePermissions(u.permissions), profiles),
    status: u.status === 'ACTIVE' ? 'active' : 'disabled',
    mustChangePassword: u.mustChangePassword,
    tempPasswordExpiresAt: u.tempPasswordExpiresAt?.toISOString() ?? null,
    notificationEmail: u.notificationEmail,
    notificationEmailVerified: !!u.notificationEmailVerifiedAt,
    createdAt: u.createdAt.toISOString(),
    lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
  }
}