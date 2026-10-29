import { Controller, Get, Header } from '@nestjs/common'
import { ApiTags } from '@nestjs/swagger'
import { RULES } from '../common/rules/rules'
import { ApiZodResponse } from '../common/openapi'
import { CATALOG_LIST, PRESETS } from '../permissions/catalog'
import { permissionsMetaSchema, rulesSchema } from './meta.schemas'

const CACHE = 'private, max-age=300'

@ApiTags('meta')
@Controller('meta')
export class MetaController {
  @Get('permissions')
  @Header('Cache-Control', CACHE)
  @ApiZodResponse(200, permissionsMetaSchema)
  permissions() {
    return { permissions: CATALOG_LIST, presets: PRESETS }
  }

  @Get('rules')
  @Header('Cache-Control', CACHE)
  @ApiZodResponse(200, rulesSchema)
  rules() {
    return RULES
  }
}