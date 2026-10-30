import { z } from 'zod'

export type Cursor = { at: Date; id: string }

export const encodeCursor = (c: Cursor) => Buffer.from(`${c.at.toISOString()}|${c.id}`).toString('base64url')

/** Returns null for anything that isn't exactly what encodeCursor produces */
export function decodeCursor(raw: string): Cursor | null {
  const [at, id, extra] = Buffer.from(raw, 'base64url').toString('utf8').split('|')
  const date = new Date(at ?? '')
  if (extra !== undefined || Number.isNaN(date.getTime()) || !z.uuid().safeParse(id).success) return null
  return { at: date, id: id as string }
}