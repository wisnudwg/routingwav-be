import { detailOf, labelOf } from './activity.labels'
import { decodeCursor, encodeCursor } from './cursor'

describe('cursor', () => {
  const at = new Date('2026-10-30T10:15:30.123Z')
  const id = '3f2b1c9e-8a4d-4e6f-9b1a-2c7d5e8f0a1b'

  it('round-trips', () => {
    expect(decodeCursor(encodeCursor({ at, id }))).toEqual({ at, id })
  })

  it('rejects garbage and tampering', () => {
    expect(decodeCursor('not-a-cursor')).toBeNull()
    expect(decodeCursor(Buffer.from('2026-10-30T10:15:30.123Z|nope').toString('base64url'))).toBeNull()
    expect(decodeCursor(Buffer.from(`${at.toISOString()}|${id}|extra`).toString('base64url'))).toBeNull()
  })
})

describe('activity labels', () => {
  it('has a label and a readable detail for known actions', () => {
    expect(labelOf('auth.sign_in')).toBe('Masuk')
    expect(detailOf('auth.sign_in_failed', 'locked')).toBe('Akun sedang terkunci sementara')
  })

  it('degrades gracefully for unknown actions', () => {
    expect(labelOf('something.new')).toBe('Aktivitas lain')
    expect(detailOf('something.new', 'x')).toBe('x')
    expect(detailOf('auth.sign_in', null)).toBeNull()
  })
})