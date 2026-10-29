import { Injectable } from '@nestjs/common'
import { AppError } from '../common/app-error'
import { newToken, sha256 } from '../common/crypto'
import type { TokenPurpose } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'

const COOLDOWN_MS = 60_000

@Injectable()
export class TokenService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only one live token per user and purpose. `target` binds the token to what it verifies (e.g. an address). */
  async issue(userId: string, purpose: TokenPurpose, ttlMs: number, target?: string): Promise<string> {
    await this.prisma.authToken.updateMany({
      where: { userId, purpose, usedAt: null },
      data: { usedAt: new Date() },
    })
    const raw = newToken()
    await this.prisma.authToken.create({
      data: {
        userId,
        purpose,
        target: target ?? null,
        tokenHash: sha256(raw),
        expiresAt: new Date(Date.now() + ttlMs),
      },
    })
    return raw
  }

  /** True if a token of this kind was issued in the last minute (resend cooldown) */
  async recent(userId: string, purpose: TokenPurpose): Promise<boolean> {
    const last = await this.prisma.authToken.findFirst({
      where: { userId, purpose },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    })
    return !!last && Date.now() - last.createdAt.getTime() < COOLDOWN_MS
  }

  /** Atomic single use: two requests can't both consume the same token */
  async consume(raw: string, purpose: TokenPurpose): Promise<{ userId: string; target: string | null }> {
    const tokenHash = sha256(raw)
    const now = new Date()

    const claimed = await this.prisma.authToken.updateMany({
      where: { tokenHash, purpose, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    })
    if (claimed.count === 1) {
      const t = await this.prisma.authToken.findUniqueOrThrow({
        where: { tokenHash },
        select: { userId: true, target: true },
      })
      return t
    }

    const t = await this.prisma.authToken.findUnique({
      where: { tokenHash },
      select: { purpose: true, usedAt: true, expiresAt: true },
    })
    if (t && t.purpose === purpose && !t.usedAt && t.expiresAt <= now) {
      throw new AppError(400, 'TOKEN_EXPIRED', 'Tautan sudah kedaluwarsa.')
    }
    throw new AppError(400, 'TOKEN_INVALID', 'Tautan tidak valid atau sudah dipakai.')
  }
}