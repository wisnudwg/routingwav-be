import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post, Req } from '@nestjs/common'
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
import { KycDocumentsService } from './kyc-documents.service'
import type { IdField } from './kyc.rules'
import {
  createUploadSchema,
  idParamSchema,
  kycStatusSchema,
  kycSummarySchema,
  revealResultSchema,
  revealSchema,
  submissionSchema,
  uploadSlotSchema,
  viewResultSchema,
  type CreateUploadInput,
  type SubmissionInput,
} from './kyc.schemas'
import { KycService } from './kyc.service'

const NO_STORE = 'no-store'

@ApiTags('kyc')
@Controller('kyc')
export class KycController {
  constructor(
    private readonly kyc: KycService,
    private readonly docs: KycDocumentsService,
  ) {}

  /** Any signed-in member of the account: team members need the status to know whether payouts are possible */
  @Get('status')
  @ApiZodResponse(200, kycStatusSchema)
  status(@CurrentAuth() auth: AuthContext) {
    return this.kyc.status(auth)
  }

  @Get()
  @RequirePermission('account:manage')
  @ApiZodResponse(200, kycSummarySchema)
  summary(@CurrentAuth() auth: AuthContext) {
    return this.kyc.summary(auth)
  }

  @Post('documents')
  @HttpCode(201)
  @RequirePermission('account:manage')
  @Throttle(perMinute(30))
  @ApiZodBody(createUploadSchema)
  @ApiZodResponse(201, uploadSlotSchema)
  createUpload(@CurrentAuth() auth: AuthContext, @Body(new ZodPipe(createUploadSchema)) body: CreateUploadInput) {
    return this.docs.createUpload(auth, body)
  }

  @Post('documents/:id/complete')
  @HttpCode(204)
  @RequirePermission('account:manage')
  @Throttle(perMinute(30))
  async complete(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idParamSchema)) id: string) {
    await this.docs.complete(auth, id)
  }

  @Delete('documents/:id')
  @HttpCode(204)
  @RequirePermission('account:manage')
  @Throttle(perMinute(30))
  async remove(@CurrentAuth() auth: AuthContext, @Param('id', new ZodPipe(idParamSchema)) id: string) {
    await this.docs.remove(auth, id)
  }

  @Post('submissions')
  @HttpCode(201)
  @RequirePermission('account:manage')
  @Throttle(perMinute(5))
  @ApiZodBody(submissionSchema)
  @ApiZodResponse(201, kycSummarySchema)
  submit(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(submissionSchema)) body: SubmissionInput,
    @Req() req: Request,
  ) {
    return this.kyc.submit(auth, body, ctxOf(req))
  }

  @Post('reveal')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  @RequirePermission('identity:reveal')
  @Throttle(perMinute(10))
  @ApiZodBody(revealSchema)
  @ApiZodResponse(200, revealResultSchema)
  reveal(
    @CurrentAuth() auth: AuthContext,
    @Body(new ZodPipe(revealSchema)) body: { field: IdField },
    @Req() req: Request,
  ) {
    return this.kyc.reveal(auth, body.field, ctxOf(req))
  }

  @Post('documents/:id/view')
  @HttpCode(200)
  @Header('Cache-Control', NO_STORE)
  @RequirePermission('identity:reveal')
  @Throttle(perMinute(10))
  @ApiZodResponse(200, viewResultSchema)
  view(
    @CurrentAuth() auth: AuthContext,
    @Param('id', new ZodPipe(idParamSchema)) id: string,
    @Req() req: Request,
  ) {
    return this.kyc.viewDocument(auth, id, ctxOf(req))
  }
}