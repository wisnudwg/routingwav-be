import { createHash, randomBytes } from 'node:crypto'

/** 256 bits of randomness, URL-safe */
export const newToken = () => randomBytes(32).toString('base64url')

/** Tokens are high-entropy, so a plain SHA-256 is enough to store them safely */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')