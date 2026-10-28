import { Body, Controller, Get, HttpCode, Post, Req, Res } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { Request, Response } from 'express'
import { AllowPending, CurrentAuth, Public } from '../common/decorators'
import { ctxOf } from '../common/request'
import { SESSION_COOKIE } from '../common/session-cookie'
import { ZodPipe } from '../common/zod.pipe'
import {
  changePasswordSchema,
  completeProfileSchema,
  emailOnlySchema,
  googleSchema,
  registerSchema,
  resetPasswordSchema,
  signInIamSchema,
  signInRootSchema,
  verifyEmailSchema,
  type CompleteProfileInput,
  type RegisterInput,
  type SignInIamInput,
  type SignInRootInput,
} from './auth.schemas'
import type { AuthContext } from './auth.types'
import { AuthService } from './auth.service'
import { SessionService } from './session.service'
import { toSessionView } from './session.view'
import type { z } from 'zod'

const perMinute = (limit: number) => ({ default: { limit, ttl: 60_000 } })
const previousToken = (req: Request): string | undefined => {
  const v: unknown = req.cookies?.[SESSION_COOKIE]
  return typeof v === 'string' && v ? v : undefined
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Throttle(perMinute(5))
  @Post('register')
  @HttpCode(202)
  async register(@Body(new ZodPipe(registerSchema)) body: RegisterInput, @Req() req: Request) {
    await this.auth.register(body, ctxOf(req))
    return { ok: true }
  }

  @Public()
  @Throttle(perMinute(10))
  @Post('verify-email')
  @HttpCode(200)
  async verifyEmail(@Body(new ZodPipe(verifyEmailSchema)) body: z.infer<typeof verifyEmailSchema>, @Req() req: Request) {
    await this.auth.verifyEmail(body.token, ctxOf(req))
    return { ok: true }
  }

  @Public()
  @Throttle(perMinute(3))
  @Post('resend-verification')
  @HttpCode(202)
  resend(@Body(new ZodPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>) {
    this.auth.resendVerification(body.email)
    return { ok: true }
  }

  @Public()
  @Throttle(perMinute(10))
  @Post('sign-in/root')
  @HttpCode(200)
  async signInRoot(
    @Body(new ZodPipe(signInRootSchema)) body: SignInRootInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, session } = await this.auth.signInRoot(body, ctxOf(req), previousToken(req))
    this.sessions.setCookie(res, token)
    return { session }
  }

  @Public()
  @Throttle(perMinute(10))
  @Post('sign-in/iam')
  @HttpCode(200)
  async signInIam(
    @Body(new ZodPipe(signInIamSchema)) body: SignInIamInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, session } = await this.auth.signInIam(body, ctxOf(req), previousToken(req))
    this.sessions.setCookie(res, token)
    return { session }
  }

  @Public()
  @Throttle(perMinute(10))
  @Post('google')
  @HttpCode(200)
  async google(
    @Body(new ZodPipe(googleSchema)) body: z.infer<typeof googleSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { token, session } = await this.auth.signInWithGoogle(body.idToken, ctxOf(req), previousToken(req))
    this.sessions.setCookie(res, token)
    return { session }
  }

  @AllowPending()
  @Get('session')
  session(@CurrentAuth() auth: AuthContext) {
    return { session: toSessionView(auth) }
  }

  @AllowPending()
  @Post('sign-out')
  @HttpCode(204)
  async signOut(
    @CurrentAuth() auth: AuthContext,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.signOut(auth, ctxOf(req))
    this.sessions.clearCookie(res)
  }

  @Public()
  @Throttle(perMinute(5))
  @Post('forgot-password')
  @HttpCode(202)
  forgot(@Body(new ZodPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>, @Req() req: Request) {
    this.auth.forgotPassword(body.email, ctxOf(req))
    return { ok: true }
  }

  @Public()
  @Throttle(perMinute(10))
  @Post('reset-password')
  @HttpCode(200)
  async reset(@Body(new ZodPipe(resetPasswordSchema)) body: z.infer<typeof resetPasswordSchema>, @Req() req: Request) {
    await this.auth.resetPassword(body.token, body.password, ctxOf(req))
    return { ok: true }
  }

  @AllowPending()
  @Throttle(perMinute(10))
  @Post('change-password')
  @HttpCode(200)
  changePassword(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(changePasswordSchema)) body: z.infer<typeof changePasswordSchema>,
    @Req() req: Request,
  ) {
    return this.auth.changePassword(auth, body.password, ctxOf(req))
  }

  @AllowPending()
  @Throttle(perMinute(10))
  @Post('complete-profile')
  @HttpCode(200)
  completeProfile(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(completeProfileSchema)) body: CompleteProfileInput,
    @Req() req: Request,
  ) {
    return this.auth.completeProfile(auth, body, ctxOf(req))
  }
}