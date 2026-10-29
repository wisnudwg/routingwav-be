import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AppError, isUniqueViolation } from '../common/app-error'
import type { RequestCtx } from '../common/request'
import type { ProfileKindName } from '../common/rules/roles'
import { RULES } from '../common/rules/rules'
import { generateTempPassword } from '../common/temp-password'
import type { Env } from '../config/env'
import { AuditService } from '../audit/audit.service'
import type { AuthContext } from '../auth/auth.types'
import { PasswordService } from '../auth/password.service'
import { SessionService } from '../auth/session.service'
import { MailService } from '../mail/mail.service'
import { maskEmail, memberEmailVerifyMail } from '../mail/templates'
import { limitToProfiles, normalizePermissions } from '../permissions/catalog'
import { profileKindsOf } from '../permissions/access'
import { PrismaService } from '../prisma/prisma.service'
import { TokenService } from '../tokens/token.service'
import { toMemberView } from './team.mapper'
import type { CreateMemberInput, UpdateMemberInput } from './team.schemas'

const DAY = 86_400_000
const EMAIL_TOKEN_TTL_MS = DAY

type Owner = {
  accountId: string
  alias: string
  ownerId: string
  label: string
  profiles: ProfileKindName[]
}

@Injectable()
export class TeamService {
  private readonly platformUrl: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly tokens: TokenService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    config: ConfigService<Env, true>,
  ) {
    this.platformUrl = config.get('PLATFORM_URL', { infer: true })
  }

  /* ----------------------------------------------------------------- helpers */

  private owner(auth: AuthContext): Owner {
    const u = auth.user
    if (u.type !== 'ROOT' || !u.accountId || !u.account) {
      throw new AppError(403, 'FORBIDDEN', 'Hanya pemilik akun yang dapat mengelola tim.')
    }
    return {
      accountId: u.accountId,
      alias: u.account.alias,
      ownerId: u.id,
      label: u.email as string,
      profiles: profileKindsOf(u),
    }
  }

  /** Every lookup is scoped by the owner's account: another account's member simply doesn't exist */
  private async find(o: Owner, id: string) {
    const m = await this.prisma.user.findFirst({ where: { id, accountId: o.accountId, type: 'IAM' } })
    if (!m) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Anggota tidak ditemukan.')
    return m
  }

  private sanitize(perms: readonly string[], o: Owner) {
    return limitToProfiles(normalizePermissions(perms), o.profiles)
  }

  private log(o: Owner, action: string, detail: string, ctx: RequestCtx) {
    return this.audit.record({
      accountId: o.accountId,
      actorId: o.ownerId,
      actorLabel: o.label,
      action,
      detail: detail.slice(0, 500), // permission ids and usernames only, never secrets
      ip: ctx.ip,
    })
  }

  private tempPasswordExpiry() {
    return new Date(Date.now() + RULES.team.tempPasswordTtlDays * DAY)
  }

  /* -------------------------------------------------------------------- CRUD */

  async list(auth: AuthContext) {
    const o = this.owner(auth)
    const rows = await this.prisma.user.findMany({
      where: { accountId: o.accountId, type: 'IAM' },
      orderBy: { username: 'asc' },
    })
    return { members: rows.map((r) => toMemberView(r, o.profiles)) }
  }

  async get(auth: AuthContext, id: string) {
    const o = this.owner(auth)
    return { member: toMemberView(await this.find(o, id), o.profiles) }
  }

  async create(auth: AuthContext, input: CreateMemberInput, ctx: RequestCtx) {
    const o = this.owner(auth)

    const count = await this.prisma.user.count({ where: { accountId: o.accountId, type: 'IAM' } })
    if (count >= RULES.team.maxMembers) {
      throw new AppError(409, 'MEMBER_LIMIT', `Jumlah anggota tim maksimal ${RULES.team.maxMembers}.`)
    }

    const tempPassword = generateTempPassword()
    const passwordHash = await this.passwords.hash(tempPassword)

    try {
      const user = await this.prisma.user.create({
        data: {
          type: 'IAM',
          accountId: o.accountId,
          username: input.username,
          name: input.name?.trim() || null,
          passwordHash,
          mustChangePassword: true,
          tempPasswordExpiresAt: this.tempPasswordExpiry(),
          permissions: this.sanitize(input.permissions, o),
        },
      })
      await this.log(o, 'team.member_created', `${user.username}: ${user.permissions.length} izin`, ctx)
      return { member: toMemberView(user, o.profiles), tempPassword }
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError(409, 'USERNAME_TAKEN', 'Username sudah dipakai di akun ini.', {
          fields: { username: 'Username sudah dipakai di akun ini.' },
        })
      }
      throw e
    }
  }

  async update(auth: AuthContext, id: string, input: UpdateMemberInput, ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)

    const before = this.sanitize(m.permissions, o)
    const after = input.permissions ? this.sanitize(input.permissions, o) : before
    const added = after.filter((p) => !before.includes(p))
    const removed = before.filter((p) => !after.includes(p))

    const newName = input.name === undefined ? m.name : input.name.trim() || null
    const nameChanged = newName !== m.name

    if (added.length === 0 && removed.length === 0 && !nameChanged) {
      return { member: toMemberView(m, o.profiles) } // nothing to do
    }

    // Permissions are read from this row on every request, so the change applies to the member's very next call
    const updated = await this.prisma.user.update({
      where: { id: m.id },
      data: { name: newName, permissions: { set: after } },
    })

    const parts = [...added.map((p) => `+${p}`), ...removed.map((p) => `-${p}`), ...(nameChanged ? ['nama'] : [])]
    await this.log(o, 'team.member_updated', `${m.username}: ${parts.join(' ')}`, ctx)
    return { member: toMemberView(updated, o.profiles) }
  }

  async setStatus(auth: AuthContext, id: string, status: 'ACTIVE' | 'DISABLED', ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)
    if (m.status === status) return { member: toMemberView(m, o.profiles) }

    const updated = await this.prisma.user.update({
      where: { id: m.id },
      data: status === 'ACTIVE' ? { status, failedLoginCount: 0, lockedUntil: null } : { status },
    })
    if (status === 'DISABLED') await this.sessions.revokeAllForUser(m.id) // signed out everywhere, right now

    await this.log(o, status === 'ACTIVE' ? 'team.member_enabled' : 'team.member_disabled', m.username as string, ctx)
    return { member: toMemberView(updated, o.profiles) }
  }

  async resetPassword(auth: AuthContext, id: string, ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)

    const tempPassword = generateTempPassword()
    const updated = await this.prisma.user.update({
      where: { id: m.id },
      data: {
        passwordHash: await this.passwords.hash(tempPassword),
        mustChangePassword: true,
        tempPasswordExpiresAt: this.tempPasswordExpiry(),
        failedLoginCount: 0,
        lockedUntil: null,
      },
    })
    await this.sessions.revokeAllForUser(m.id)

    await this.log(o, 'team.member_password_reset', m.username as string, ctx)
    return { member: toMemberView(updated, o.profiles), tempPassword }
  }

  async remove(auth: AuthContext, id: string, ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)
    await this.prisma.user.delete({ where: { id: m.id } }) // sessions and tokens cascade
    await this.log(o, 'team.member_deleted', m.username as string, ctx)
  }

  /* ------------------------------------------------------------- member email */

  async setEmail(auth: AuthContext, id: string, email: string, ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)
    if (m.status !== 'ACTIVE') throw new AppError(409, 'MEMBER_DISABLED', 'Aktifkan anggota ini terlebih dahulu.')
    if (m.notificationEmail === email && m.notificationEmailVerifiedAt) {
      return { member: toMemberView(m, o.profiles) }
    }

    let updated
    try {
      updated = await this.prisma.user.update({
        where: { id: m.id },
        data: { notificationEmail: email, notificationEmailVerifiedAt: null },
      })
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError(409, 'EMAIL_IN_USE', 'Email ini sudah dipakai anggota lain.', {
          fields: { email: 'Email ini sudah dipakai anggota lain.' },
        })
      }
      throw e
    }

    await this.sendEmailVerification(o, updated.id, m.username as string, email)
    await this.log(o, 'team.member_email_set', `${m.username}: ${maskEmail(email)}`, ctx)
    return { member: toMemberView(updated, o.profiles) }
  }

  async resendEmail(auth: AuthContext, id: string) {
    const o = this.owner(auth)
    const m = await this.find(o, id)
    if (!m.notificationEmail || m.notificationEmailVerifiedAt) {
      throw new AppError(409, 'NOTHING_TO_VERIFY', 'Tidak ada email yang menunggu verifikasi.')
    }
    if (await this.tokens.recent(m.id, 'VERIFY_NOTIFICATION_EMAIL')) {
      throw new AppError(429, 'RATE_LIMITED', 'Tunggu satu menit sebelum mengirim ulang.')
    }
    await this.sendEmailVerification(o, m.id, m.username as string, m.notificationEmail)
  }

  async removeEmail(auth: AuthContext, id: string, ctx: RequestCtx) {
    const o = this.owner(auth)
    const m = await this.find(o, id)
    if (!m.notificationEmail) return { member: toMemberView(m, o.profiles) }

    const updated = await this.prisma.user.update({
      where: { id: m.id },
      data: { notificationEmail: null, notificationEmailVerifiedAt: null },
    })
    await this.log(o, 'team.member_email_removed', `${m.username}: ${maskEmail(m.notificationEmail)}`, ctx)
    return { member: toMemberView(updated, o.profiles) }
  }

  /** Public: whoever holds the link. The address must still be the one the link was issued for. */
  async verifyMemberEmail(raw: string, ctx: RequestCtx) {
    const { userId, target } = await this.tokens.consume(raw, 'VERIFY_NOTIFICATION_EMAIL')
    const user = await this.prisma.user.findUnique({ where: { id: userId } })
    if (!user || !target || user.notificationEmail !== target) {
      throw new AppError(400, 'TOKEN_INVALID', 'Tautan tidak valid atau sudah dipakai.')
    }

    await this.prisma.user.update({ where: { id: userId }, data: { notificationEmailVerifiedAt: new Date() } })
    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: `${user.username}@member`,
      action: 'team.member_email_verified',
      detail: maskEmail(target),
      ip: ctx.ip,
    })
  }

  private async sendEmailVerification(o: Owner, userId: string, username: string, email: string) {
    const raw = await this.tokens.issue(userId, 'VERIFY_NOTIFICATION_EMAIL', EMAIL_TOKEN_TTL_MS, email)
    void this.mail.send(
      email,
      memberEmailVerifyMail({
        account: o.alias,
        username,
        link: `${this.platformUrl}/auth/verify-member-email?token=${encodeURIComponent(raw)}`,
      }),
    )
  }
}