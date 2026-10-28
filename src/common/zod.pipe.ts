import { Injectable, PipeTransform } from '@nestjs/common'
import type { z } from 'zod'
import { AppError } from './app-error'

@Injectable()
export class ZodPipe<S extends z.ZodType> implements PipeTransform<unknown, z.infer<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.infer<S> {
    const parsed = this.schema.safeParse(value)
    if (parsed.success) return parsed.data

    const fields: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path.join('.') || '_'
      fields[key] ??= issue.message
    }
    throw new AppError(400, 'VALIDATION', 'Data tidak valid.', { fields })
  }
}