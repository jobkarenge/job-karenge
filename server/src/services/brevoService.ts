import axios, { type AxiosError } from 'axios';
import { createBrevoClient, EMAIL_PATTERN, getEffectiveEmailConfig } from '../config/brevo.ts';
import type { EmailCampaignStats } from '../types/domain.ts';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBrevoError(err: unknown): string {
  if (!err || typeof err !== 'object') return 'Brevo API dispatch error';
  if (axios.isAxiosError(err)) {
    const axErr = err as AxiosError<{ message?: string; code?: string }>;
    const status = axErr.response?.status;
    const data = axErr.response?.data;
    const detail = data?.message || axErr.message || 'Brevo API error';
    const codeTag = data?.code ? ` [${data.code}]` : '';
    return status ? `Brevo ${status}${codeTag}: ${detail}` : detail;
  }
  return err instanceof Error ? err.message : 'Brevo API dispatch error';
}

export interface BrevoSendResult {
  accepted: boolean;
  status: 'queued' | 'failed';
  messageId: string;
  error?: string;
  httpStatus?: number;
}

export async function sendBrevoTransactionalEmail(params: {
  toEmail: string;
  toName?: string;
  subject: string;
  htmlContent: string;
  textContent: string;
  tags?: string[];
  headers?: Record<string, string>;
}): Promise<BrevoSendResult> {
  const cfg = getEffectiveEmailConfig();
  const recipient = (params.toEmail || '').trim();

  if (!EMAIL_PATTERN.test(recipient)) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: `Invalid recipient email address "${recipient}".`,
    };
  }
  if (!cfg.apiKey) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: 'BREVO_API_KEY is not configured.',
    };
  }
  if (!EMAIL_PATTERN.test(cfg.fromEmail)) {
    return {
      accepted: false,
      status: 'failed',
      messageId: '',
      error: `Invalid sender email "${cfg.fromEmail}". Configure a verified sender in BREVO_SENDER_EMAIL or Admin Settings.`,
    };
  }

  const cleanedFromName = (cfg.fromName || 'Job Karenge').trim();
  const rawToName = params.toName?.trim() || '';
  const safeToName =
    rawToName &&
    rawToName.toLowerCase() !== cleanedFromName.toLowerCase() &&
    rawToName.toLowerCase() !== 'job karenge'
      ? rawToName
      : '';

  const client = createBrevoClient(cfg.apiKey);
  const payload = {
    sender: {
      email: cfg.fromEmail,
      name: cleanedFromName,
    },
    to: [
      {
        email: recipient,
        ...(safeToName ? { name: safeToName } : {}),
      },
    ],
    subject: params.subject,
    htmlContent: params.htmlContent,
    textContent: params.textContent,
    ...(params.tags?.length ? { tags: params.tags.slice(0, 10) } : {}),
    ...(params.headers && Object.keys(params.headers).length > 0 ? { headers: params.headers } : {}),
  };

  let lastError = 'Brevo API dispatch failed';
  let lastHttpStatus: number | undefined;

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await client.post<{ messageId?: string; messageIds?: string[] }>('/smtp/email', payload);
      const messageId =
        res.data?.messageId ||
        (Array.isArray(res.data?.messageIds) ? res.data.messageIds[0] : '') ||
        `brevo-${Date.now()}`;
      return {
        accepted: true,
        status: 'queued',
        messageId: String(messageId),
        httpStatus: res.status,
      };
    } catch (err) {
      const axErr = axios.isAxiosError(err) ? (err as AxiosError) : null;
      const status = axErr?.response?.status;
      lastHttpStatus = status;
      lastError = formatBrevoError(err);

      if (status === 401) {
        lastError = `${lastError} — Confirm BREVO_API_KEY is a valid Brevo v3 API key (xkeysib-...) and is active in server secrets.`;
      } else if (status === 403) {
        if (/smtp account is not yet activated|permission_denied/i.test(lastError)) {
          lastError = `${lastError} — Your Brevo API key is valid, but Transactional SMTP sending is disabled on this Brevo account. Activate Transactional/SMTP in your Brevo dashboard or email contact@brevo.com to approve SMTP access.`;
        } else {
          lastError = `${lastError} — Confirm your Brevo API key has Transactional Email permissions and your account is active.`;
        }
      } else if (status === 400 && /sender|valid/i.test(lastError)) {
        lastError = `${lastError} — Verify sender "${cfg.fromEmail}" in Brevo (Senders, Domains & Dedicated IPs) or update Brevo Sender Email in Admin Settings.`;
      } else if (status === 429) {
        lastError = `${lastError} — Brevo rate limit reached.`;
      }

      const retryable = !status || status === 429 || status >= 500;
      if (!retryable || attempt === 3) {
        return {
          accepted: false,
          status: 'failed',
          messageId: '',
          error: lastError,
          httpStatus: lastHttpStatus,
        };
      }

      const retryAfterHeader = axErr?.response?.headers?.['retry-after'];
      const retryAfterSec = retryAfterHeader ? Number(retryAfterHeader) : NaN;
      const delayMs = Number.isFinite(retryAfterSec) && retryAfterSec > 0
        ? Math.min(retryAfterSec * 1000, 5000)
        : 400 * attempt;
      await sleep(delayMs);
    }
  }

  return {
    accepted: false,
    status: 'failed',
    messageId: '',
    error: lastError,
    httpStatus: lastHttpStatus,
  };
}

