import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Req,
} from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import type { z } from 'zod'
import type { AuthContext } from '../auth/auth.types'
import { emailOnlySchema } from '../auth/auth.schemas'
import { CurrentAuth } from '../common/decorators'
import { ApiZodBody, ApiZodResponse } from '../common/openapi'
import { ctxOf } from '../common/request'
import { perMinute } from '../common/throttle'
import { ZodPipe } from '../common/zod.pipe'
import { RequirePermission } from '../permissions/require-permission'
import {
  createMemberSchema,
  credentialsSchema,
  idSchema,
  memberEnvelopeSchema,
  memberListSchema,
  updateMemberSchema,
  type CreateMemberInput,
  type UpdateMemberInput,
} from './team.schemas'
import { TeamService } from './team.service'

const NO_STORE = 'no-store'

@ApiTags('team')
@RequirePermission('team:manage')
@Controller('team')
export class TeamController {
  constructor(private readonly team: TeamService) {}

  @Get()
  @ApiZodResponse(200, memberListSchema)
  list(@CurrentAuth() auth: AuthContext) {
    return this.team.list(auth)
  }

  @Get(':id')
  @ApiZodResponse(200, memberEnvelopeSchema)
  get(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string) {
    return this.team.get(auth, id)
  }

  /** Returns the temporary password exactly once */
  @Post()
  @HttpCode(201)
  @Header('Cache-Control', NO_STORE)
  @Throttle(perMinute(30))
  @ApiZodBody(createMemberSchema)
  @ApiZodResponse(201, credentialsSchema)
  create(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(createMemberSchema)) body: CreateMemberInput,
    @Req() req: Request,
  ) {
    return this.team.create(auth, body, ctxOf(req))
  }

  @Patch(':id')
  @Throttle(perMinute(30))
  @ApiZodBody(updateMemberSchema)
  @ApiZodResponse(200, memberEnvelopeSchema)
  update(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(updateMemberSchema)) body: UpdateMemberInput,
    @Req() req: Request,
  ) {
    return this.team.update(auth, id, body, ctxOf(req))
  }

  @Post(':id/disable')
  @HttpCode(200)
  @Throttle(perMinute(30))
  @ApiZodResponse(200, memberEnvelopeSchema)
  disable(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string, @Req() req: Request) {
    return this.team.setStatus(auth, id, 'DISABLED', ctxOf(req))
  }

  @Post(':id/enable')
  @HttpCode(200)
  @Throttle(perMinute(30))
  @ApiZodResponse(200, memberEnvelopeSchema)
  enable(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string, @Req() req: Request) {
    return this.team.setStatus(auth, id, 'ACTIVE', ctxOf(req))
  }

  /** Returns a new temporary password exactly once, and signs the member out everywhere */
  @Post(':id/reset-password')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  @Throttle(perMinute(30))
  @ApiZodResponse(200, credentialsSchema)
  resetPassword(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Req() req: Request,
  ) {
    return this.team.resetPassword(auth, id, ctxOf(req))
  }

  @Delete(':id')
  @HttpCode(204)
  @Throttle(perMinute(30))
  async remove(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string, @Req() req: Request) {
    await this.team.remove(auth, id, ctxOf(req))
  }

  @Put(':id/email')
  @Throttle(perMinute(10))
  @ApiZodBody(emailOnlySchema)
  @ApiZodResponse(200, memberEnvelopeSchema)
  setEmail(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ZodPipe(idSchema)) id: string,
    @Body(new ZodPipe(emailOnlySchema)) body: z.infer<typeof emailOnlySchema>,
    @Req() req: Request,
  ) {
    return this.team.setEmail(auth, id, body.email, ctxOf(req))
  }

  @Post(':id/email/resend')
  @HttpCode(202)
  @Throttle(perMinute(5))
  async resendEmail(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string) {
    await this.team.resendEmail(auth, id)
    return { ok: true }
  }

  @Delete(':id/email')
  @Throttle(perMinute(10))
  @ApiZodResponse(200, memberEnvelopeSchema)
  removeEmail(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idSchema)) id: string, @Req() req: Request) {
    return this.team.removeEmail(auth, id, ctxOf(req))
  }
}