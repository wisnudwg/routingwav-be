import { Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { AppError } from '../common/app-error'
import type { RequestCtx } from '../common/request'
import { PrismaService } from '../prisma/prisma.service'
import type { AuthContext } from './auth.types'
import { PasswordService } from './password.service'

const ELEVATION_MS = 5 * 60_000
const MAX_FAILED = 5 // same limits as sign-in: a stolen session must not become a password oracle
const LOCK_MS = 15 * 60_000

@Injectable()
export class StepUpService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly audit: AuditService,
  ) {}

  async confirm(auth: AuthContext, password: string, ctx: RequestCtx) {
    const u = auth.user
    if (!u.passwordHash) {
      throw new AppError(
        409,
        'NO_PASSWORD',
        'Akun ini belum memiliki password. Atur password lewat "Lupa password", lalu coba lagi.',
      )
    }
    if (u.lockedUntil && u.lockedUntil.getTime() > Date.now()) {
      throw new AppError(429, 'RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi nanti.')
    }

    if (!(await this.passwords.verify(u.passwordHash, password))) {
      const updated = await this.prisma.user.update({
        where: { id: u.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      })
      if (updated.failedLoginCount >= MAX_FAILED) {
        await this.prisma.user.update({
          where: { id: u.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
        })
      }
      await this.audit.record({
        accountId: u.accountId,
        actorId: u.id,
        actorLabel: u.email ?? `${u.username}@${u.account?.alias}`,
        action: 'auth.step_up_failed',
        ip: ctx.ip,
      })
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Password salah.')
    }

    const until = new Date(Date.now() + ELEVATION_MS)
    await this.prisma.$transaction([
      this.prisma.session.update({ where: { id: auth.sessionId }, data: { elevatedUntil: until } }),
      this.prisma.user.update({ where: { id: u.id }, data: { failedLoginCount: 0 } }),
    ])
    return { elevatedUntil: until.toISOString() }
  }
}