import { Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { APP_GUARD } from '@nestjs/core'
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler'
import { AccountsController } from './accounts/accounts.controller'
import { AuditModule } from './audit/audit.module'
import { AuthModule } from './auth/auth.module'
import { OriginGuard } from './common/origin.guard'
import { SessionGuard } from './common/session.guard'
import { validateEnv } from './config/env'
import { HealthController } from './health.controller'
import { MailModule } from './mail/mail.module'
import { MetaController } from './meta/meta.controller'
import { PermissionGuard } from './permissions/permission.guard'
import { PrismaModule } from './prisma/prisma.module'
import { TeamModule } from './team/team.module'
import { TokensModule } from './tokens/tokens.module'

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    // In-memory per instance. Move to a shared store (Redis) when you run more than one API instance.
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    MailModule,
    AuditModule,
    TokensModule,
    AuthModule,
    TeamModule,
  ],
  controllers: [HealthController, AccountsController, MetaController],
  providers: [
    // Order matters: rate limit → origin check → session → permission
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: OriginGuard },
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: PermissionGuard },
  ],
})
export class AppModule {}