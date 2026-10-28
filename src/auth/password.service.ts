import { Injectable, OnModuleInit } from '@nestjs/common'
import * as argon2 from 'argon2'
import { randomBytes } from 'node:crypto'

// OWASP-recommended minimum for argon2id: 19 MiB memory, 2 iterations, 1 lane.
// Each concurrent hash uses that much memory: size your containers accordingly.
const OPTIONS = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as argon2.HashOptions

@Injectable()
export class PasswordService implements OnModuleInit {
  private dummyHash = ''

  async onModuleInit() {
    this.dummyHash = await argon2.hash(randomBytes(16).toString('hex'), OPTIONS)
  }

  hash(password: string) {
    return argon2.hash(password, OPTIONS)
  }

  /** Always performs a full argon2 verification, even when there is no hash, so timing reveals nothing */
  async verify(hash: string | null | undefined, password: string): Promise<boolean> {
    try {
      const ok = await argon2.verify(hash ?? this.dummyHash, password)
      return hash ? ok : false
    } catch {
      return false
    }
  }
}