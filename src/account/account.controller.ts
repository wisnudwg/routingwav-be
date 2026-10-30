import { Body, Controller, Get, Put, Query, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import type { AuthContext } from '../auth/auth.types'
import { CurrentAuth } from '../common/decorators'
import { ApiZodBody, ApiZodResponse } from '../common/openapi'
import { ctxOf } from '../common/request'
import { perMinute } from '../common/throttle'
import { ZodPipe } from '../common/zod.pipe'
import { RequirePermission } from '../permissions/require-permission'
import {
  activityPageSchema,
  activityQuerySchema,
  profileEnvelopeSchema,
  updateProfileSchema,
  type ActivityQuery,
  type UpdateProfileInput,
} from './account.schemas'
import { AccountService } from './account.service'

@ApiTags('account')
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('profile')
  @RequirePermission('account:manage')
  @ApiZodResponse(200, profileEnvelopeSchema)
  profile(@CurrentAuth() auth: AuthContext) {
    return this.account.getProfile(auth)
  }

  @Put('profile')
  @RequirePermission('account:manage')
  @Throttle(perMinute(20))
  @ApiZodBody(updateProfileSchema)
  @ApiZodResponse(200, profileEnvelopeSchema)
  update(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(updateProfileSchema)) body: UpdateProfileInput,
    @Req() req: Request,
  ) {
    return this.account.updateProfile(auth, body, ctxOf(req))
  }

  @Get('activity')
  @RequirePermission('activity:view')
  @ApiZodResponse(200, activityPageSchema)
  activity(@CurrentAuth() auth: AuthContext, @Query(new ZodPipe(activityQuerySchema)) query: ActivityQuery) {
    return this.account.activity(auth, query)
  }
}