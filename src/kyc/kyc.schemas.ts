import { z } from 'zod'
import { ENTITY_TYPES, KYC_DOC_KINDS } from './kyc.rules'

export const docKindSchema = z.enum(KYC_DOC_KINDS)

const name = z
  .string()
  .trim()
  .transform((s) => s.replace(/\s+/g, ' '))
  .pipe(z.string().min(2, 'Isi nama dengan benar').max(120))
const nik = z.string().regex(/^\d{16}$/, 'NIK harus 16 digit angka')
const npwp = z.string().regex(/^\d{15,16}$/, 'NPWP harus 15 atau 16 digit')
const nib = z.string().regex(/^\d{13}$/, 'NIB harus 13 digit')
const consent = z.literal(true, { error: 'Anda harus menyetujui pemrosesan data identitas' })
const documents = z.partialRecord(docKindSchema, z.uuid())

export const submissionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('individual'), fullName: name, nik, npwp: npwp.optional(), consent, documents }),
  z.object({
    type: z.literal('business'),
    entityType: z.enum(ENTITY_TYPES, { error: 'Pilih jenis badan usaha' }),
    legalName: name,
    nib,
    npwp,
    repName: name,
    repNik: nik,
    consent,
    documents,
  }),
])
export type SubmissionInput = z.infer<typeof submissionSchema>

export const createUploadSchema = z.object({
  kind: docKindSchema,
  contentType: z.string().trim().toLowerCase().max(100),
  size: z.number().int().positive(),
  filename: z.string().trim().min(1).max(200),
})
export type CreateUploadInput = z.infer<typeof createUploadSchema>

export const revealSchema = z.object({ field: z.enum(['nik', 'npwp', 'nib', 'repNik']) })
export const devDecideSchema = z.object({ decision: z.enum(['verified', 'rejected']) })
export const idParamSchema = z.uuid()

/* ---------- responses (documentation + typing) ---------- */

export const kycStatusSchema = z.object({ status: z.enum(['not_started', 'in_review', 'verified', 'rejected']) })

export const kycSummarySchema = z.object({
  status: z.enum(['not_started', 'in_review', 'verified', 'rejected']),
  updatePending: z.boolean(),
  updateRejection: z.object({ reason: z.string(), at: z.string() }).nullable(),
  type: z.enum(['individual', 'business']).nullable(),
  submittedAt: z.string().nullable(),
  decidedAt: z.string().nullable(),
  rejectionReason: z.string().nullable(),
  reference: z.string().nullable(),
  names: z.object({
    fullName: z.string().nullable(),
    legalName: z.string().nullable(),
    entityType: z.string().nullable(),
    repName: z.string().nullable(),
  }),
  masked: z.record(z.string(), z.string()),
  docs: z.array(
    z.object({
      id: z.uuid(),
      kind: docKindSchema,
      name: z.string(),
      size: z.number(),
      contentType: z.string(),
      uploadedAt: z.string(),
    }),
  ),
  action: z.object({ type: z.literal('redirect'), url: z.string(), expiresAt: z.string() }).nullable(),
})
export type KycSummaryView = z.infer<typeof kycSummarySchema>

export const uploadSlotSchema = z.object({
  documentId: z.uuid(),
  url: z.string(),
  fields: z.record(z.string(), z.string()),
  maxBytes: z.number(),
})
export const revealResultSchema = z.object({ value: z.string() })
export const viewResultSchema = z.object({ url: z.string(), contentType: z.string(), expiresInSeconds: z.number() })