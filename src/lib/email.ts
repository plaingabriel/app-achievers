/**
 * Email module — ALL sending goes through sendEmail() so the vendor is
 * swappable in one file (ADR 0009). Implemented in PHASE 3.
 */
import { Resend } from 'resend'

export interface EmailMessage {
  to: string
  subject: string
  html: string
  text?: string
}

const resend = new Resend(process.env.RESEND_API_KEY)
const FROM = process.env.RESEND_FROM ?? 'App Achievers <no-reply@achieversacademy.es>'

export async function sendEmail(msg: EmailMessage): Promise<void> {
  const { error } = await resend.emails.send({
    from: FROM,
    to: msg.to,
    subject: msg.subject,
    html: msg.html,
    text: msg.text,
  })
  if (error) throw new Error(`Email send failed: ${error.message}`)
}
