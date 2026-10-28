import { z } from 'zod'

const optional = z
  .string()
  .optional()
  .transform((v) => v?.trim() || undefined)

const origins = z
  .string()
  .transform((s) =>
    s
      .split(',')
      .map((x) => x.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  )
  .pipe(z.array(z.url()).min(1))

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  APP_ORIGINS: origins,
  PLATFORM_URL: z.url().transform((s) => s.replace(/\/+$/, '')),
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  SESSION_IDLE_DAYS: z.coerce.number().positive().default(7),
  SESSION_ABSOLUTE_DAYS: z.coerce.number().positive().default(30),
  MAIL_FROM: z.string().min(3).default('Routing.com <no-reply@routing.local>'),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(1025),
  SMTP_USER: optional,
  SMTP_PASS: optional,
  GOOGLE_CLIENT_ID: optional,
})

export type Env = z.infer<typeof envSchema>

export function validateEnv(raw: Record<string, unknown>): Env {
  const parsed = envSchema.safeParse(raw)
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    throw new Error(`Invalid environment:\n${lines.join('\n')}`)
  }
  return parsed.data
}