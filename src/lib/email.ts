import { Resend } from 'resend';
import { env } from './env';

// All outbound mail goes through this single interface (plan: Resend lock-in
// is isolated behind sendEmail()). Swapping providers = change this file only.
export interface EmailMessage {
  to: string | string[];
  subject: string;
  html: string;
}

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;

export async function sendEmail(
  msg: EmailMessage,
): Promise<{ ok: boolean; id?: string; error?: string }> {
  if (!resend) {
    if (env.NODE_ENV !== 'production') {
      console.info('[email:dev] would send', msg.subject, '→', msg.to);
      return { ok: true, id: 'dev-noop' };
    }
    return { ok: false, error: 'RESEND_API_KEY not configured' };
  }
  const res = await resend.emails.send({ from: env.RESEND_FROM, ...msg });
  return res.error ? { ok: false, error: res.error.message } : { ok: true, id: res.data?.id };
}
