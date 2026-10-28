import type { Request } from 'express'
import type { AuthContext } from '../auth/auth.types'

export type AuthedRequest = Request & { auth?: AuthContext }

export type RequestCtx = { ip?: string; userAgent?: string }

export const ctxOf = (req: Request): RequestCtx => ({
  ip: req.ip,
  userAgent: req.headers['user-agent']?.slice(0, 300),
})