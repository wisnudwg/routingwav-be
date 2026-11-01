import { Injectable, Logger } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import { AuditService } from '../audit/audit.service'
import type { AuthContext } from '../auth/auth.types'
import { AppError, isUniqueViolation } from '../common/app-error'
import type { RequestCtx } from '../common/request'
import { FieldCrypto } from '../crypto/field-crypto.service'
import type { KycDocument } from '../generated/prisma/client'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { KycProvider } from './kyc.provider'
import {
  ENC_COLUMN,
  FIELD_LABEL,
  FROM_DB,
  OPTIONAL_DOCS,
  DOC_RULES,
  REQUIRED_DOCS,
  TO_DB,
  extOf,
  maskId,
  type ApiDocKind,
  type IdField,
} from './kyc.rules'
import type { SubmissionInput } from './kyc.schemas'
import { buildSummary, effectiveStatus } from './kyc.view'

const ctxFor = (accountId: string, caseId: string) => `kyc:${accountId}:${caseId}`
const generic = () => new AppError(409, 'KYC_UNABLE', 'Verifikasi tidak dapat dilanjutkan. Hubungi dukungan.')

type Numbers = Partial<Record<IdField, string>>

@Injectable()
export class KycService {
  private readonly log = new Logger(KycService.name)

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FieldCrypto,
    private readonly storage: StorageService,
    private readonly provider: KycProvider,
    private readonly audit: AuditService,
  ) {}

  private owner(auth: AuthContext) {
    const u = auth.user
    if (u.type !== 'ROOT' || !u.accountId) {
      throw new AppError(403, 'FORBIDDEN', 'Hanya pemilik akun yang dapat mengakses data identitas.')
    }
    return { accountId: u.accountId, userId: u.id, label: u.email as string }
  }

  private requireElevated(auth: AuthContext) {
    if (!auth.elevatedUntil || auth.elevatedUntil.getTime() <= Date.now()) {
      throw new AppError(403, 'STEP_UP_REQUIRED', 'Konfirmasi password Anda untuk melanjutkan.')
    }
  }

  /** Status only: safe for every member of the account */
  async status(auth: AuthContext) {
    const accountId = auth.user.accountId
    if (!accountId) return { status: 'not_started' as const }
    const rows = await this.prisma.kycCase.findMany({
      where: { accountId },
      select: { status: true },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    })
    return { status: effectiveStatus(rows.map((r) => r.status)) }
  }

  async summary(auth: AuthContext) {
    const o = this.owner(auth)
    const cases = await this.prisma.kycCase.findMany({
      where: { accountId: o.accountId },
      include: { documents: true },
      orderBy: { submittedAt: 'desc' },
      take: 10,
    })
    return buildSummary(cases)
  }

  /* ------------------------------------------------------------------ submit */

  async submit(auth: AuthContext, input: SubmissionInput, ctx: RequestCtx) {
    const o = this.owner(auth)

    const inReview = await this.prisma.kycCase.findFirst({
      where: { accountId: o.accountId, status: 'IN_REVIEW' },
      select: { id: true },
    })
    if (inReview) throw new AppError(409, 'REVIEW_IN_PROGRESS', 'Pengajuan sebelumnya masih ditinjau.')

    const docs = await this.resolveDocuments(o.accountId, input)

    const n: Numbers =
      input.type === 'individual'
        ? { nik: input.nik, npwp: input.npwp }
        : { nib: input.nib, npwp: input.npwp, repNik: input.repNik }

    // Another account may already hold this identity. Refuse without saying which number clashed.
    const idx = {
      nikIdx: n.nik ? this.crypto.index('nik', n.nik) : null,
      npwpIdx: n.npwp ? this.crypto.index('npwp', n.npwp) : null,
      nibIdx: n.nib ? this.crypto.index('nib', n.nib) : null,
    }
    const or = [
      idx.nikIdx ? { nikIdx: idx.nikIdx } : null,
      idx.npwpIdx ? { npwpIdx: idx.npwpIdx } : null,
      idx.nibIdx ? { nibIdx: idx.nibIdx } : null,
    ].filter((c): c is NonNullable<typeof c> => c !== null)

    const clash =
      or.length > 0 &&
      (await this.prisma.kycCase.findFirst({
        where: { accountId: { not: o.accountId }, status: { in: ['IN_REVIEW', 'VERIFIED'] }, OR: or },
        select: { id: true },
      }))
    if (clash) {
      await this.audit.record({
        accountId: o.accountId,
        actorId: o.userId,
        actorLabel: o.label,
        action: 'kyc.duplicate_blocked',
        ip: ctx.ip,
      })
      throw generic()
    }

    // Encrypt the numbers. The key is wrapped by KMS and bound to this exact case.
    const caseId = randomUUID()
    const dek = this.crypto.newDek()
    const dekWrapped = await this.crypto.wrapDek(dek, ctxFor(o.accountId, caseId))
    const enc = (f: IdField) => (n[f] ? this.crypto.encrypt(dek, n[f] as string, `${caseId}:${f}`) : null)
    const masked = Object.fromEntries(
      (Object.keys(n) as IdField[]).filter((f) => n[f]).map((f) => [f, maskId(n[f] as string)]),
    )

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.kycCase.create({
          data: {
            id: caseId,
            accountId: o.accountId,
            type: input.type === 'individual' ? 'INDIVIDUAL' : 'BUSINESS',
            status: 'IN_REVIEW',
            fullName: input.type === 'individual' ? input.fullName : null,
            entityType: input.type === 'business' ? input.entityType : null,
            legalName: input.type === 'business' ? input.legalName : null,
            repName: input.type === 'business' ? input.repName : null,
            dekWrapped,
            nikEnc: enc('nik'),
            npwpEnc: enc('npwp'),
            nibEnc: enc('nib'),
            repNikEnc: enc('repNik'),
            ...idx,
            masked,
            provider: this.provider.name,
          },
        })
        const attached = await tx.kycDocument.updateMany({
          where: { id: { in: docs.map((d) => d.id) }, accountId: o.accountId, caseId: null, status: 'UPLOADED' },
          data: { caseId },
        })
        if (attached.count !== docs.length) {
          throw new AppError(409, 'DOCUMENT_UNAVAILABLE', 'Dokumen tidak tersedia. Unggah ulang file Anda.')
        }
      })
    } catch (e) {
      if (isUniqueViolation(e)) throw new AppError(409, 'REVIEW_IN_PROGRESS', 'Pengajuan sebelumnya masih ditinjau.')
      throw e
    }

    await this.audit.record({
      accountId: o.accountId,
      actorId: o.userId,
      actorLabel: o.label,
      action: 'kyc.submitted',
      detail: input.type,
      ip: ctx.ip,
    })

    await this.startProvider(caseId, input, n, docs)
    return this.summary(auth)
  }

  /** Never throws: a provider outage must not lose the submission. A sweeper will retry unstarted cases. */
  private async startProvider(caseId: string, input: SubmissionInput, numbers: Numbers, docs: KycDocument[]) {
    try {
      const documentUrls: Partial<Record<ApiDocKind, string>> = {}
      for (const d of docs) {
        const kind = FROM_DB[d.kind]
        documentUrls[kind] = await this.storage.presignGet(d.objectKey, d.contentType, `dokumen-${kind}.${extOf(d.contentType)}`, 900)
      }
      const result = await this.provider.start({
        caseId,
        type: input.type,
        names: input.type === 'individual' ? { fullName: input.fullName } : { legalName: input.legalName, repName: input.repName },
        numbers,
        documentUrls,
      })
      await this.prisma.kycCase.update({
        where: { id: caseId },
        data: {
          externalRef: result.externalRef,
          providerStartedAt: new Date(),
          userActionUrl: result.action?.url ?? null,
          userActionExpiresAt: result.action?.expiresAt ?? null,
        },
      })
    } catch (e) {
      // Message only: never the request, which contained the identity numbers
      this.log.error(`Provider start failed for case ${caseId}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  private async resolveDocuments(accountId: string, input: SubmissionInput): Promise<KycDocument[]> {
    const required = REQUIRED_DOCS[input.type]
    const allowed = [...required, ...OPTIONAL_DOCS[input.type]]
    const entries = Object.entries(input.documents) as [ApiDocKind, string][]

    for (const [kind] of entries) {
      if (!allowed.includes(kind)) {
        throw new AppError(400, 'VALIDATION', 'Dokumen tidak sesuai jenis akun.', {
          fields: { [`documents.${kind}`]: 'Dokumen tidak diperlukan untuk jenis akun ini.' },
        })
      }
    }
    for (const kind of required) {
      if (!input.documents[kind]) {
        const message = `${DOC_RULES[kind].label} wajib diunggah.`
        throw new AppError(400, 'VALIDATION', message, { fields: { [`documents.${kind}`]: message } })
      }
    }

    const rows = await this.prisma.kycDocument.findMany({
      where: { id: { in: entries.map(([, id]) => id) }, accountId, status: 'UPLOADED', caseId: null },
    })
    for (const [kind, id] of entries) {
      const row = rows.find((r) => r.id === id)
      if (!row || row.kind !== TO_DB[kind]) {
        throw new AppError(409, 'DOCUMENT_UNAVAILABLE', 'Dokumen tidak tersedia. Unggah ulang file Anda.')
      }
    }
    return rows
  }

  /* ------------------------------------------------------------------ reveal */

  private async displayCase(accountId: string) {
    const cases = await this.prisma.kycCase.findMany({
      where: { accountId, status: { in: ['VERIFIED', 'IN_REVIEW'] } },
      orderBy: { submittedAt: 'desc' },
    })
    return cases.find((c) => c.status === 'VERIFIED') ?? cases[0] ?? null
  }

  async reveal(auth: AuthContext, field: IdField, ctx: RequestCtx) {
    const o = this.owner(auth)
    this.requireElevated(auth)

    const c = await this.displayCase(o.accountId)
    const packed = c ? c[ENC_COLUMN[field]] : null
    if (!c || !packed) throw new AppError(404, 'NOT_FOUND', 'Data tidak ditemukan.')

    const dek = await this.crypto.unwrapDek(c.dekWrapped, ctxFor(o.accountId, c.id))
    const value = this.crypto.decrypt(dek, packed, `${c.id}:${field}`)

    await this.audit.record({
      accountId: o.accountId,
      actorId: o.userId,
      actorLabel: o.label,
      action: 'kyc.identity_revealed',
      detail: FIELD_LABEL[field], // which field, never the value
      ip: ctx.ip,
    })
    return { value }
  }

  async viewDocument(auth: AuthContext, id: string, ctx: RequestCtx) {
    const o = this.owner(auth)
    this.requireElevated(auth)

    const doc = await this.prisma.kycDocument.findFirst({
      where: { id, accountId: o.accountId, status: 'UPLOADED', case: { status: { in: ['VERIFIED', 'IN_REVIEW'] } } },
    })
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan.')

    const url = await this.storage.presignGet(doc.objectKey, doc.contentType, `dokumen-${FROM_DB[doc.kind]}.${extOf(doc.contentType)}`, 60)
    await this.audit.record({
      accountId: o.accountId,
      actorId: o.userId,
      actorLabel: o.label,
      action: 'kyc.document_viewed',
      detail: DOC_RULES[FROM_DB[doc.kind]].label,
      ip: ctx.ip,
    })
    return { url, contentType: doc.contentType, expiresInSeconds: 60 }
  }
}