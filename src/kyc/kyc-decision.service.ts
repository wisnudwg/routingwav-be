import { Injectable, Logger } from '@nestjs/common'
import { AuditService } from '../audit/audit.service'
import { isUniqueViolation } from '../common/app-error'
import { PrismaService } from '../prisma/prisma.service'
import type { ProviderEvent } from './kyc.provider'
import { RETENTION_YEARS } from './kyc.rules'

export type Outcome = 'applied' | 'duplicate' | 'ignored'

const yearsFrom = (d: Date, years: number) => {
  const out = new Date(d)
  out.setUTCFullYear(out.getUTCFullYear() + years)
  return out
}

@Injectable()
export class KycDecisionService {
  private readonly log = new Logger(KycDecisionService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Idempotent: the same provider event can arrive any number of times */
  async apply(provider: string, e: ProviderEvent): Promise<Outcome> {
    try {
      return await this.run(provider, e)
    } catch (err) {
      if (!isUniqueViolation(err)) throw err
      const seen = await this.prisma.kycProviderEvent.findUnique({
        where: { provider_eventId: { provider, eventId: e.eventId } },
      })
      if (seen) return 'duplicate'
      // The identity got verified on another account in the meantime: refuse, without explaining why
      this.log.warn(`Identity clash while verifying external ref ${e.externalRef}`)
      return this.run(provider, { ...e, result: 'rejected', reasonCode: 'UNABLE_TO_VERIFY' })
    }
  }

  private async run(provider: string, e: ProviderEvent): Promise<Outcome> {
    const now = new Date()

    const decided = await this.prisma.$transaction(async (tx) => {
      await tx.kycProviderEvent.create({ data: { provider, eventId: e.eventId } })

      const c = await tx.kycCase.findUnique({ where: { externalRef: e.externalRef } })
      if (!c || c.status !== 'IN_REVIEW') return null

      if (e.result === 'verified') {
        // The previous verified case steps aside first, so the "one verified per account" rule holds throughout
        await tx.kycCase.updateMany({
          where: { accountId: c.accountId, status: 'VERIFIED' },
          data: { status: 'SUPERSEDED', retainUntil: yearsFrom(now, RETENTION_YEARS) },
        })
        await tx.kycCase.update({
          where: { id: c.id },
          data: {
            status: 'VERIFIED',
            decidedAt: now,
            userActionUrl: null,
            userActionExpiresAt: null,
            ...(e.verifiedName ? (c.type === 'INDIVIDUAL' ? { fullName: e.verifiedName } : { legalName: e.verifiedName }) : {}),
          },
        })
      } else {
        await tx.kycCase.update({
          where: { id: c.id },
          data: {
            status: 'REJECTED',
            decidedAt: now,
            rejectionCode: e.reasonCode ?? 'UNABLE_TO_VERIFY',
            retainUntil: yearsFrom(now, RETENTION_YEARS),
            userActionUrl: null,
            userActionExpiresAt: null,
          },
        })
      }
      return { accountId: c.accountId }
    })

    if (!decided) return 'ignored'

    await this.audit.record({
      accountId: decided.accountId,
      actorLabel: 'Sistem verifikasi',
      action: e.result === 'verified' ? 'kyc.verified' : 'kyc.rejected',
      detail: e.result === 'rejected' ? (e.reasonCode ?? 'UNABLE_TO_VERIFY') : undefined,
    })
    return 'applied'
  }
}