import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

interface MailOptions {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transporter: Transporter | null = null;

function getTransporter() {
  if (!env.SMTP_HOST) return null;
  transporter ??= nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
  });
  return transporter;
}

/**
 * Envia um e-mail via SMTP. Sem SMTP_HOST configurado (ex.: desenvolvimento),
 * o conteúdo é apenas impresso no console da API.
 */
export async function sendMail(options: MailOptions) {
  const t = getTransporter();
  if (!t) {
    console.log(
      `\n✉  [SMTP não configurado] E-mail para ${options.to}\n   Assunto: ${options.subject}\n${options.text
        .split('\n')
        .map((l) => `   ${l}`)
        .join('\n')}\n`,
    );
    return;
  }
  await t.sendMail({ from: env.SMTP_FROM, ...options });
}
