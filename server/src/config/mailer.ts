import dns from 'node:dns';
import nodemailer, { type Transporter, type TransportOptions } from 'nodemailer';
import {
  cloudinaryMeta,
  env,
  hasExplicitClientUrlEnv,
  hasExplicitServerUrlEnv,
  integrationStatus,
  isLocalhostUrl,
} from './env.ts';
import { db } from '../store/dataLayer.ts';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch {
  // Ignore on runtimes that disallow changing DNS result order
}

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const GMAIL_SMTP_HOST = 'smtp.gmail.com';
export const GMAIL_SMTP_PORT = env.gmailSmtpPort;
export const GMAIL_SMTP_SECURE = GMAIL_SMTP_PORT === 465;

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

export function resolveEffectiveClientUrl(
  settingsClientUrl?: string,
  requestOrigin?: string,
  clientOrigin?: string
): string {
  const candidates = [
    settingsClientUrl,
    hasExplicitClientUrlEnv ? env.clientUrl : undefined,
    clientOrigin,
    requestOrigin,
  ]
    .map((u) => (u || '').trim().replace(/\/+$/, ''))
    .filter(Boolean);

  const nonLocal = candidates.find((u) => !isLocalhostUrl(u));
  return nonLocal || candidates[0] || env.clientUrl.replace(/\/+$/, '');
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

  const fallbackServerUrl = hasExplicitServerUrlEnv
    ? env.serverUrl
    : requestOrigin || env.serverUrl;

  const clientUrl = resolveEffectiveClientUrl(settings.clientUrl, requestOrigin, clientOrigin);
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

let cachedIpv4: { address: string; expiresAt: number } | null = null;
let lastWorkingGmailPort: 465 | 587 | null = null;

export function getPreferredGmailPort(defaultPort: number): 465 | 587 {
  if (lastWorkingGmailPort) return lastWorkingGmailPort;
  return defaultPort === 587 ? 587 : 465;
}

export function markWorkingGmailPort(port: 465 | 587): void {
  lastWorkingGmailPort = port;
}

export async function resolveGmailIpv4Host(): Promise<string> {
  if (cachedIpv4 && cachedIpv4.expiresAt > Date.now()) {
    return cachedIpv4.address;
  }
  try {
    const addresses = await dns.promises.resolve4(GMAIL_SMTP_HOST);
    if (addresses.length > 0 && addresses[0]) {
      cachedIpv4 = { address: addresses[0], expiresAt: Date.now() + 5 * 60_000 };
      return addresses[0];
    }
  } catch {
    // Fall back to hostname resolution inside Nodemailer
  }
  return GMAIL_SMTP_HOST;
}

const transporterCache = new Map<string, Transporter>();

export function getGmailTransporter(portOverride?: number, hostOverride?: string): Transporter | null {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.gmailUser || !cfg.gmailAppPassword) {
    return null;
  }

  const targetPort = portOverride === 587 ? 587 : portOverride === 465 ? 465 : cfg.port;
  const targetSecure = targetPort === 465;
  const activeIpv4 = cachedIpv4 && cachedIpv4.expiresAt > Date.now() ? cachedIpv4.address : undefined;
  const connectHost = (hostOverride || activeIpv4 || cfg.host).trim() || cfg.host;
  const signature = `${connectHost}:${targetPort}:${cfg.gmailUser}:${cfg.gmailAppPassword.length}`;
  if (!hostOverride) {
    const existing = transporterCache.get(signature);
    if (existing) {
      return existing;
    }
  }

  const transporter = nodemailer.createTransport({
    host: connectHost,
    port: targetPort,
    secure: targetSecure,
    ...(targetSecure ? {} : { requireTLS: true }),
    servername: cfg.host,
    pool: false,
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 10_000,
    tls: {
      minVersion: 'TLSv1.2',
      servername: cfg.host,
    },
    auth: {
      user: cfg.gmailUser,
      pass: cfg.gmailAppPassword,
    },
  } as TransportOptions);

  if (!hostOverride) {
    transporterCache.set(signature, transporter);
  }
  return transporter;
}

function isNetworkPortFailure(err: unknown): boolean {
  const e = (err && typeof err === 'object' ? err : {}) as { code?: string; message?: string };
  const code = String(e.code || '').toUpperCase();
  return (
    code === 'ETIMEDOUT' ||
    code === 'ESOCKET' ||
    code === 'ECONNREFUSED' ||
    code === 'ECONNECTION' ||
    code === 'ENETUNREACH' ||
    code === 'EHOSTUNREACH' ||
    code === 'EAI_AGAIN'
  );
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

  const primaryPort = getPreferredGmailPort(cfg.port);
  const fallbackPort: 465 | 587 = primaryPort === 465 ? 587 : 465;
  const portsToTry: Array<465 | 587> = [primaryPort, fallbackPort];
  const resolvedHost = await resolveGmailIpv4Host();
  let lastError = 'SMTP verification failed';

  for (let i = 0; i < portsToTry.length; i++) {
    const port = portsToTry[i];
    const secure = port === 465;
    const transporter = getGmailTransporter(port, resolvedHost);
    if (!transporter) continue;

    try {
      await transporter.verify();
      markWorkingGmailPort(port);
      return {
        ok: true,
        host: cfg.host,
        port,
        secure,
        gmailUser: cfg.gmailUser,
        fromEmail: cfg.fromEmail,
      };
    } catch (err) {
      const rawMsg = err instanceof Error ? err.message : 'SMTP verification failed';
      lastError = cfg.gmailAppPassword
        ? rawMsg.split(cfg.gmailAppPassword).join('[REDACTED]')
        : rawMsg;
      if (!isNetworkPortFailure(err)) {
        return {
          ok: false,
          host: cfg.host,
          port,
          secure,
          gmailUser: cfg.gmailUser,
          fromEmail: cfg.fromEmail,
          error: lastError,
        };
      }
    }
  }

  return {
    ok: false,
    host: cfg.host,
    port: primaryPort,
    secure: primaryPort === 465,
    gmailUser: cfg.gmailUser,
    fromEmail: cfg.fromEmail,
    error: lastError,
  };
}

export function getEmailDiagnostics(requestOrigin?: string, clientOrigin?: string) {
  const cfg = getEffectiveEmailConfig(requestOrigin, clientOrigin);
  const appPasswordLen = cfg.gmailAppPassword.length;
  const appPasswordHint = appPasswordLen
    ? `configured (${appPasswordLen} chars)`
    : 'not configured';
  const defaultSender = parseSenderAddress(env.emailFromEmail, env.emailFromName);
  const envDefaultClientUrl = resolveEffectiveClientUrl(undefined, requestOrigin, clientOrigin);
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
