import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { AuditService } from '../audit/audit.service'
import { AppError, isUniqueViolation } from '../common/app-error'
import { toE164 } from '../common/phone'
import type { RequestCtx } from '../common/request'
import { TERMS_VERSION } from '../common/rules/roles'
import type { Env } from '../config/env'
import { MailService } from '../mail/mail.service'
import {
  alreadyRegisteredMail,
  passwordChangedMail,
  resetPasswordMail,
  verifyEmailMail,
} from '../mail/templates'
import { PrismaService } from '../prisma/prisma.service'
import type {
  CompleteProfileInput,
  RegisterInput,
  SignInIamInput,
  SignInRootInput,
} from './auth.schemas'
import { makeContext, userArgs, type AuthContext, type UserFull } from './auth.types'
import { GoogleAuthService } from './google-auth.service'
import { PasswordService } from './password.service'
import { SessionService } from './session.service'
import { toSessionView } from './session.view'
import { TokenService } from '../tokens/tokens.service'

const VERIFY_TTL_MS = 24 * 3_600_000
const RESET_TTL_MS = 60 * 60_000
const RESEND_COOLDOWN_MS = 60_000
const MAX_FAILED_LOGINS = 5
const LOCK_MS = 15 * 60_000

const invalidCredentials = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'Kredensial tidak valid. Periksa kembali data Anda.')

