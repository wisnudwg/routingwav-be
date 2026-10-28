import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../prisma/prisma.service'

export type AuditInput = {
  accountId?: string | null
  actorId?: string | null
  actorLabel: string
  action: string
  /** Never put secrets, tokens, or full identity numbers here */
  detail?: string
  ip?: string
}

@Injectable()
export class AuditService {
  private readonly log = new Logger(AuditService.name)

  constructor(private readonly prisma: PrismaService) {}

  async record(e: AuditInput): Promise<void> {
    try {
      await this.prisma.auditEvent.create({
        data: {
          accountId: e.accountId ?? null,
          actorId: e.actorId ?? null,
          actorLabel: e.actorLabel,
          action: e.action,
          detail: e.detail ?? null,
          ip: e.ip ?? null,
        },
      })
    } catch (err) {
      this.log.error(`Audit write failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
}