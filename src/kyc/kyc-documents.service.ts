import { Injectable } from '@nestjs/common'
import { randomUUID } from 'node:crypto'
import type { AuthContext } from '../auth/auth.types'
import { AppError } from '../common/app-error'
import { PrismaService } from '../prisma/prisma.service'
import { StorageService } from '../storage/storage.service'
import { DOC_RULES, FROM_DB, TO_DB, sniffMime } from './kyc.rules'
import type { CreateUploadInput } from './kyc.schemas'

const MAX_PENDING_DOCS = 20 // keeps abandoned uploads from piling up

const cleanName = (s: string) => s.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 120) || 'dokumen'

@Injectable()
export class KycDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private accountId(auth: AuthContext): string {
    const id = auth.user.accountId
    if (auth.user.type !== 'ROOT' || !id) throw new AppError(403, 'FORBIDDEN', 'Hanya pemilik akun yang dapat mengunggah dokumen.')
    return id
  }

  async createUpload(auth: AuthContext, input: CreateUploadInput) {
    const accountId = this.accountId(auth)
    const rule = DOC_RULES[input.kind]

    if (!rule.types.includes(input.contentType)) {
      throw new AppError(400, 'VALIDATION', 'Format file tidak didukung.', { fields: { contentType: 'Format file tidak didukung.' } })
    }
    if (input.size > rule.maxBytes) {
      throw new AppError(400, 'VALIDATION', `Ukuran maksimal ${Math.round(rule.maxBytes / 1024 / 1024)} MB.`, {
        fields: { size: 'File terlalu besar.' },
      })
    }

    const loose = await this.prisma.kycDocument.count({ where: { accountId, caseId: null, status: { in: ['PENDING_UPLOAD', 'UPLOADED'] } } })
    if (loose >= MAX_PENDING_DOCS) {
      throw new AppError(429, 'RATE_LIMITED', 'Terlalu banyak dokumen belum terpakai. Hapus sebagian atau ajukan verifikasi.')
    }

    const id = randomUUID()
    const key = `kyc/${accountId}/${id}`
    const post = await this.storage.presignUpload(key, input.contentType, rule.maxBytes)
    await this.prisma.kycDocument.create({
      data: {
        id,
        accountId,
        kind: TO_DB[input.kind],
        objectKey: key,
        originalName: cleanName(input.filename),
        contentType: input.contentType,
      },
    })
    return { documentId: id, url: post.url, fields: post.fields, maxBytes: rule.maxBytes }
  }

  /** Called after the browser's upload. The declared type is not trusted: the file's own bytes decide. */
  async complete(auth: AuthContext, id: string) {
    const accountId = this.accountId(auth)
    const doc = await this.prisma.kycDocument.findFirst({ where: { id, accountId, status: 'PENDING_UPLOAD' } })
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan.')

    const maxBytes = DOC_RULES[FROM_DB[doc.kind]].maxBytes
    const head = await this.storage.head(doc.objectKey)
    if (!head) throw new AppError(409, 'UPLOAD_MISSING', 'File belum terunggah. Coba lagi.')

    const real = head.size > 0 && head.size <= maxBytes ? sniffMime(await this.storage.readHead(doc.objectKey)) : null
    if (real !== doc.contentType) {
      await this.storage.remove(doc.objectKey).catch(() => undefined)
      await this.prisma.kycDocument.update({ where: { id: doc.id }, data: { status: 'REJECTED' } })
      throw new AppError(400, 'DOCUMENT_INVALID', 'Isi file tidak sesuai formatnya atau ukurannya tidak valid. Unggah file lain.')
    }

    await this.prisma.kycDocument.update({
      where: { id: doc.id },
      data: { status: 'UPLOADED', size: head.size, uploadedAt: new Date() },
    })
  }

  /** Only files that aren't attached to a case yet */
  async remove(auth: AuthContext, id: string) {
    const accountId = this.accountId(auth)
    const doc = await this.prisma.kycDocument.findFirst({ where: { id, accountId, caseId: null } })
    if (!doc) throw new AppError(404, 'NOT_FOUND', 'Dokumen tidak ditemukan.')
    await this.storage.remove(doc.objectKey).catch(() => undefined)
    await this.prisma.kycDocument.delete({ where: { id: doc.id } })
  }
}