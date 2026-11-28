import {
  EMAIL_PATTERN,
  getEffectiveEmailConfig,
  getGmailTransporter,
  sanitizeHeaderText,
} from '../config/mailer.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

interface SmtpErrorLike {
  code?: string;
  responseCode?: number;
  response?: string;
  message?: string;
}

function sanitizeSmtpErrorMessage(raw: string, secret?: string): string {
  const cleaned = secret ? raw.split(secret).join('[REDACTED]') : raw;
  return cleaned.replace(/\s+/g, ' ').trim();
}

function classifySmtpFailure(err: unknown, secret?: string): { message: string; retryable: boolean } {
  const e = (err && typeof err === 'object' ? err : {}) as SmtpErrorLike;
  const code = String(e.code || '').toUpperCase();
  const responseCode = typeof e.responseCode === 'number' ? e.responseCode : 0;
  const rawMessage = sanitizeSmtpErrorMessage(
    String(e.response || e.message || 'Gmail SMTP delivery failed'),
    secret
  );

  // Permanent auth / configuration / invalid recipient rejections: do NOT retry
  if (
    code === 'EAUTH' ||
    responseCode === 535 ||
    responseCode === 534 ||
    responseCode === 530 ||
    /username and password not accepted|invalid login|application-specific password required|badcredentials/i.test(rawMessage)
  ) {
    return {
      message:
        'Gmail SMTP authentication failed. Verify GMAIL_USER and a 16-character Google App Password (with 2-Step Verification enabled).',
      retryable: false,
    };
  }

  if (
    code === 'EENVELOPE' ||
    responseCode === 550 ||
    responseCode === 551 ||
    responseCode === 552 ||
    responseCode === 553 ||
    responseCode === 554 ||
    responseCode === 501 ||
    responseCode === 502 ||
    responseCode === 503
  ) {
    return {
      message: `Gmail SMTP rejected message (${responseCode || code || '5xx'}): ${rawMessage}`,
      retryable: false,
    };
  }

  // Transient socket / timeout / temporary 4xx throttling: retry cleanly
  const isTransient =
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'ECONNRESET' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNECTION' ||
    code === 'EAI_AGAIN' ||
    (responseCode >= 400 && responseCode < 500);

  return {
    message: `Gmail SMTP error${responseCode ? ` (${responseCode})` : ''}: ${rawMessage}`,
    retryable: isTransient,
  };
}

export interface GmailSendResult {
  accepted: boolean;
  status: 'sent' | 'failed';
  messageId: string;
  error?: string;
}

export async function sendGmailSmtpEmail(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  headers?: Record<string, string>;
}): Promise<GmailSendResult> {
  const cfg = getEffectiveEmailConfig();
  const recipient = sanitizeHeaderText(params.toEmail);

  if (!EMAIL_PATTERN.test(recipient)) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: `Invalid recipient email address "${recipient}".`,
    };
  }
  if (!cfg.gmailUser || !cfg.gmailAppPassword) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: 'GMAIL_USER or GMAIL_APP_PASSWORD is not configured.',
    };
  }
  if (!EMAIL_PATTERN.test(cfg.fromEmail)) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: `Invalid sender email "${cfg.fromEmail}". Configure EMAIL_FROM_EMAIL or Admin Settings.`,
    };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: 'Gmail SMTP transporter is not initialized.',
    };
  }

  const safeFromName = sanitizeHeaderText(cfg.fromName || 'Job Karenge').replace(/"/g, '') || 'Job Karenge';
  const rawToName = sanitizeHeaderText(params.toName || '').replace(/"/g, '');
  const safeToName =
    rawToName &&
    rawToName.toLowerCase() !== safeFromName.toLowerCase() &&
    rawToName.toLowerCase() !== 'job karenge'
      ? rawToName
      : '';
  const safeSubject = sanitizeHeaderText(params.subject);

  const safeHeaders: Record<string, string> = {};
  if (params.headers) {
    for (const [k, v] of Object.entries(params.headers)) {
      const hk = sanitizeHeaderText(k);
      const hv = sanitizeHeaderText(v);
      if (hk && hv) safeHeaders[hk] = hv;
    }
  }

  const mailOptions = {
    from: `"${safeFromName}" <${cfg.fromEmail}>`,
    to: safeToName ? `"${safeToName}" <${recipient}>` : recipient,
    ...(cfg.fromEmail.toLowerCase() !== cfg.gmailUser.toLowerCase()
      ? { replyTo: `"${safeFromName}" <${cfg.fromEmail}>` }
      : {}),
    subject: safeSubject,
    html: params.htmlContent,
    text: params.textContent,
    ...(Object.keys(safeHeaders).length > 0 ? { headers: safeHeaders } : {}),
  };

  let lastError = 'Gmail SMTP dispatch failed';
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const info = await transporter.sendMail(mailOptions);
      const messageId = sanitizeHeaderText(info.messageId || `gmail-${Date.now()}`);
      return {
        accepted: true,
        status: 'sent',
        messageId,
      };
    } catch (err) {
      const classified = classifySmtpFailure(err, cfg.gmailAppPassword);
      lastError = classified.message;
      if (!classified.retryable || attempt === maxAttempts) {
        return {
          accepted: false,
          status: 'failed',
          messageId: '',
          error: lastError,
        };
      }
      await sleep(500 * attempt);
    }
  }

  return {
    accepted: false,
    status: 'failed',
    messageId: '',
    error: lastError,
  };
}
