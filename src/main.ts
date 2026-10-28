import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { ErrorFilter } from './common/error.filter'
import type { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true })) // correct client IPs behind a load balancer
  app.use(helmet())
  app.use(cookieParser())

  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] })
  app.enableCors({
    origin: config.get('APP_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  })
  app.useGlobalFilters(new ErrorFilter())
  app.enableShutdownHooks()

  await app.listen(config.get('PORT', { infer: true }))
}

void bootstrap()