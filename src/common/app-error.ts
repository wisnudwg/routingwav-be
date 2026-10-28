import { HttpException } from '@nestjs/common'

/** Every error the API raises on purpose: a stable `code` for the front end plus an Indonesian message */
export class AppError extends HttpException {
  constructor(
    status: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {},
  ) {
    super({ statusCode: status, code, message, ...extra }, status)
  }
}

export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: unknown }).code === 'P2002'
}