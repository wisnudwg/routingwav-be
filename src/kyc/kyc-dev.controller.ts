import { Body, Controller, HttpCode, Post } from '@nestjs/common'
import { ApiExcludeController } from '@nestjs/swagger'
import { randomUUID } from 'node:crypto'
import type { AuthContext } from '../auth/auth.types'
import { AppError } from '../common/app-error'
import { CurrentAuth } from '../common/decorators'
import { ZodPipe } from '../common/zod.pipe'
import { RequirePermission } from '../permissions/require-permission'
import { PrismaService } from '../prisma/prisma.service'
import { KycDecisionService } from './kyc-decision.service'
import { KycProvider } from './kyc.provider'
import { devDecideSchema } from './kyc.schemas'
import { MockKycProvider } from './mock-kyc.provider'

@ApiExcludeController()
@Controller('dev/kyc')
export class KycDevController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: KycProvider,
    private readonly decisions: KycDecisionService,
  ) {}

  /** Builds a signed webhook and feeds it through the exact same checks a real one gets */
  @Post('decide')
  @HttpCode(200)
  @RequirePermission('account:manage')
  async decide(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(devDecideSchema)) body: { decision: 'verified' | 'rejected' },
  ) {
    const accountId = auth.user.accountId
    if (!(this.provider instanceof MockKycProvider) || !accountId) throw new AppError(404, 'NOT_FOUND', 'Tidak ditemukan.')

    const c = await this.prisma.kycCase.findFirst({ where: { accountId, status: 'IN_REVIEW' } })
    if (!c?.externalRef) throw new AppError(409, 'NOTHING_TO_DECIDE', 'Tidak ada pengajuan yang bisa diputuskan.')

    const payload = JSON.stringify({
      eventId: randomUUID(),
      externalRef: c.externalRef,
      result: body.decision,
      reasonCode: body.decision === 'rejected' ? 'DOCUMENT_UNREADABLE' : undefined,
    })
    const event = this.provider.parseWebhook(this.provider.sign(payload), Buffer.from(payload))
    if (!event) throw new AppError(500, 'INTERNAL', 'Gagal membuat event uji.')

    await this.decisions.apply(this.provider.name, event)
    return { ok: true }
  }
}