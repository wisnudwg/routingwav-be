import { randomBytes } from 'node:crypto'
import { blindIndex, decryptField, encryptField } from '../crypto/cipher'
import { LocalKeyWrapper } from '../crypto/key-wrapper'
import { effectiveStatus } from './kyc.view'
import { maskId, reasonMessage, sniffMime } from './kyc.rules'

describe('field encryption', () => {
  const key = randomBytes(32)

  it('round-trips and never repeats a ciphertext', () => {
    const a = encryptField(key, '3171010101900001', 'case1:nik')
    expect(decryptField(key, a, 'case1:nik')).toBe('3171010101900001')
    expect(encryptField(key, '3171010101900001', 'case1:nik')).not.toBe(a)
  })

  it('refuses another context or a tampered value', () => {
    const packed = encryptField(key, '3171010101900001', 'case1:nik')
    expect(() => decryptField(key, packed, 'case2:nik')).toThrow()
    expect(() => decryptField(key, packed, 'case1:npwp')).toThrow()
    expect(() => decryptField(key, packed.slice(0, -2) + 'AA', 'case1:nik')).toThrow()
  })

  it('wraps data keys per context', async () => {
    const wrapper = new LocalKeyWrapper(randomBytes(32))
    const dek = randomBytes(32)
    const wrapped = await wrapper.wrap(dek, 'kyc:acct:case')
    expect((await wrapper.unwrap(wrapped, 'kyc:acct:case')).equals(dek)).toBe(true)
    await expect(wrapper.unwrap(wrapped, 'kyc:other:case')).rejects.toThrow()
  })
})

describe('blind index', () => {
  const key = randomBytes(32)
  it('is stable, field-specific, and key-dependent', () => {
    expect(blindIndex(key, 'nik', '1')).toBe(blindIndex(key, 'nik', '1'))
    expect(blindIndex(key, 'nik', '1')).not.toBe(blindIndex(key, 'npwp', '1'))
    expect(blindIndex(key, 'nik', '1')).not.toBe(blindIndex(randomBytes(32), 'nik', '1'))
  })
})

describe('sniffMime', () => {
  const bytes = (...n: number[]) => Uint8Array.from(n)
  const text = (s: string) => Uint8Array.from(Buffer.from(s, 'latin1'))

  it('recognizes real formats', () => {
    expect(sniffMime(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe('image/jpeg')
    expect(sniffMime(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a))).toBe('image/png')
    expect(sniffMime(text('RIFF....WEBPVP8 '))).toBe('image/webp')
    expect(sniffMime(text('%PDF-1.7'))).toBe('application/pdf')
  })

  it('rejects everything else, including HTML and an empty file', () => {
    expect(sniffMime(text('<html><script>'))).toBeNull()
    expect(sniffMime(new Uint8Array())).toBeNull()
  })
})

describe('masking and messages', () => {
  it('keeps only the last four digits', () => {
    expect(maskId('3171010101900001')).toBe('•••• •••• •••• 0001')
    expect(maskId('1234')).toBe('••••')
  })

  it('falls back to a generic rejection message', () => {
    expect(reasonMessage('SOMETHING_FROM_THE_PROVIDER')).toBe(reasonMessage('UNABLE_TO_VERIFY'))
    expect(reasonMessage(null)).toBe(reasonMessage('UNABLE_TO_VERIFY'))
  })
})

describe('effectiveStatus (newest first)', () => {
  it('keeps a verified identity in force while an update is reviewed or rejected', () => {
    expect(effectiveStatus(['IN_REVIEW', 'VERIFIED'])).toBe('verified')
    expect(effectiveStatus(['REJECTED', 'VERIFIED', 'SUPERSEDED'])).toBe('verified')
  })

  it('reports in review, rejected, or not started otherwise', () => {
    expect(effectiveStatus(['IN_REVIEW'])).toBe('in_review')
    expect(effectiveStatus(['REJECTED'])).toBe('rejected')
    expect(effectiveStatus([])).toBe('not_started')
  })
})