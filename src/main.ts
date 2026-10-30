import { NestFactory } from '@nestjs/core'
import { ConfigService } from '@nestjs/config'
import type { NestExpressApplication } from '@nestjs/platform-express'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import cookieParser from 'cookie-parser'
import type { NextFunction, Request, Response } from 'express'
import helmet from 'helmet'
import { AppModule } from './app.module'
import { ErrorFilter } from './common/error.filter'
import { SESSION_COOKIE } from './common/session-cookie'
import type { Env } from './config/env'

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)
  const config = app.get<ConfigService<Env, true>>(ConfigService)

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true })) // correct client IPs behind a load balancer
  app.use(helmet())
  app.use(cookieParser())
  // Responses carry sessions and credentials: nothing is cached unless an endpoint says so explicitly
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store')
    next()
  })

  app.setGlobalPrefix('v1', { exclude: ['health', 'health/ready'] })
  app.enableCors({
    origin: config.get('APP_ORIGINS', { infer: true }),
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    allowedHeaders: ['Content-Type'],
    maxAge: 600,
  })
  app.useGlobalFilters(new ErrorFilter())
  app.enableShutdownHooks()

  // Development only: the front end generates its API types from this document
  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    const doc = SwaggerModule.createDocument(
      app,
      // new DocumentBuilder().setTitle('Routing.com API').setVersion('1.0').addCookieAuth(SESSION_COOKIE).build(),
      new DocumentBuilder().setTitle('Routing.com API').setVersion('1.0').setOpenAPIVersion('3.1.0').addCookieAuth(SESSION_COOKIE).build(),
    )
    app.use('/openapi.json', (_req: Request, res: Response) => {
      res.json(doc)
    })
  }

  await app.listen(config.get('PORT', { infer: true }))
}

void bootstrap()