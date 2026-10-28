import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common'
import type { AuthContext } from '../auth/auth.types'
import type { AuthedRequest } from './request'

export const IS_PUBLIC = 'isPublic'
export const ALLOW_PENDING = 'allowPending'

/** No session needed */
export const Public = () => SetMetadata(IS_PUBLIC, true)

/** Reachable while a first-time step (complete profile / change password) is still pending */
export const AllowPending = () => SetMetadata(ALLOW_PENDING, true)

export const CurrentAuth = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthContext =>
    ctx.switchToHttp().getRequest<AuthedRequest>().auth as AuthContext,
)