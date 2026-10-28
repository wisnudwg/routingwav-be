import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createTransport, type Transporter } from 'nodemailer'
import type { Env } from '../config/env'
import { maskEmail, type Mail } from './templates'

@Injectable()
export class MailService {
  private readonly log = new Logger(MailService.name)
  private readonly transport: Transporter
  private readonly from: string

  constructor(config: ConfigService<Env, true>) {
    const port = config.get('SMTP_PORT', { infer: true })
    const user = config.get('SMTP_USER', { infer: true })
    this.from = config.get('MAIL_FROM', { infer: true })
    this.transport = createTransport({
      host: config.get('SMTP_HOST', { infer: true }),
      port,
      secure: port === 465,
      auth: user ? { user, pass: config.get('SMTP_PASS', { infer: true }) } : undefined,
    })
  }

  /** Never throws: callers use it fire-and-forget so response timing doesn't reveal anything */
  async send(to: string, mail: Mail): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to, subject: mail.subject, text: mail.text })
    } catch (e) {
      this.log.error(`Mail to ${maskEmail(to)} failed: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
}