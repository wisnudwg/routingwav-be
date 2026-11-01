import { Global, Module } from '@nestjs/common'
import { FieldCrypto } from './field-crypto.service'

@Global()
@Module({ providers: [FieldCrypto], exports: [FieldCrypto] })
export class CryptoModule {}