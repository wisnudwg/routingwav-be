import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { OAuth2Client } from 'google-auth-library'
import { AppError } from '../common/app-error'
import type { Env } from '../config/env'

export type GoogleIdentity = { sub: string; email: string; name?: string }

@Injectable()
export class GoogleAuthService {
  private readonly audience?: string
  private readonly client?: OAuth2Client

  constructor(config: ConfigService<Env, true>) {
    this.audience = config.get('GOOGLE_CLIENT_ID', { infer: true })
    if (this.audience) this.client = new OAuth2Client(this.audience)
  }

  /** Verifies signature, issuer, audience and expiry with Google's public keys */
  async verify(idToken: string): Promise<GoogleIdentity> {
    if (!this.client || !this.audience) {
      throw new AppError(503, 'GOOGLE_DISABLED', 'Login Google belum dikonfigurasi.')
    }
    try {
      const ticket = await this.client.verifyIdToken({ idToken, audience: this.audience })
      const p = ticket.getPayload()
      if (!p?.sub || !p.email || p.email_verified !== true) throw new Error('unusable payload')
      return { sub: p.sub, email: p.email.toLowerCase(), name: p.name }
    } catch {
      throw new AppError(401, 'GOOGLE_INVALID', 'Token Google tidak valid.')
    }
  }
}