import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { CookieOptions, Response } from 'express'
import { newToken, sha256 } from '../common/crypto'
import type { RequestCtx } from '../common/request'
import { IS_PROD, SESSION_COOKIE } from '../common/session-cookie'
import type { Env } from '../config/env'
import { PrismaService } from '../prisma/prisma.service'
import { makeContext, userArgs, type AuthContext } from './auth.types'

const DAY = 86_400_000

@Injectable()
export class SessionService {
  private readonly idleMs: number
  private readonly absoluteMs: number

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.idleMs = config.get('SESSION_IDLE_DAYS', { infer: true }) * DAY
    this.absoluteMs = config.get('SESSION_ABSOLUTE_DAYS', { infer: true }) * DAY
  }

  private cookieOptions(): CookieOptions {
    return { httpOnly: true, secure: IS_PROD, sameSite: 'lax', path: '/' }
  }

  setCookie(res: Response, token: string) {
    res.cookie(SESSION_COOKIE, token, { ...this.cookieOptions(), maxAge: this.absoluteMs })
  }

  clearCookie(res: Response) {
    res.clearCookie(SESSION_COOKIE, this.cookieOptions())
  }

  async create(userId: string, ctx: RequestCtx) {
    const token = newToken()
    const row = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + this.absoluteMs),
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    })
    return { id: row.id, token }
  }

  /** Returns the signed-in context, or null if the token is unknown, expired, idle too long, or the user is disabled */
  async validate(raw: string): Promise<AuthContext | null> {
    const row = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(raw) },
      include: { user: { include: userArgs.include } },
    })
    if (!row) return null

    const now = Date.now()
    const dead =
      row.expiresAt.getTime() <= now ||
      row.lastSeenAt.getTime() + this.idleMs <= now ||
      row.user.status !== 'ACTIVE'

    if (dead) {
      await this.prisma.session.delete({ where: { id: row.id } }).catch(() => undefined)
      return null
    }

    if (now - row.lastSeenAt.getTime() > 60_000) {
      void this.prisma.session
        .update({ where: { id: row.id }, data: { lastSeenAt: new Date(now) } })
        .catch(() => undefined)
    }
    return makeContext(row.id, row.user)
  }

  async revokeByToken(raw: string) {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(raw) } })
  }

  /** Optionally keeps one session (the one doing the change) */
  async revokeAllForUser(userId: string, exceptSessionId?: string) {
    await this.prisma.session.deleteMany({
      where: { userId, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    })
  }
}