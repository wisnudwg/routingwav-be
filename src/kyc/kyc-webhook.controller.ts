import { Controller, HttpCode, Post, Req, type RawBodyRequest } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import { AppError } from '../common/app-error'
import { Public } from '../common/decorators'
import { perMinute } from '../common/throttle'
import { KycDecisionService } from './kyc-decision.service'
import { KycProvider } from './kyc.provider'

@ApiExcludeController()
@Controller('webhooks')
export class KycWebhookController {
  constructor(
    private readonly provider: KycProvider,
    private readonly decisions: KycDecisionService,
  ) {}

  /** Called by the provider's servers. No cookie, no CORS: authenticity comes from the signature alone. */
  @Public()
  @Throttle(perMinute(600))
  @Post('kyc')
  @HttpCode(200)
  async receive(@Req() req: RawBodyRequest<Request>) {
    const raw = req.rawBody
    if (!raw) throw new AppError(400, 'BAD_REQUEST', 'Permintaan tidak valid.')

    const event = this.provider.parseWebhook(req.headers, raw)
    if (!event) throw new AppError(401, 'INVALID_SIGNATURE', 'Tanda tangan tidak valid.')

    return { ok: true, outcome: await this.decisions.apply(this.provider.name, event) }
  }
}