const labelOf = (u: UserFull) =>
  u.type === 'ROOT' ? (u.email as string) : `${u.username}@${u.account?.alias ?? '?'}`

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name)
  private readonly platformUrl: string

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly googleAuth: GoogleAuthService,
    private readonly mail: MailService,
    private readonly audit: AuditService,
    private readonly tokens: TokenService,
    config: ConfigService<Env, true>,
  ) {
    this.platformUrl = config.get('PLATFORM_URL', { infer: true })
  }

  /* ------------------------------------------------------------------ register */

  async register(input: RegisterInput, ctx: RequestCtx): Promise<void> {
    // Hash first, so this request costs the same whether or not the email is taken
    const passwordHash = await this.passwords.hash(input.password)

    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true },
    })
    if (existing) {
      void this.mail.send(
        input.email,
        alreadyRegisteredMail({
          signInUrl: `${this.platformUrl}/auth/sign-in`,
          forgotUrl: `${this.platformUrl}/auth/forgot-password`,
        }),
      )
      await this.audit.record({ actorLabel: 'anonymous', action: 'auth.register_existing_email', ip: ctx.ip })
      return // same response as a real registration
    }

    const phone = toE164(input.phoneCountry, input.phoneNumber) as string

    try {
      const { user, account } = await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: { alias: input.accountAlias, phone, country: input.country, address: input.address },
        })
        const user = await tx.user.create({
          data: {
            type: 'ROOT',
            accountId: account.id,
            email: input.email,
            name: input.name,
            passwordHash,
            termsAcceptedAt: new Date(),
            termsVersion: TERMS_VERSION,
          },
        })
        await tx.profile.create({
          data: {
            accountId: account.id,
            kind: input.kind === 'talent' ? 'TALENT' : 'CLIENT',
            roles: input.roles,
            otherRole: input.roles.includes('Other') ? input.otherRole : null,
            instruments: input.kind === 'talent' && input.roles.includes('Session Player') ? input.instruments : null,
          },
        })
        return { user, account }
      })

      const raw = await this.tokens.issue(user.id, 'VERIFY_EMAIL', VERIFY_TTL_MS)
      void this.mail.send(
        input.email,
        verifyEmailMail({
          name: input.name,
          link: `${this.platformUrl}/auth/verify-email?token=${encodeURIComponent(raw)}`,
        }),
      )
      await this.audit.record({
        accountId: account.id,
        actorId: user.id,
        actorLabel: input.email,
        action: 'auth.register',
        ip: ctx.ip,
      })
    } catch (e) {
      if (!isUniqueViolation(e)) throw e
      const taken = await this.prisma.account.findUnique({ where: { alias: input.accountAlias }, select: { id: true } })
      if (taken) {
        throw new AppError(409, 'ALIAS_TAKEN', 'ID akun sudah dipakai, coba yang lain.', {
          fields: { accountAlias: 'ID akun sudah dipakai, coba yang lain.' },
        })
      }
      // Lost a race on the email: stay generic
    }
  }

  /* -------------------------------------------------------------- email verify */

  async verifyEmail(raw: string, ctx: RequestCtx): Promise<void> {
    const { userId } = await this.tokens.consume(raw, 'VERIFY_EMAIL')
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
    })
    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: user.email ?? 'unknown',
      action: 'auth.email_verified',
      ip: ctx.ip,
    })
  }

  /** Responds immediately; the work happens in the background so timing reveals nothing */
  resendVerification(email: string): void {
    void this.doResendVerification(email).catch((e) => this.log.error(String(e)))
  }

  private async doResendVerification(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.emailVerifiedAt || !user.passwordHash) return
    if (await this.tokens.recent(user.id, 'VERIFY_EMAIL')) return

    const raw = await this.tokens.issue(user.id, 'VERIFY_EMAIL', VERIFY_TTL_MS)
    await this.mail.send(
      email,
      verifyEmailMail({
        name: user.name,
        link: `${this.platformUrl}/auth/verify-email?token=${encodeURIComponent(raw)}`,
      }),
    )
  }

  /* ------------------------------------------------------------------ sign in */

  async signInRoot(input: SignInRootInput, ctx: RequestCtx, previous?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email }, include: userArgs.include })
    const ok = await this.passwords.verify(user?.passwordHash, input.password)
    const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now()

    if (!user || user.type !== 'ROOT' || !ok || locked) {
      await this.recordFailure(user, locked, ctx)
      throw invalidCredentials()
    }
    // Only revealed after the password was correct
    if (!user.emailVerifiedAt) {
      throw new AppError(
        403,
        'EMAIL_UNVERIFIED',
        'Email Anda belum diverifikasi. Cek kotak masuk atau kirim ulang email verifikasi.',
      )
    }
    return this.startSession(user, ctx, previous, 'password')
  }

  async signInIam(input: SignInIamInput, ctx: RequestCtx, previous?: string) {
    const account = await this.prisma.account.findUnique({ where: { alias: input.account }, select: { id: true } })
    const user = account
      ? await this.prisma.user.findFirst({
          where: { accountId: account.id, username: input.username, type: 'IAM' },
          include: userArgs.include,
        })
      : null
    const ok = await this.passwords.verify(user?.passwordHash, input.password)
    const locked = !!user?.lockedUntil && user.lockedUntil.getTime() > Date.now()

    if (!user || !ok || locked) {
      await this.recordFailure(user, locked, ctx)
      throw invalidCredentials()
    }
    if (user.status !== 'ACTIVE') {
      throw new AppError(403, 'ACCOUNT_DISABLED', 'Akun ini dinonaktifkan. Hubungi pemilik akun Anda.')
    }
    if (user.mustChangePassword && user.tempPasswordExpiresAt && user.tempPasswordExpiresAt.getTime() < Date.now()) {
      throw new AppError(403, 'TEMP_PASSWORD_EXPIRED', 'Password sementara sudah kedaluwarsa. Minta pemilik akun membuat yang baru.')
    }
    return this.startSession(user, ctx, previous, 'password')
  }

  async signInWithGoogle(idToken: string, ctx: RequestCtx, previous?: string) {
    const g = await this.googleAuth.verify(idToken)

    let user = await this.prisma.user.findUnique({ where: { googleSub: g.sub }, include: userArgs.include })

    if (!user) {
      // Never auto-link to an existing password account: that is an account-takeover path
      const sameEmail = await this.prisma.user.findUnique({ where: { email: g.email }, select: { id: true } })
      if (sameEmail) {
        throw new AppError(
          409,
          'GOOGLE_EMAIL_EXISTS',
          'Email ini sudah terdaftar dengan password. Masuk dengan email dan password.',
        )
      }
      try {
        user = await this.prisma.user.create({
          data: { type: 'ROOT', email: g.email, name: g.name ?? null, googleSub: g.sub, emailVerifiedAt: new Date() },
          include: userArgs.include,
        })
      } catch (e) {
        if (isUniqueViolation(e)) throw new AppError(409, 'CONFLICT', 'Silakan coba lagi.')
        throw e
      }
    }

    return this.startSession(user, ctx, previous, 'google')
  }

  async signOut(auth: AuthContext, ctx: RequestCtx) {
    await this.prisma.session.deleteMany({ where: { id: auth.sessionId } })
    await this.audit.record({
      accountId: auth.user.accountId,
      actorId: auth.user.id,
      actorLabel: labelOf(auth.user),
      action: 'auth.sign_out',
      ip: ctx.ip,
    })
  }

  /* ----------------------------------------------------------- password flows */

  forgotPassword(email: string, ctx: RequestCtx): void {
    void this.doForgotPassword(email, ctx).catch((e) => this.log.error(String(e)))
  }

  private async doForgotPassword(email: string, ctx: RequestCtx) {
    const user = await this.prisma.user.findUnique({ where: { email } })
    if (!user || user.type !== 'ROOT') return
    if (await this.tokens.recent(user.id, 'RESET_PASSWORD')) return

    const raw = await this.tokens.issue(user.id, 'RESET_PASSWORD', RESET_TTL_MS)
    await this.mail.send(
      email,
      resetPasswordMail({ link: `${this.platformUrl}/auth/reset-password?token=${encodeURIComponent(raw)}` }),
    )
    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: email,
      action: 'auth.password_reset_requested',
      ip: ctx.ip,
    })
  }

  async resetPassword(raw: string, newPassword: string, ctx: RequestCtx): Promise<void> {
    const { userId } = await this.tokens.consume(raw, 'RESET_PASSWORD')
    const passwordHash = await this.passwords.hash(newPassword)
    const current = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } })

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash,
        failedLoginCount: 0,
        lockedUntil: null,
        // Receiving the reset email proves the mailbox is theirs
        emailVerifiedAt: current.emailVerifiedAt ?? new Date(),
      },
    })
    await this.sessions.revokeAllForUser(userId)

    if (user.email) {
      void this.mail.send(user.email, passwordChangedMail({ forgotUrl: `${this.platformUrl}/auth/forgot-password` }))
    }
    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: user.email ?? 'unknown',
      action: 'auth.password_reset',
      ip: ctx.ip,
    })
  }

  /** IAM first sign-in with a temporary password */
  async changePassword(auth: AuthContext, newPassword: string, ctx: RequestCtx) {
    const u = auth.user
    if (!u.mustChangePassword) {
      throw new AppError(409, 'NOT_REQUIRED', 'Penggantian password tidak diperlukan.')
    }
    if (await this.passwords.verify(u.passwordHash, newPassword)) {
      throw new AppError(400, 'VALIDATION', 'Password baru tidak boleh sama dengan password sementara.', {
        fields: { password: 'Password baru tidak boleh sama dengan password sementara.' },
      })
    }

    const passwordHash = await this.passwords.hash(newPassword)
    const fresh = await this.prisma.user.update({
      where: { id: u.id },
      data: { passwordHash, mustChangePassword: false, tempPasswordExpiresAt: null },
      include: userArgs.include,
    })
    await this.sessions.revokeAllForUser(u.id, auth.sessionId) // keep only this session

    await this.audit.record({
      accountId: fresh.accountId,
      actorId: fresh.id,
      actorLabel: labelOf(fresh),
      action: 'auth.password_changed',
      ip: ctx.ip,
    })
    return { session: toSessionView(makeContext(auth.sessionId, fresh)) }
  }

  /* ----------------------------------------------------------- complete profile */

  async completeProfile(auth: AuthContext, input: CompleteProfileInput, ctx: RequestCtx) {
    const u = auth.user
    if (u.type !== 'ROOT' || u.accountId) {
      throw new AppError(409, 'ALREADY_COMPLETED', 'Profil akun sudah dilengkapi.')
    }
    const phone = toE164(input.phoneCountry, input.phoneNumber) as string

    try {
      await this.prisma.$transaction(async (tx) => {
        const account = await tx.account.create({
          data: { alias: input.accountAlias, phone, country: input.country, address: input.address },
        })
        // Compare-and-set: only the first of two concurrent requests wins
        const claimed = await tx.user.updateMany({
          where: { id: u.id, accountId: null },
          data: { accountId: account.id, termsAcceptedAt: new Date(), termsVersion: TERMS_VERSION },
        })
        if (claimed.count !== 1) throw new AppError(409, 'ALREADY_COMPLETED', 'Profil akun sudah dilengkapi.')

        await tx.profile.create({
          data: {
            accountId: account.id,
            kind: input.kind === 'talent' ? 'TALENT' : 'CLIENT',
            roles: input.roles,
            otherRole: input.roles.includes('Other') ? input.otherRole : null,
            instruments: input.kind === 'talent' && input.roles.includes('Session Player') ? input.instruments : null,
          },
        })
      })
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new AppError(409, 'ALIAS_TAKEN', 'ID akun sudah dipakai, coba yang lain.', {
          fields: { accountAlias: 'ID akun sudah dipakai, coba yang lain.' },
        })
      }
      throw e
    }

    const fresh = await this.prisma.user.findUniqueOrThrow({ where: { id: u.id }, include: userArgs.include })
    await this.audit.record({
      accountId: fresh.accountId,
      actorId: fresh.id,
      actorLabel: labelOf(fresh),
      action: 'account.profile_completed',
      ip: ctx.ip,
    })
    return { session: toSessionView(makeContext(auth.sessionId, fresh)) }
  }

  /* ------------------------------------------------------------------ internals */

  private async startSession(
    user: UserFull,
    ctx: RequestCtx,
    previous: string | undefined,
    method: 'password' | 'google',
  ) {
    if (previous) await this.sessions.revokeByToken(previous) // never reuse a session across sign-ins

    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null, lastSignInAt: new Date() },
    })
    const created = await this.sessions.create(user.id, ctx)

    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: labelOf(user),
      action: 'auth.sign_in',
      detail: method,
      ip: ctx.ip,
    })
    return { token: created.token, session: toSessionView(makeContext(created.id, user)) }
  }

  private async recordFailure(user: UserFull | null, locked: boolean, ctx: RequestCtx) {
    if (!user) return // unknown identifiers are only rate-limited, never stored
    if (!locked) {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      })
      if (updated.failedLoginCount >= MAX_FAILED_LOGINS) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MS) },
        })
      }
    }
    await this.audit.record({
      accountId: user.accountId,
      actorId: user.id,
      actorLabel: labelOf(user),
      action: 'auth.sign_in_failed',
      detail: locked ? 'locked' : 'bad_credentials',
      ip: ctx.ip,
    })
  }

  
}