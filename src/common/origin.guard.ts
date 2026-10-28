import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Request } from 'express'
import type { Env } from '../config/env'
import { AppError } from './app-error'
import { SESSION_COOKIE } from './session-cookie'

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS'])

/**
 * CSRF defence for cookie sessions, on top of SameSite=Lax:
 * - an unsafe request from a browser must come from one of our own origins
 * - a request that carries the session cookie but no Origin header is refused
 *   (browsers always send Origin on unsafe cross-site requests; add one by hand in Postman)
 */
@Injectable()
export class OriginGuard implements CanActivate {
  private readonly allowed: Set<string>

  constructor(config: ConfigService<Env, true>) {
    this.allowed = new Set(config.get('APP_ORIGINS', { infer: true }))
  }

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>()
    if (SAFE.has(req.method)) return true

    const origin = req.headers.origin
    if (origin) {
      if (this.allowed.has(origin)) return true
      throw new AppError(403, 'BAD_ORIGIN', 'Permintaan ditolak.')
    }

    if (req.cookies?.[SESSION_COOKIE]) throw new AppError(403, 'BAD_ORIGIN', 'Permintaan ditolak.')
    return true
  }
}