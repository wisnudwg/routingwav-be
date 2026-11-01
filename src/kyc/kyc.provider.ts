import type { ApiDocKind, IdField } from './kyc.rules'

export type ProviderStartInput = {
  caseId: string
  type: 'individual' | 'business'
  names: { fullName?: string; legalName?: string; repName?: string }
  /** Plaintext, in memory only for this call. Never stored or logged. */
  numbers: Partial<Record<IdField, string>>
  /** Short-lived signed links the provider can fetch the documents from */
  documentUrls: Partial<Record<ApiDocKind, string>>
}

export type ProviderStartResult = {
  externalRef: string
  /** Some providers need the person to complete liveness on their hosted page */
  action?: { url: string; expiresAt: Date }
}

export type ProviderEvent = {
  eventId: string
  externalRef: string
  result: 'verified' | 'rejected'
  reasonCode?: string
  /** The name as matched against the registry, if the provider returns it */
  verifiedName?: string
}

/** One adapter per provider. Each knows its own API and how its webhooks are signed. */
export abstract class KycProvider {
  abstract readonly name: string
  abstract start(input: ProviderStartInput): Promise<ProviderStartResult>
  /** Returns null when the signature, timestamp, or format is wrong */
  abstract parseWebhook(headers: Record<string, string | string[] | undefined>, rawBody: Buffer): ProviderEvent | null
}