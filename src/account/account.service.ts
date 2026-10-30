import { Injectable } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { userArgs, type AuthContext, type UserFull } from '../auth/auth.types'
import { AppError } from '../common/app-error'
import { toE164 } from '../common/phone'
import type { RequestCtx } from '../common/request'
import { PrismaService } from '../prisma/prisma.service'
import { detailOf, labelOf } from './activity.labels'
import { toProfileView } from './account.mapper'
import type { ActivityQuery, UpdateProfileInput } from './account.schemas'
import { decodeCursor, encodeCursor } from './cursor'

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** The signed-in owner, with their account. Anyone else is refused. */
  private owner(auth: AuthContext): UserFull & { accountId: string } {
    const u = auth.user
    if (u.type !== 'ROOT' || !u.accountId || !u.account) {
      throw new AppError(403, 'FORBIDDEN', 'Hanya pemilik akun yang dapat membuka halaman ini.')
    }
    return u as UserFull & { accountId: string }
  }

  getProfile(auth: AuthContext) {
    return { profile: toProfileView(this.owner(auth)) }
  }

  async updateProfile(auth: AuthContext, input: UpdateProfileInput, ctx: RequestCtx) {
    const u = this.owner(auth)
    const a = u.account as NonNullable<UserFull['account']>
    const phone = toE164(input.phoneCountry, input.phoneNumber) as string // already validated by the schema

    const changed: string[] = []
    if ((u.name ?? '') !== input.name) changed.push('nama')
    if (a.phone !== phone || a.phoneCountry !== input.phoneCountry) changed.push('telepon')
    if (a.country !== input.country) changed.push('negara')
    if ((a.address ?? '') !== input.address) changed.push('alamat')
    if (changed.length === 0) return { profile: toProfileView(u) }

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: u.id }, data: { name: input.name } }),
      this.prisma.account.update({
        where: { id: a.id },
        data: { phone, phoneCountry: input.phoneCountry, country: input.country, address: input.address },
      }),
    ])
    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: userArgs.include })

    // Names of the fields only, never their values
    await this.audit.record({
      accountId: u.accountId,
      actorId: u.id,
      actorLabel: u.email as string,
      action: 'account.profile_updated',
      detail: changed.join(', '),
      ip: ctx.ip,
    })
    return { profile: toProfileView(fresh) }
  }

  async activity(auth: AuthContext, q: ActivityQuery) {
    const u = this.owner(auth)

    const cursor = q.cursor ? decodeCursor(q.cursor) : null
    if (q.cursor && !cursor) throw new AppError(400, 'VALIDATION', 'Cursor tidak valid.')

    const rows = await this.prisma.auditEvent.findMany({
      where: {
        accountId: u.accountId, // the only scoping there is: no client-supplied account
        ...(q.category !== 'all' ? { action: { startsWith: `${q.category}.` } } : {}),
        ...(cursor ? { OR: [{ at: { lt: cursor.at } }, { at: cursor.at, id: { lt: cursor.id } }] } : {}),
      },
      orderBy: [{ at: 'desc' }, { id: 'desc' }],
      take: q.limit + 1, // one extra row tells us whether another page exists
    })

    const page = rows.slice(0, q.limit)
    const last = page[page.length - 1]
    return {
      events: page.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        action: e.action,
        label: labelOf(e.action),
        detail: detailOf(e.action, e.detail),
        actor: e.actorLabel,
      })),
      nextCursor: rows.length > q.limit && last ? encodeCursor({ at: last.at, id: last.id }) : null,
    }
  }
}