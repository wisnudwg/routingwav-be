import { Controller, Get, Query } from '@nestjs/common'
import { Throttle } from '@nestjs/throttler'
import type { z } from 'zod'
import { aliasQuerySchema } from '../auth/auth.schemas'
import { Public } from '../common/decorators'
import { isAliasWellFormed } from '../common/rules/alias'
import { ZodPipe } from '../common/zod.pipe'
import { PrismaService } from '../prisma/prisma.service'

@Controller('accounts')
export class AccountsController {
  constructor(private readonly prisma: PrismaService) {}

  /** Aliases are public identifiers (team members type them to sign in), so availability isn't a secret */
  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get('alias-available')
  async aliasAvailable(@Query(new ZodPipe(aliasQuerySchema)) q: z.infer<typeof aliasQuerySchema>) {
    if (!isAliasWellFormed(q.alias)) return { available: false }
    const taken = await this.prisma.account.findUnique({ where: { alias: q.alias }, select: { id: true } })
    return { available: !taken }
  }
}