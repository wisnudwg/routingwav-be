import { applyDecorators } from '@nestjs/common'
import { ApiBody, ApiResponse } from '@nestjs/swagger'
import type { SchemaObject } from '@nestjs/swagger'
import { z } from 'zod'

function jsonSchema(schema: z.ZodType, io: 'input' | 'output'): SchemaObject {
  const json = z.toJSONSchema(schema, { target: 'draft-7', io, unrepresentable: 'any' }) as Record<string, unknown>
  delete json.$schema
  return json as SchemaObject
}

export const ApiZodBody = (schema: z.ZodType) => ApiBody({ schema: jsonSchema(schema, 'input') })

export const ApiZodResponse = (status: number, schema: z.ZodType) =>
  applyDecorators(ApiResponse({ status, schema: jsonSchema(schema, 'output') }))