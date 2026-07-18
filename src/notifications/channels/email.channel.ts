/**
 * Channel: Email
 * File: src/notifications/channels/email.channel.ts
 *
 * Supports two transports (configured via EMAIL_TRANSPORT env var):
 *  - 'sendgrid' → uses @sendgrid/mail
 *  - 'smtp'     → uses nodemailer (default fallback)
 *
 * Required env vars:
 *  EMAIL_TRANSPORT   = 'sendgrid' | 'smtp'   (default: smtp)
 *  EMAIL_FROM        = 'Oficialía de Partes <noreply@gobierno.mx>'
 *
 *  SendGrid:
 *    SENDGRID_API_KEY
 *
 *  SMTP:
 *    SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS
 */

import type { EmailMessage } from '../notification.types';

// Lazy-loaded transport to avoid hard dependency at import time
let _sendgrid: any = null;
let _nodemailer: any = null;

async function getSendgrid() {
  if (!_sendgrid) {
    // @ts-ignore — optional runtime dependency
    const sgMail = await import('@sendgrid/mail');
    sgMail.default.setApiKey(process.env.SENDGRID_API_KEY!);
    _sendgrid = sgMail.default;
  }
  return _sendgrid;
}

async function getSmtpTransport() {
  if (!_nodemailer) {
    // @ts-ignore — optional runtime dependency
    const nodemailer = await import('nodemailer');
    _nodemailer = nodemailer.default.createTransport({
      host:   process.env.SMTP_HOST   ?? 'localhost',
      port:   Number(process.env.SMTP_PORT ?? 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return _nodemailer;
}

export async function sendEmail(message: EmailMessage): Promise<void> {
  const from      = process.env.EMAIL_FROM ?? 'Oficialía de Partes <noreply@gobierno.mx>';
  const transport = process.env.EMAIL_TRANSPORT ?? 'smtp';

  if (transport === 'sendgrid') {
    const sg = await getSendgrid();
    await sg.send({
      to:      message.to,
      from,
      subject: message.subject,
      html:    message.html,
      text:    message.text,
    });
  } else {
    const transporter = await getSmtpTransport();
    await transporter.sendMail({
      from,
      to:      message.to,
      subject: message.subject,
      html:    message.html,
      text:    message.text,
    });
  }
}
