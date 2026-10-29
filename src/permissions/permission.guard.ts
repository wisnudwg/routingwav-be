import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { AppError } from '../common/app-error'
import type { AuthedRequest } from '../common/request'
import { can } from './access'
import type { Permission } from './catalog'
import { REQUIRE_PERMISSION } from './require-permission'

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission | undefined>(REQUIRE_PERMISSION, [
      ctx.getHandler(),
      ctx.getClass(),
    ])
    if (!required) return true

    const auth = ctx.switchToHttp().getRequest<AuthedRequest>().auth
    if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.')
    if (!can(auth.user, required)) {
      throw new AppError(403, 'FORBIDDEN', 'Anda tidak memiliki izin untuk tindakan ini.', { permission: required })
    }
    return true
  }
}