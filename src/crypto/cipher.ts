import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto'

const b64 = (b: Buffer) => b.toString('base64url')

/** AES-256-GCM. `aad` binds the ciphertext to its context: decrypting under another context fails. */
export function encryptField(key: Buffer, plaintext: string, aad: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key, iv)
  c.setAAD(Buffer.from(aad))
  const ct = Buffer.concat([c.update(plaintext, 'utf8'), c.final()])
  return `v1.${b64(iv)}.${b64(ct)}.${b64(c.getAuthTag())}`
}

export function decryptField(key: Buffer, packed: string, aad: string): string {
  const [version, iv, ct, tag] = packed.split('.')
  if (version !== 'v1' || !iv || !ct || !tag) throw new Error('Unsupported ciphertext')
  const d = createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64url'))
  d.setAAD(Buffer.from(aad))
  d.setAuthTag(Buffer.from(tag, 'base64url'))
  return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8')
}

/** Deterministic keyed hash, for finding duplicates without storing the number in the clear */
export const blindIndex = (key: Buffer, field: string, value: string) =>
  createHmac('sha256', key).update(`${field}:${value}`).digest('hex')