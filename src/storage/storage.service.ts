import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { createPresignedPost } from '@aws-sdk/s3-presigned-post'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { Injectable, Logger, OnModuleInit } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import type { Env } from '../config/env'

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly log = new Logger(StorageService.name)
  private readonly s3: S3Client
  private readonly bucket: string
  private readonly dev: boolean

  constructor(config: ConfigService<Env, true>) {
    const key = config.get('S3_ACCESS_KEY_ID', { infer: true })
    const secret = config.get('S3_SECRET_ACCESS_KEY', { infer: true })
    this.bucket = config.get('KYC_BUCKET', { infer: true })
    this.dev = config.get('NODE_ENV', { infer: true }) !== 'production'
    this.s3 = new S3Client({
      region: config.get('AWS_REGION', { infer: true }),
      endpoint: config.get('S3_ENDPOINT', { infer: true }), // undefined on AWS
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: key && secret ? { accessKeyId: key, secretAccessKey: secret } : undefined, // else the role/default chain
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  /** Development convenience: create the bucket. In production, buckets are managed as infrastructure. */
  async onModuleInit() {
    if (!this.dev) return
    try {
      await this.s3.send(new HeadBucketCommand({ Bucket: this.bucket }))
    } catch {
      try {
        await this.s3.send(new CreateBucketCommand({ Bucket: this.bucket }))
        this.log.log(`Created bucket ${this.bucket}`)
      } catch (e) {
        this.log.warn(`Storage not reachable (${e instanceof Error ? e.message : String(e)}). Is MinIO running?`)
      }
    }
  }

  /** The browser POSTs the file straight to the bucket; size and type are enforced by the signed policy */
  presignUpload(key: string, contentType: string, maxBytes: number) {
    return createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Expires: 300,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', 1, maxBytes],
        ['eq', '$Content-Type', contentType],
      ],
    })
  }

  async head(key: string): Promise<{ size: number; contentType?: string } | null> {
    try {
      const r = await this.s3.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }))
      return { size: r.ContentLength ?? 0, contentType: r.ContentType }
    } catch (e) {
      if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null
      throw e
    }
  }

  /** First bytes of an object, for checking what the file really is */
  async readHead(key: string, bytes = 16): Promise<Uint8Array> {
    try {
      const r = await this.s3.send(new GetObjectCommand({ Bucket: this.bucket, Key: key, Range: `bytes=0-${bytes - 1}` }))
      return (await r.Body?.transformToByteArray()) ?? new Uint8Array()
    } catch {
      return new Uint8Array()
    }
  }

  presignGet(key: string, contentType: string, filename: string, expiresIn = 60): Promise<string> {
    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentType: contentType,
        ResponseContentDisposition: `inline; filename="${filename}"`,
        ResponseCacheControl: 'no-store',
      }),
      { expiresIn },
    )
  }

  async remove(key: string): Promise<void> {
    await this.s3.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }))
  }
}