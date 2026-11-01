export const KYC_DOC_KINDS = ['ktp', 'selfie', 'npwp', 'nib', 'repKtp', 'deed'] as const
export type ApiDocKind = (typeof KYC_DOC_KINDS)[number]
export type IdField = 'nik' | 'npwp' | 'nib' | 'repNik'

const IMAGES = ['image/jpeg', 'image/png', 'image/webp'] as const
const IMAGES_PDF = [...IMAGES, 'application/pdf'] as const
const MB = 1024 * 1024

/** The server is the authority on what may be uploaded. The front end's copy is only a courtesy. */
export const DOC_RULES: Record<ApiDocKind, { label: string; types: readonly string[]; maxBytes: number }> = {
  ktp: { label: 'Foto KTP', types: IMAGES, maxBytes: 5 * MB },
  selfie: { label: 'Selfie memegang KTP', types: IMAGES, maxBytes: 5 * MB },
  npwp: { label: 'Kartu / bukti NPWP', types: IMAGES_PDF, maxBytes: 5 * MB },
  nib: { label: 'Dokumen NIB (OSS)', types: IMAGES_PDF, maxBytes: 5 * MB },
  repKtp: { label: 'KTP penanggung jawab', types: IMAGES, maxBytes: 5 * MB },
  deed: { label: 'Akta pendirian / SK pengesahan', types: IMAGES_PDF, maxBytes: 10 * MB },
}

export const REQUIRED_DOCS: Record<'individual' | 'business', readonly ApiDocKind[]> = {
  individual: ['ktp', 'selfie'],
  business: ['nib', 'npwp', 'repKtp'],
}
export const OPTIONAL_DOCS: Record<'individual' | 'business', readonly ApiDocKind[]> = {
  individual: ['npwp'],
  business: ['deed'],
}

export const ENTITY_TYPES = ['PT', 'CV', 'Firma', 'Koperasi', 'Yayasan', 'Usaha perorangan (UD)', 'Lainnya'] as const

export const TO_DB = {
  ktp: 'KTP',
  selfie: 'SELFIE',
  npwp: 'NPWP',
  nib: 'NIB',
  repKtp: 'REP_KTP',
  deed: 'DEED',
} as const

export const FROM_DB = {
  KTP: 'ktp',
  SELFIE: 'selfie',
  NPWP: 'npwp',
  NIB: 'nib',
  REP_KTP: 'repKtp',
  DEED: 'deed',
} as const

export const ENC_COLUMN = { nik: 'nikEnc', npwp: 'npwpEnc', nib: 'nibEnc', repNik: 'repNikEnc' } as const

export const FIELD_LABEL: Record<IdField, string> = {
  nik: 'NIK (KTP)',
  npwp: 'NPWP',
  nib: 'NIB',
  repNik: 'NIK penanggung jawab',
}

/** Baseline pending legal confirmation. Stored as data; nothing is purged automatically. */
export const RETENTION_YEARS = 5

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
}
export const extOf = (contentType: string) => EXT[contentType] ?? 'bin'

/** "•••• •••• •••• 0001": only the last 4 digits survive */
export function maskId(value: string): string {
  const v = value.replace(/\D/g, '')
  if (v.length <= 4) return '•'.repeat(v.length)
  return `${'•'.repeat(v.length - 4)}${v.slice(-4)}`.replace(/(.{4})(?=.)/g, '$1 ')
}

/** What a file really is, from its first bytes. A declared type is never trusted. */
export function sniffMime(b: Uint8Array): string | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...b.slice(from, to))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg'
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp'
  if (ascii(0, 5) === '%PDF-') return 'application/pdf'
  return null
}

export const REJECTION_MESSAGES: Record<string, string> = {
  DOCUMENT_UNREADABLE: 'Foto dokumen tidak terbaca jelas. Unggah ulang dengan pencahayaan yang lebih baik.',
  DATA_MISMATCH: 'Data yang diisi tidak cocok dengan dokumen. Periksa nama dan nomor Anda.',
  FACE_MISMATCH: 'Wajah pada selfie tidak cocok dengan dokumen.',
  LIVENESS_FAILED: 'Verifikasi wajah tidak berhasil. Ulangi dengan pencahayaan yang baik.',
  UNABLE_TO_VERIFY: 'Verifikasi tidak dapat diselesaikan. Hubungi dukungan dan sebutkan kode referensi Anda.',
}

/** Unknown provider codes degrade to the generic message instead of leaking provider text */
export const reasonMessage = (code?: string | null) =>
  REJECTION_MESSAGES[code ?? ''] ?? REJECTION_MESSAGES.UNABLE_TO_VERIFY