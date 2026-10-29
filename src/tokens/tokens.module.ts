import { Global, Module } from '@nestjs/common'
import { TokenService } from './tokens.service'

@Global()
@Module({ providers: [TokenService], exports: [TokenService] })
export class TokensModule {}