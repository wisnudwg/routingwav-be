import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common'
import type { Response } from 'express'

const DEFAULTS: Record<number, { code: string; message: string }> = {
  400: { code: 'BAD_REQUEST', message: 'Permintaan tidak valid.' },
  401: { code: 'UNAUTHENTICATED', message: 'Silakan masuk terlebih dahulu.' },
  403: { code: 'FORBIDDEN', message: 'Anda tidak memiliki akses.' },
  404: { code: 'NOT_FOUND', message: 'Tidak ditemukan.' },
  429: { code: 'RATE_LIMITED', message: 'Terlalu banyak percobaan. Coba lagi sebentar lagi.' },
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly log = new Logger('Errors')

  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>()

    if (err instanceof HttpException) {
      const status = err.getStatus()
      const body = err.getResponse()
      if (typeof body === 'object' && body !== null && 'code' in body) {
        return res.status(status).json(body)
      }
      const d = DEFAULTS[status] ?? { code: 'ERROR', message: 'Terjadi kesalahan.' }
      return res.status(status).json({ statusCode: status, ...d })
    }

    this.log.error(err instanceof Error ? (err.stack ?? err.message) : String(err))
    return res
      .status(500)
      .json({ statusCode: 500, code: 'INTERNAL', message: 'Terjadi kesalahan di server.' })
  }
}