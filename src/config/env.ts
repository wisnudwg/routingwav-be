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

const key32 = z.string().refine((s) => Buffer.from(s, 'base64').length === 32, 'Harus 32 byte dalam base64')
const optionalKey32 = optional.pipe(key32.optional())

export const envSchema = z
  .object({
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

    AWS_REGION: z.string().default('ap-southeast-3'),
    S3_ENDPOINT: optional,
    S3_ACCESS_KEY_ID: optional,
    S3_SECRET_ACCESS_KEY: optional,
    S3_FORCE_PATH_STYLE: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    KYC_BUCKET: z.string().min(3),
    KYC_MASTER_KEY: optionalKey32,
    KYC_KMS_KEY_ID: optional,
    KYC_INDEX_KEY: key32,
    KYC_PROVIDER: z.enum(['mock']).default('mock'),
    KYC_WEBHOOK_SECRET: z.string().min(16),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message })
    if (v.NODE_ENV === 'production') {
      if (!v.KYC_KMS_KEY_ID) add('KYC_KMS_KEY_ID', 'Wajib di production (kunci disimpan di KMS)')
      if (v.KYC_PROVIDER === 'mock') add('KYC_PROVIDER', 'Provider mock tidak boleh dipakai di production')
    } else if (!v.KYC_KMS_KEY_ID && !v.KYC_MASTER_KEY) {
      add('KYC_MASTER_KEY', 'Isi KYC_MASTER_KEY (dev) atau KYC_KMS_KEY_ID')
    }
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