import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { Throttle } from '@nestjs/throttler'
import type { Request } from 'express'
import type { AuthContext } from '../auth/auth.types'
import { CurrentAuth } from '../common/decorators'
import { ApiZodBody } from '../common/openapi'
import { ctxOf } from '../common/request'
import { perMinute } from '../common/throttle'
import { ZodPipe } from '../common/zod.pipe'
import { RequirePermission } from '../permissions/require-permission'
import { addProfileSchema, type AddProfileInput } from './profiles.schemas'
import { ProfilesService } from './profiles.service'

@ApiTags('account')
@RequirePermission('account:manage')
@Controller('account/profiles')
export class ProfilesController {
  constructor(private readonly profiles: ProfilesService) {}

  @Post()
  @HttpCode(201)
  @Throttle(perMinute(10))
  @ApiZodBody(addProfileSchema)
  add(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(addProfileSchema)) body: AddProfileInput,
    @Req() req: Request,
  ) {
    return this.profiles.add(auth, body, ctxOf(req))
  }
}