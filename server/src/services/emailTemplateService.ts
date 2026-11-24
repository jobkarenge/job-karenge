import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';

export interface EmailTemplatePayload {
  subject: string;
  title: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

export function escapeHtml(input: string): string {
  return String(input || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function htmlToPlainText(html: string): string {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|div|h1|h2|h3|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

export function createUnsubscribeToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, purpose: 'unsubscribe' }, env.emailVerificationSecret, { expiresIn: '90d' });
}

export function verifyUnsubscribeToken(token: string): { userId: string; email: string } | null {
  try {
    const decoded = jwt.verify(token, env.emailVerificationSecret) as {
      userId: string;
      email: string;
      purpose?: string;
    };
    if (decoded.purpose !== 'unsubscribe') return null;
    return { userId: decoded.userId, email: decoded.email };
  } catch {
    return null;
  }
}

export function renderBrandedEmail(params: {
  title: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  unsubscribeUrl?: string;
  preferencesUrl?: string;
}): string {
  const ctaBlock =
    params.ctaLabel && params.ctaUrl
      ? `<div style="margin:28px 0;">
          <a href="${escapeHtml(params.ctaUrl)}" style="display:inline-block;background:#102A43;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:12px 24px;border-radius:8px;">
            ${escapeHtml(params.ctaLabel)}
          </a>
        </div>`
      : '';

  const unsubscribeBlock = params.unsubscribeUrl
    ? `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">
        Don&apos;t want promotional job alerts? <a href="${escapeHtml(params.unsubscribeUrl)}" style="color:#2563EB;text-decoration:underline;">Unsubscribe from promotional emails</a>${
          params.preferencesUrl
            ? ` &middot; <a href="${escapeHtml(params.preferencesUrl)}" style="color:#2563EB;text-decoration:underline;">Manage Email Preferences</a>`
            : ''
        }.
      </p>`
    : `<p style="margin:12px 0 0;font-size:12px;color:#64748b;">
        This is an essential transactional notification from Job Karenge.
      </p>`;

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(params.title)}</title>
</head>
<body style="margin:0;padding:0;background:#F8FAFC;font-family:'DM Sans',Arial,sans-serif;color:#0F172A;">
  <span style="display:none;max-height:0;overflow:hidden;">${escapeHtml(params.preheader)}</span>
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border:1px solid #E2E8F0;border-radius:12px;overflow:hidden;">
          <tr>
            <td style="padding:24px 32px;background:#102A43;color:#FFFFFF;">
              <strong style="font-size:20px;letter-spacing:-0.02em;">Job Karenge</strong>
              <span style="font-size:12px;color:#93C5FD;margin-left:10px;">Careers &amp; Talent Platform</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              <h1 style="margin:0 0 16px;font-size:22px;color:#0F172A;">${escapeHtml(params.title)}</h1>
              <div style="font-size:15px;line-height:1.6;color:#334155;">
                ${params.bodyHtml}
              </div>
              ${ctaBlock}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 32px;background:#F8FAFC;border-top:1px solid #E2E8F0;font-size:12px;color:#64748b;">
              <p style="margin:0;">Job Karenge Recruitment Platform &middot; Verified Employers &amp; Real-Time Tracking</p>
              ${unsubscribeBlock}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
