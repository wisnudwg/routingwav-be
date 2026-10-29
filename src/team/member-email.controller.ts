import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import type { z } from 'zod'
import { verifyEmailSchema } from '../auth/auth.schemas'
import { Public } from '../common/decorators'
import { ApiZodBody } from '../common/openapi'
import { ctxOf } from '../common/request'
import { perMinute } from '../common/throttle'
import { ZodPipe } from '../common/zod.pipe'
import { TeamService } from './team.service'

@ApiTags('auth')
@Controller('auth')
export class MemberEmailController {
  constructor(private readonly team: TeamService) {}

  @Public()
  @Throttle(perMinute(10))
  @Post('verify-member-email')
  @HttpCode(200)
  @ApiZodBody(verifyEmailSchema)
  async verify(@Body(new ZodPipe(verifyEmailSchema)) body: z.infer<typeof verifyEmailSchema>, @Req() req: Request) {
    await this.team.verifyMemberEmail(body.token, ctxOf(req))
    return { ok: true }
  }
}