import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { KycProvider, type ProviderEvent, type ProviderStartInput, type ProviderStartResult } from './kyc.provider'

const eventSchema = z.object({
  eventId: z.string().min(1).max(100),
  externalRef: z.string().min(1).max(200),
  result: z.enum(['verified', 'rejected']),
  reasonCode: z.string().max(60).optional(),
  verifiedName: z.string().max(200).optional(),
})

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/** Development stand-in. Its webhooks use the same signature + timestamp + idempotency checks a real one needs. */
export class MockKycProvider extends KycProvider {
  readonly name = 'mock'

  constructor(private readonly secret: string) {
    super()
  }

  async start(input: ProviderStartInput): Promise<ProviderStartResult> {
    return { externalRef: `mock-${input.caseId}` }
  }

  sign(body: string) {
    const ts = String(Date.now())
    const sig = createHmac('sha256', this.secret).update(`${ts}.${body}`).digest('hex')
    return { 'x-timestamp': ts, 'x-signature': sig }
  }

  parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): ProviderEvent | null {
    const ts = first(headers['x-timestamp'])
    const sig = first(headers['x-signature'])
    if (!ts || !sig || !Number.isFinite(Number(ts)) || Math.abs(Date.now() - Number(ts)) > 5 * 60_000) return null

    const expected = createHmac('sha256', this.secret).update(`${ts}.`).update(rawBody).digest()
    const given = Buffer.from(sig, 'hex')
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

    try {
      const parsed = eventSchema.safeParse(JSON.parse(rawBody.toString('utf8')))
      return parsed.success ? parsed.data : null
    } catch {
      return null
    }
  }
}