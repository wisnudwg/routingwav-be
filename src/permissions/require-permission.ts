import { SetMetadata } from '@nestjs/common'
import type { Permission } from './catalog'

export const REQUIRE_PERMISSION = 'requirePermission'

/** On a controller or a route: the caller must hold this permission. Owners hold everything. */
export const RequirePermission = (permission: Permission) => SetMetadata(REQUIRE_PERMISSION, permission)