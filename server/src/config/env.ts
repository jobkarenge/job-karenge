import crypto from 'crypto';
import dotenv from 'dotenv';
import type { Request } from 'express';
import fs from 'fs';
import path from 'path';

const serverEnvPath = path.resolve(import.meta.dirname, '../../.env');
const rootEnvPath = path.resolve(import.meta.dirname, '../../../.env');
if (fs.existsSync(serverEnvPath)) dotenv.config({ path: serverEnvPath });
if (fs.existsSync(rootEnvPath)) dotenv.config({ path: rootEnvPath });
dotenv.config();

const fallbackAccessSecret = crypto.randomBytes(32).toString('hex');
const fallbackRefreshSecret = crypto.randomBytes(32).toString('hex');
const fallbackEmailSecret = crypto.randomBytes(32).toString('hex');
const fallbackResetSecret = crypto.randomBytes(32).toString('hex');

function cleanEnvValue(value?: string): string {
  return value ? value.trim().replace(/^['"]|['"]$/g, '').trim() : '';
}

function cleanGmailAppPassword(value?: string): string {
  return cleanEnvValue(value)
    .replace(/^GMAIL_APP_PASSWORD\s*=\s*/i, '')
    .replace(/^['"]|['"]$/g, '')
    .replace(/\s+/g, '')
    .trim();
}

function cleanBaseUrl(value?: string): string {
  return cleanEnvValue(value).replace(/\/+$/, '');
}

function normalizeHostUrl(value?: string): string {
  const cleaned = cleanBaseUrl(value);
  if (!cleaned) return '';
  if (/^https?:\/\//i.test(cleaned)) return cleaned;
  return `https://${cleaned}`;
}

export function parseCloudinaryUrl(rawUrl?: string): {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
} {
  const cleaned = cleanEnvValue(rawUrl).replace(/^CLOUDINARY_URL\s*=\s*/i, '');
  if (!cleaned) return { cloudName: '', apiKey: '', apiSecret: '' };
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol !== 'cloudinary:') {
      return { cloudName: '', apiKey: '', apiSecret: '' };
    }
    return {
      cloudName: decodeURIComponent(parsed.hostname || '').trim(),
      apiKey: decodeURIComponent(parsed.username || '').trim(),
      apiSecret: decodeURIComponent(parsed.password || '').trim(),
    };
  } catch {
    return { cloudName: '', apiKey: '', apiSecret: '' };
  }
}

const fromCloudinaryUrl = parseCloudinaryUrl(process.env.CLOUDINARY_URL);
const cloudinaryCloudName = cleanEnvValue(process.env.CLOUDINARY_CLOUD_NAME) || fromCloudinaryUrl.cloudName;
const cloudinaryApiKey = cleanEnvValue(process.env.CLOUDINARY_API_KEY) || fromCloudinaryUrl.apiKey;
const cloudinaryApiSecret = cleanEnvValue(process.env.CLOUDINARY_API_SECRET) || fromCloudinaryUrl.apiSecret;

const explicitServerUrl =
  cleanBaseUrl(process.env.SERVER_URL) ||
  cleanBaseUrl(process.env.APP_URL) ||
  cleanBaseUrl(process.env.RENDER_EXTERNAL_URL) ||
  normalizeHostUrl(process.env.RAILWAY_PUBLIC_DOMAIN) ||
  normalizeHostUrl(process.env.KOYEB_PUBLIC_DOMAIN) ||
  (cleanEnvValue(process.env.FLY_APP_NAME) ? `https://${cleanEnvValue(process.env.FLY_APP_NAME)}.fly.dev` : '');

const explicitClientUrl = cleanBaseUrl(process.env.CLIENT_URL) || cleanBaseUrl(process.env.APP_URL);
const port = Number(process.env.PORT || 3000);

export const hasExplicitServerUrlEnv = Boolean(explicitServerUrl);
export const hasExplicitClientUrlEnv = Boolean(explicitClientUrl);

export const env = {
  port,
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  mongodbUri: cleanEnvValue(process.env.MONGODB_URI),
  clientUrl: explicitClientUrl || `http://localhost:${port}`,
  serverUrl: explicitServerUrl || `http://localhost:${port}`,
  jwtAccessSecret: cleanEnvValue(process.env.JWT_ACCESS_SECRET) || fallbackAccessSecret,
  jwtRefreshSecret: cleanEnvValue(process.env.JWT_REFRESH_SECRET) || fallbackRefreshSecret,
  emailVerificationSecret: cleanEnvValue(process.env.EMAIL_VERIFICATION_SECRET) || fallbackEmailSecret,
  passwordResetSecret: cleanEnvValue(process.env.PASSWORD_RESET_SECRET) || fallbackResetSecret,
  adminSetupPasscode: cleanEnvValue(process.env.ADMIN_SETUP_PASSCODE),
  cloudinaryCloudName,
  cloudinaryApiKey,
  cloudinaryApiSecret,
  emailProvider: cleanEnvValue(process.env.EMAIL_PROVIDER) || 'gmail',
  gmailSmtpPort: Number(cleanEnvValue(process.env.GMAIL_SMTP_PORT) || 465) === 587 ? 587 : 465,
  gmailUser: cleanEnvValue(process.env.GMAIL_USER).replace(/^GMAIL_USER\s*=\s*/i, '').trim(),
  gmailAppPassword: cleanGmailAppPassword(process.env.GMAIL_APP_PASSWORD),
  emailFromName:
    cleanEnvValue(process.env.EMAIL_FROM_NAME).replace(/^EMAIL_FROM_NAME\s*=\s*/i, '').trim() || 'Job Karenge',
  emailFromEmail:
    cleanEnvValue(process.env.EMAIL_FROM_EMAIL).replace(/^EMAIL_FROM_EMAIL\s*=\s*/i, '').trim() ||
    cleanEnvValue(process.env.GMAIL_USER).replace(/^GMAIL_USER\s*=\s*/i, '').trim() ||
    'jobkarenge.support@gmail.com',
};

const missingCloudinaryVars: string[] = [];
if (!cloudinaryCloudName) missingCloudinaryVars.push('CLOUDINARY_CLOUD_NAME');
if (!cloudinaryApiKey) missingCloudinaryVars.push('CLOUDINARY_API_KEY');
if (!cloudinaryApiSecret) missingCloudinaryVars.push('CLOUDINARY_API_SECRET');

export const cloudinaryMeta = {
  configured: Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret),
  cloudName: cloudinaryCloudName,
  source: (Boolean(cloudinaryCloudName && cloudinaryApiKey && cloudinaryApiSecret)
    ? Boolean(
        cleanEnvValue(process.env.CLOUDINARY_CLOUD_NAME) &&
          cleanEnvValue(process.env.CLOUDINARY_API_KEY) &&
          cleanEnvValue(process.env.CLOUDINARY_API_SECRET)
      )
      ? 'env_vars'
      : 'cloudinary_url'
    : 'none') as 'env_vars' | 'cloudinary_url' | 'none',
  missingVars: missingCloudinaryVars,
};

export const integrationStatus = {
  mongodbConfigured: Boolean(env.mongodbUri),
  cloudinaryConfigured: cloudinaryMeta.configured,
  emailConfigured: Boolean(env.gmailUser && env.gmailAppPassword),
};

export function isLocalhostUrl(value?: string): boolean {
  const raw = (value || '').trim();
  if (!raw) return false;
  try {
    const host = new URL(raw).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0';
  } catch {
    return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(raw);
  }
}

export function resolveRequestOrigin(req?: Pick<Request, 'headers' | 'protocol' | 'get'>): string | undefined {
  if (!req) return undefined;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  if (!forwardedHost) return undefined;
  return `${forwardedProto}://${forwardedHost}`.replace(/\/+$/, '');
}

export function resolveClientOrigin(req?: Pick<Request, 'headers' | 'get'>): string | undefined {
  if (!req) return undefined;
  const rawOrigin = String(req.get('origin') || req.headers.origin || '').trim();
  const rawReferer = String(req.get('referer') || req.headers.referer || '').trim();
  for (const candidate of [rawOrigin, rawReferer]) {
    if (!candidate) continue;
    try {
      const parsed = new URL(candidate);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.origin.replace(/\/+$/, '');
      }
    } catch {
      // try next candidate
    }
  }
  return undefined;
}
