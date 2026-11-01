import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { randomBytes } from 'node:crypto'
import type { Env } from '../config/env'
import { blindIndex, decryptField, encryptField } from './cipher'
import { KmsKeyWrapper, LocalKeyWrapper, type KeyWrapper } from './key-wrapper'

@Injectable()
export class FieldCrypto {
  private readonly wrapper: KeyWrapper
  private readonly indexKey: Buffer

  constructor(config: ConfigService<Env, true>) {
    const kmsKey = config.get('KYC_KMS_KEY_ID', { infer: true })
    const master = config.get('KYC_MASTER_KEY', { infer: true })
    this.wrapper = kmsKey
      ? new KmsKeyWrapper(kmsKey, config.get('AWS_REGION', { infer: true }))
      : new LocalKeyWrapper(Buffer.from(master as string, 'base64'))
    this.indexKey = Buffer.from(config.get('KYC_INDEX_KEY', { infer: true }), 'base64')
  }

  newDek = () => randomBytes(32)
  wrapDek = (dek: Buffer, context: string) => this.wrapper.wrap(dek, context)
  unwrapDek = (wrapped: string, context: string) => this.wrapper.unwrap(wrapped, context)
  encrypt = (dek: Buffer, plaintext: string, aad: string) => encryptField(dek, plaintext, aad)
  decrypt = (dek: Buffer, packed: string, aad: string) => decryptField(dek, packed, aad)
  index = (field: string, value: string) => blindIndex(this.indexKey, field, value)
}