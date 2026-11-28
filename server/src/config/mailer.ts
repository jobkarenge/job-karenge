import nodemailer, { type Transporter } from 'nodemailer';
import {
  cloudinaryMeta,
  env,
  hasExplicitClientUrlEnv,
  hasExplicitServerUrlEnv,
  integrationStatus,
} from './env.ts';
import { db } from '../store/dataLayer.ts';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const GMAIL_SMTP_PORT = 465;
export const GMAIL_SMTP_SECURE = true;

export function sanitizeHeaderText(value: string): string {
  return String(value || '')
    .replace(/[\r\n\0]+/g, ' ')
    .trim();
}

export function parseSenderAddress(rawFrom: string, defaultName: string): { email: string; name: string } {
  const match = rawFrom.match(/^(.*?)<([^<>]+)>$/);
  if (match) {
    return {
      email: match[2].trim(),
      name: sanitizeHeaderText(match[1].replace(/^['"]|['"]$/g, '')) || defaultName,
    };
  }
  return { email: rawFrom.trim(), name: sanitizeHeaderText(defaultName) };
}

function maskEmailAddress(email: string): string {
  const trimmed = (email || '').trim();
  const at = trimmed.indexOf('@');
  if (at <= 1) return trimmed ? '***' : 'not configured';
  return `${trimmed.slice(0, 2)}***${trimmed.slice(at)}`;
}

export function getEffectiveEmailConfig(requestOrigin?: string, clientOrigin?: string) {
  const settings = db.getPlatformSettings();
  const rawFromEmail =
    settings.emailFromEmail?.trim() ||
    settings.brevoSenderEmail?.trim() ||
    env.emailFromEmail;
  const rawFromName =
    settings.emailFromName?.trim() ||
    settings.brevoSenderName?.trim() ||
    env.emailFromName;
  const sender = parseSenderAddress(rawFromEmail, rawFromName);

  const fallbackClientUrl = hasExplicitClientUrlEnv
    ? env.clientUrl
    : clientOrigin || requestOrigin || env.clientUrl;
  const fallbackServerUrl = hasExplicitServerUrlEnv
    ? env.serverUrl
    : requestOrigin || env.serverUrl;

  const clientUrl = (settings.clientUrl?.trim() || fallbackClientUrl).replace(/\/+$/, '');
  const serverUrl = (settings.serverUrl?.trim() || fallbackServerUrl).replace(/\/+$/, '');

  return {
    provider: env.emailProvider,
    host: GMAIL_SMTP_HOST,
    port: GMAIL_SMTP_PORT,
    secure: GMAIL_SMTP_SECURE,
    gmailUser: env.gmailUser,
    gmailAppPassword: env.gmailAppPassword,
    fromEmail: sender.email,
    fromName: sender.name || 'Job Karenge',
    fromEmailSource: settings.emailFromEmail?.trim() || settings.brevoSenderEmail?.trim()
      ? ('admin_settings' as const)
      : process.env.EMAIL_FROM_EMAIL?.trim() || process.env.GMAIL_USER?.trim()
        ? ('env' as const)
        : ('default' as const),
    fromNameSource: settings.emailFromName?.trim() || settings.brevoSenderName?.trim()
      ? ('admin_settings' as const)
      : process.env.EMAIL_FROM_NAME?.trim()
        ? ('env' as const)
        : ('default' as const),
    clientUrl,
    serverUrl,
  };
}

let cachedTransporter: Transporter | null = null;
let cachedTransportSignature = '';

export function getGmailTransporter(): Transporter | null {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.gmailUser || !cfg.gmailAppPassword) {
    return null;
  }

  const signature = `${cfg.host}:${cfg.port}:${cfg.gmailUser}:${cfg.gmailAppPassword.length}`;
  if (cachedTransporter && cachedTransportSignature === signature) {
    return cachedTransporter;
  }

  if (cachedTransporter) {
    try {
      cachedTransporter.close();
    } catch {
      // Ignore transporter close errors when recreating
    }
  }

  cachedTransporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.secure,
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    auth: {
      user: cfg.gmailUser,
      pass: cfg.gmailAppPassword,
    },
  });
  cachedTransportSignature = signature;
  return cachedTransporter;
}

export async function verifyGmailSmtpConnection(): Promise<{
  ok: boolean;
  host: string;
  port: number;
  secure: boolean;
  gmailUser?: string;
  fromEmail: string;
  error?: string;
}> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.gmailUser || !cfg.gmailAppPassword) {
    return {
      ok: false,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      fromEmail: cfg.fromEmail,
      error: 'GMAIL_USER or GMAIL_APP_PASSWORD is not configured.',
    };
  }

  const transporter = getGmailTransporter();
  if (!transporter) {
    return {
      ok: false,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      fromEmail: cfg.fromEmail,
      error: 'Unable to initialize Gmail SMTP transporter.',
    };
  }

  try {
    await transporter.verify();
    return {
      ok: true,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      gmailUser: cfg.gmailUser,
      fromEmail: cfg.fromEmail,
    };
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : 'SMTP verification failed';
    const safeMsg = cfg.gmailAppPassword
      ? rawMsg.split(cfg.gmailAppPassword).join('[REDACTED]')
      : rawMsg;
    return {
      ok: false,
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      gmailUser: cfg.gmailUser,
      fromEmail: cfg.fromEmail,
      error: safeMsg,
    };
  }
}

export function getEmailDiagnostics(requestOrigin?: string, clientOrigin?: string) {
  const cfg = getEffectiveEmailConfig(requestOrigin, clientOrigin);
  const appPasswordLen = cfg.gmailAppPassword.length;
  const appPasswordHint = appPasswordLen
    ? `configured (${appPasswordLen} chars)`
    : 'not configured';
  const defaultSender = parseSenderAddress(env.emailFromEmail, env.emailFromName);
  const envDefaultClientUrl = hasExplicitClientUrlEnv
    ? env.clientUrl
    : clientOrigin || requestOrigin || env.clientUrl;
  const envDefaultServerUrl = hasExplicitServerUrlEnv
    ? env.serverUrl
    : requestOrigin || env.serverUrl;

  return {
    provider: 'gmail' as const,
    emailConfigured: Boolean(cfg.gmailUser && cfg.gmailAppPassword),
    smtpHost: cfg.host,
    smtpPort: cfg.port,
    smtpSecure: cfg.secure,
    gmailUserHint: maskEmailAddress(cfg.gmailUser),
    gmailUserConfigured: Boolean(cfg.gmailUser),
    appPasswordHint,
    appPasswordValidLength: appPasswordLen === 16,
    fromEmail: cfg.fromEmail,
    fromName: cfg.fromName,
    fromEmailValid: EMAIL_PATTERN.test(cfg.fromEmail),
    fromEmailSource: cfg.fromEmailSource,
    fromNameSource: cfg.fromNameSource,
    clientUrl: cfg.clientUrl,
    serverUrl: cfg.serverUrl,
    envDefaults: {
      fromEmail: defaultSender.email,
      fromName: defaultSender.name,
      clientUrl: envDefaultClientUrl,
      serverUrl: envDefaultServerUrl,
    },
    integrationStatus,
    cloudinaryDetails: cloudinaryMeta,
    serverRuntime: {
      nodeEnv: env.nodeEnv,
      port: env.port,
    },
  };
}
