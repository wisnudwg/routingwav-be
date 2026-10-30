import { Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { makeContext, userArgs, type AuthContext } from '../auth/auth.types'
import { toSessionView } from '../auth/session.view'
import { AppError, isUniqueViolation } from '../common/app-error'
import type { RequestCtx } from '../common/request'
import { PrismaService } from '../prisma/prisma.service'
import type { AddProfileInput } from './profiles.schemas'

@Injectable()
export class ProfilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async add(auth: AuthContext, input: AddProfileInput, ctx: RequestCtx) {
    const u = auth.user
    if (u.type !== 'ROOT' || !u.accountId) {
      throw new AppError(403, 'FORBIDDEN', 'Hanya pemilik akun yang dapat menambah profil.')
    }

    try {
      await this.prisma.profile.create({
        data: {
          accountId: u.accountId,
          kind: input.kind === 'talent' ? 'TALENT' : 'CLIENT',
          roles: input.roles,
          otherRole: input.roles.includes('Other') ? input.otherRole : null,
          instruments: input.kind === 'talent' && input.roles.includes('Session Player') ? input.instruments : null,
        },
      })
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError(409, 'PROFILE_EXISTS', 'Akun Anda sudah memiliki profil ini.')
      throw e
    }

    // Team members get nothing for the new profile until the owner grants it (deny by default)
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: userArgs.include })
    await this.audit.record({
      accountId: u.accountId,
      actorId: u.id,
      actorLabel: u.email as string,
      action: 'account.profile_added',
      detail: input.kind,
      ip: ctx.ip,
    })
    return { session: toSessionView(makeContext(auth.sessionId, fresh)) }
  }
}