import { randomInt } from 'node:crypto'

// No look-alikes: 0/O, 1/l/I. 56 symbols × 12 positions ≈ 70 bits.
const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

export function generateTempPassword(): string {
  const pick = () => CHARS.charAt(randomInt(CHARS.length)) // unbiased
  return [4, 4, 4].map((n) => Array.from({ length: n }, pick).join('')).join('-')
}