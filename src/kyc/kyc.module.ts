import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { IS_PROD } from '../common/session-cookie'
import type { Env } from '../config/env'
import { KycDecisionService } from './kyc-decision.service'
import { KycDevController } from './kyc-dev.controller'
import { KycDocumentsService } from './kyc-documents.service'
import { KycWebhookController } from './kyc-webhook.controller'
import { KycController } from './kyc.controller'
import { KycProvider } from './kyc.provider'
import { KycService } from './kyc.service'
import { MockKycProvider } from './mock-kyc.provider'

@Module({
  controllers: [KycController, KycWebhookController, ...(IS_PROD ? [] : [KycDevController])],
  providers: [
    KycService,
    KycDocumentsService,
    KycDecisionService,
    {
      provide: KycProvider,
      inject: [ConfigService],
      // Add a case per real provider here once you pick one
      useFactory: (config: ConfigService<Env, true>): KycProvider =>
        new MockKycProvider(config.get('KYC_WEBHOOK_SECRET', { infer: true })),
    },
  ],
})
export class KycModule {}