export async function verifyBrevoAccount(): Promise<{
  ok: boolean;
  email?: string;
  companyName?: string;
  planType?: string;
  credits?: number;
  smtpEnabled?: boolean;
  senderVerified?: boolean;
  error?: string;
}> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }
  try {
    const client = createBrevoClient(cfg.apiKey);
    const res = await client.get<{
      email?: string;
      companyName?: string;
      plan?: Array<{ type?: string; credits?: number }>;
      relay?: { enabled?: boolean };
    }>('/account');

    let senderVerified: boolean | undefined;
    try {
      const sendersRes = await client.get<{
        senders?: Array<{ email?: string; active?: boolean }>;
      }>('/senders');
      const senders = sendersRes.data?.senders || [];
      const match = senders.find((s) => s.email?.trim().toLowerCase() === cfg.fromEmail.toLowerCase());
      senderVerified = Boolean(match?.active);
    } catch {
      // Optional check; omit if endpoint unavailable
    }

    return {
      ok: true,
      email: res.data?.email,
      companyName: res.data?.companyName,
      planType: res.data?.plan?.[0]?.type,
      credits: res.data?.plan?.[0]?.credits,
      smtpEnabled: typeof res.data?.relay?.enabled === 'boolean' ? res.data.relay.enabled : undefined,
      senderVerified,
    };
  } catch (err) {
    return { ok: false, error: formatBrevoError(err) };
  }
}

export async function ensureBrevoList(listName: string): Promise<number | null> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.apiKey) return null;

  try {
    const client = createBrevoClient(cfg.apiKey);
    const listsRes = await client.get<{ lists?: Array<{ id: number; name: string }> }>('/contacts/lists', {
      params: { limit: 50, offset: 0 },
    });
    const existing = (listsRes.data?.lists || []).find(
      (l) => l.name.toLowerCase() === listName.trim().toLowerCase()
    );
    if (existing) return existing.id;

    // Fetch folders to attach a new list to folder 1 (default root folder)
    let folderId = 1;
    try {
      const foldersRes = await client.get<{ folders?: Array<{ id: number }> }>('/contacts/folders', {
        params: { limit: 10, offset: 0 },
      });
      if (foldersRes.data?.folders?.[0]?.id) {
        folderId = foldersRes.data.folders[0].id;
      }
    } catch {
      // Fallback to folder 1
    }

    const createdRes = await client.post<{ id: number }>('/contacts/lists', {
      name: listName.trim(),
      folderId,
    });
    return createdRes.data?.id || null;
  } catch (err) {
    console.warn('[Brevo] Unable to ensure list:', formatBrevoError(err));
    return null;
  }
}

