import { DecryptCommand, EncryptCommand, KMSClient } from '@aws-sdk/client-kms'
import { decryptField, encryptField } from './cipher'

/** Wraps data keys. In production the master key never leaves KMS. */
export interface KeyWrapper {
  /** `context` ties the wrapped key to its owner: unwrapping with another context fails */
  wrap(dek: Buffer, context: string): Promise<string>
  unwrap(wrapped: string, context: string): Promise<Buffer>
}

/** Development only */
export class LocalKeyWrapper implements KeyWrapper {
  constructor(private readonly key: Buffer) {}

  async wrap(dek: Buffer, context: string): Promise<string> {
    return `local.${encryptField(this.key, dek.toString('base64'), context)}`
  }

  async unwrap(wrapped: string, context: string): Promise<Buffer> {
    if (!wrapped.startsWith('local.')) throw new Error('Unsupported key format')
    return Buffer.from(decryptField(this.key, wrapped.slice('local.'.length), context), 'base64')
  }
}

export class KmsKeyWrapper implements KeyWrapper {
  private readonly client: KMSClient

  constructor(
    private readonly keyId: string,
    region: string,
  ) {
    this.client = new KMSClient({ region })
  }

  async wrap(dek: Buffer, context: string): Promise<string> {
    const r = await this.client.send(
      new EncryptCommand({ KeyId: this.keyId, Plaintext: dek, EncryptionContext: { ctx: context } }),
    )
    return `kms.${Buffer.from(r.CiphertextBlob as Uint8Array).toString('base64url')}`
  }

  async unwrap(wrapped: string, context: string): Promise<Buffer> {
    if (!wrapped.startsWith('kms.')) throw new Error('Unsupported key format')
    const r = await this.client.send(
      new DecryptCommand({
        KeyId: this.keyId,
        CiphertextBlob: Buffer.from(wrapped.slice('kms.'.length), 'base64url'),
        EncryptionContext: { ctx: context },
      }),
    )
    return Buffer.from(r.Plaintext as Uint8Array)
  }
}