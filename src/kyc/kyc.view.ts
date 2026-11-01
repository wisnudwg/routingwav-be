import type { Prisma } from '../generated/prisma/client'
import { FROM_DB, reasonMessage } from './kyc.rules'
import type { KycSummaryView } from './kyc.schemas'

export type CaseFull = Prisma.KycCaseGetPayload<{ include: { documents: true } }>

/** `statuses` newest first */
export function effectiveStatus(statuses: readonly string[]): KycSummaryView['status'] {
  if (statuses.includes('VERIFIED')) return 'verified'
  if (statuses.includes('IN_REVIEW')) return 'in_review'
  return statuses[0] === 'REJECTED' ? 'rejected' : 'not_started'
}

/** `cases` newest first */
export function buildSummary(cases: CaseFull[], now = new Date()): KycSummaryView {
  const verified = cases.find((c) => c.status === 'VERIFIED')
  const pending = cases.find((c) => c.status === 'IN_REVIEW')
  const newest = cases[0]
  const rejected = newest?.status === 'REJECTED' ? newest : undefined
  const status = effectiveStatus(cases.map((c) => c.status))
  const shown = verified ?? pending ?? rejected

  // Sensitive display data only exists while a case is verified or in review
  const live = status === 'verified' || status === 'in_review' ? shown : undefined

  const action =
    pending?.userActionUrl && pending.userActionExpiresAt && pending.userActionExpiresAt > now
      ? { type: 'redirect' as const, url: pending.userActionUrl, expiresAt: pending.userActionExpiresAt.toISOString() }
      : null

  const updateRejected = !!verified && !!rejected && rejected.submittedAt > verified.submittedAt

  return {
    status,
    updatePending: !!verified && !!pending,
    updateRejection:
      updateRejected && rejected
        ? { reason: reasonMessage(rejected.rejectionCode), at: (rejected.decidedAt ?? rejected.submittedAt).toISOString() }
        : null,
    type: shown ? (shown.type === 'INDIVIDUAL' ? 'individual' : 'business') : null,
    submittedAt: shown?.submittedAt.toISOString() ?? null,
    decidedAt: shown?.decidedAt?.toISOString() ?? null,
    rejectionReason: status === 'rejected' && rejected ? reasonMessage(rejected.rejectionCode) : null,
    reference: shown ? `KYC-${shown.id.slice(0, 8).toUpperCase()}` : null,
    names: {
      fullName: shown?.fullName ?? null,
      legalName: shown?.legalName ?? null,
      entityType: shown?.entityType ?? null,
      repName: shown?.repName ?? null,
    },
    masked: live ? (live.masked as Record<string, string>) : {},
    docs: live
      ? live.documents
          .filter((d) => d.status === 'UPLOADED')
          .map((d) => ({
            id: d.id,
            kind: FROM_DB[d.kind],
            name: d.originalName,
            size: d.size ?? 0,
            contentType: d.contentType,
            uploadedAt: (d.uploadedAt ?? d.createdAt).toISOString(),
          }))
      : [],
    action,
  }
}