export async function syncContactToBrevo(params: {
  email: string;
  name?: string;
  attributes?: Record<string, string | boolean | number>;
  promotionalOptOut?: boolean;
  listIds?: number[];
  unlinkListIds?: number[];
}): Promise<{ synced: boolean; error?: string }> {
  const cfg = getEffectiveEmailConfig();
  const email = (params.email || '').trim().toLowerCase();
  if (!cfg.apiKey || !EMAIL_PATTERN.test(email)) {
    return { synced: false, error: cfg.apiKey ? 'Invalid email' : 'BREVO_API_KEY not configured' };
  }

  const parts = (params.name || '').trim().split(/\s+/);
  const firstName = parts[0] || '';
  const lastName = parts.slice(1).join(' ');

  try {
    const client = createBrevoClient(cfg.apiKey);
    await client.post('/contacts', {
      email,
      attributes: {
        ...(firstName ? { FIRSTNAME: firstName } : {}),
        ...(lastName ? { LASTNAME: lastName } : {}),
        ...(params.attributes || {}),
      },
      emailBlacklisted: Boolean(params.promotionalOptOut),
      ...(params.listIds && params.listIds.length > 0 ? { listIds: params.listIds } : {}),
      ...(params.unlinkListIds && params.unlinkListIds.length > 0 ? { unlinkListIds: params.unlinkListIds } : {}),
      updateEnabled: true,
    });
    return { synced: true };
  } catch (err) {
    const message = formatBrevoError(err);
    console.warn(`[Brevo] Contact sync warning for ${email}: ${message}`);
    return { synced: false, error: message };
  }
}

export async function createAndSendBrevoCampaign(params: {
  name: string;
  subject: string;
  htmlContent: string;
  listIds: number[];
  scheduledAt?: string;
  sendNow?: boolean;
}): Promise<{
  ok: boolean;
  brevoCampaignId?: number;
  error?: string;
}> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }
  if (!EMAIL_PATTERN.test(cfg.fromEmail)) {
    return { ok: false, error: `Invalid sender email "${cfg.fromEmail}".` };
  }
  if (!params.listIds.length) {
    return { ok: false, error: 'No Brevo contact list IDs available.' };
  }

  try {
    const client = createBrevoClient(cfg.apiKey);
    const createRes = await client.post<{ id: number }>('/emailCampaigns', {
      name: params.name,
      subject: params.subject,
      sender: {
        name: cfg.fromName || 'Job Karenge',
        email: cfg.fromEmail,
      },
      type: 'classic',
      htmlContent: params.htmlContent,
      recipients: {
        listIds: params.listIds,
      },
      ...(params.scheduledAt ? { scheduledAt: new Date(params.scheduledAt).toISOString() } : {}),
    });

    const campaignId = createRes.data?.id;
    if (campaignId && params.sendNow) {
      await client.post(`/emailCampaigns/${campaignId}/sendNow`);
    }
    return { ok: true, brevoCampaignId: campaignId };
  } catch (err) {
    return { ok: false, error: formatBrevoError(err) };
  }
}

export async function fetchBrevoCampaignStatistics(brevoCampaignId: number): Promise<{
  ok: boolean;
  stats?: Partial<EmailCampaignStats>;
  status?: string;
  error?: string;
}> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.apiKey) {
    return { ok: false, error: 'BREVO_API_KEY not configured' };
  }
  try {
    const client = createBrevoClient(cfg.apiKey);
    const res = await client.get<{
      status?: string;
      statistics?: {
        globalStats?: {
          sent?: number;
          delivered?: number;
          softBounces?: number;
          hardBounces?: number;
          uniqueViews?: number;
          uniqueClicks?: number;
          unsubscriptions?: number;
        };
      };
    }>(`/emailCampaigns/${brevoCampaignId}`);

    const gs = res.data?.statistics?.globalStats;
    if (!gs) {
      return { ok: true, status: res.data?.status, stats: {} };
    }
    const bounced = Number(gs.softBounces || 0) + Number(gs.hardBounces || 0);
    return {
      ok: true,
      status: res.data?.status,
      stats: {
        sent: Number(gs.sent || 0),
        delivered: Number(gs.delivered || 0),
        bounced,
        opened: Number(gs.uniqueViews || 0),
        clicked: Number(gs.uniqueClicks || 0),
        unsubscribed: Number(gs.unsubscriptions || 0),
      },
    };
  } catch (err) {
    return { ok: false, error: formatBrevoError(err) };
  }
}
