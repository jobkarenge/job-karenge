import axios, { type AxiosInstance } from 'axios';
import {
  cloudinaryMeta,
  env,
  hasExplicitClientUrlEnv,
  hasExplicitServerUrlEnv,
  integrationStatus,
} from './env.ts';
import { db } from '../store/dataLayer.ts';

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseSenderAddress(rawFrom: string, defaultName: string): { email: string; name: string } {
  const match = rawFrom.match(/^(.*?)<([^<>]+)>$/);
  if (match) {
    return {
      email: match[2].trim(),
      name: match[1].trim().replace(/^['"]|['"]$/g, '') || defaultName,
    };
  }
  return { email: rawFrom.trim(), name: defaultName };
}

export function getEffectiveEmailConfig(requestOrigin?: string, clientOrigin?: string) {
  const settings = db.getPlatformSettings();
  const rawFromEmail = settings.brevoSenderEmail?.trim() || env.brevoSenderEmail;
  const rawFromName = settings.brevoSenderName?.trim() || env.brevoSenderName;
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
    apiKey: env.brevoApiKey,
    baseUrl: env.brevoBaseUrl || 'https://api.brevo.com/v3',
    webhookSecret: env.brevoWebhookSecret,
    fromEmail: sender.email,
    fromName: sender.name,
    fromEmailSource: settings.brevoSenderEmail?.trim()
      ? ('admin_settings' as const)
      : process.env.BREVO_SENDER_EMAIL?.trim()
        ? ('env' as const)
        : ('default' as const),
    fromNameSource: settings.brevoSenderName?.trim()
      ? ('admin_settings' as const)
      : process.env.BREVO_SENDER_NAME?.trim()
        ? ('env' as const)
        : ('default' as const),
    clientUrl,
    serverUrl,
  };
}

export function createBrevoClient(apiKeyOverride?: string): AxiosInstance {
  const cfg = getEffectiveEmailConfig();
  const apiKey = apiKeyOverride || cfg.apiKey;
  return axios.create({
    baseURL: cfg.baseUrl,
    timeout: 15_000,
    headers: {
      'api-key': apiKey,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
  });
}

export function getEmailDiagnostics(requestOrigin?: string, clientOrigin?: string) {
  const cfg = getEffectiveEmailConfig(requestOrigin, clientOrigin);
  const key = cfg.apiKey;
  const apiKeyHint = key
    ? key.length > 10
      ? `${key.slice(0, 8)}...${key.slice(-4)} (len ${key.length})`
      : `configured (len ${key.length})`
    : 'not configured';
  const apiKeyStartsWithXkeysib = Boolean(key && key.startsWith('xkeysib-'));
  const apiKeyFormatValid = Boolean(key && apiKeyStartsWithXkeysib && key.length >= 40);
  const defaultSender = parseSenderAddress(env.brevoSenderEmail, env.brevoSenderName);
  const envDefaultClientUrl = hasExplicitClientUrlEnv
    ? env.clientUrl
    : clientOrigin || requestOrigin || env.clientUrl;
  const envDefaultServerUrl = hasExplicitServerUrlEnv
    ? env.serverUrl
    : requestOrigin || env.serverUrl;

  return {
    provider: 'brevo' as const,
    brevoConfigured: Boolean(key),
    apiKeyHint,
    apiKeyStartsWithXkeysib,
    apiKeyFormatValid,
    brevoBaseUrl: cfg.baseUrl,
    webhookSecretConfigured: Boolean(cfg.webhookSecret),
    webhookEndpointUrl: `${cfg.serverUrl}/api/email/webhooks/brevo`,
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
      brevoBaseUrl: env.brevoBaseUrl,
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
