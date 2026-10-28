import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { SessionService } from '../auth/session.service'
import { AppError } from './app-error'
import { ALLOW_PENDING, IS_PUBLIC } from './decorators'
import type { AuthedRequest } from './request'
import { SESSION_COOKIE } from './session-cookie'

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const targets = [ctx.getHandler(), ctx.getClass()]
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) return true

    const req = ctx.switchToHttp().getRequest<AuthedRequest>()
    const raw: unknown = req.cookies?.[SESSION_COOKIE]
    const auth = typeof raw === 'string' && raw ? await this.sessions.validate(raw) : null
    if (!auth) throw new AppError(401, 'UNAUTHENTICATED', 'Silakan masuk terlebih dahulu.')

    req.auth = auth

    // First-time steps must be finished before anything else works
    if (auth.pending && !this.reflector.getAllAndOverride<boolean>(ALLOW_PENDING, targets)) {
      throw new AppError(403, 'PENDING_STEP', 'Selesaikan langkah awal akun Anda terlebih dahulu.', {
        step: auth.pending,
      })
    }
    return true
  }
}