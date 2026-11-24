import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';

export function buildWelcomeEmailTemplate(params: {
  name: string;
  role: string;
  verifyUrl: string;
}): EmailTemplatePayload {
  return {
    subject: 'Welcome to Job Karenge — Verify your email address',
    title: `Welcome aboard, ${params.name}`,
    preheader: 'Verify your Job Karenge account to start applying or hiring.',
    bodyHtml: `<p>Your ${escapeHtml(params.role)} account on <strong>Job Karenge</strong> has been created.</p>
      <p>Please verify your email address to activate full dashboard features, real-time application updates, and interview alerts.</p>`,
    ctaLabel: 'Verify Email Address',
    ctaUrl: params.verifyUrl,
  };
}

export function buildPasswordResetTemplate(params: {
  name: string;
  resetUrl: string;
}): EmailTemplatePayload {
  return {
    subject: 'Reset your Job Karenge password',
    title: 'Password Reset Request',
    preheader: 'Use this secure link to set a new password.',
    bodyHtml: `<p>Hello ${escapeHtml(params.name)},</p>
      <p>We received a request to reset the password for your Job Karenge account. This link expires in 60 minutes.</p>
      <p style="font-size:13px;color:#64748b;">If you did not request a password reset, you can safely ignore this email.</p>`,
    ctaLabel: 'Reset Password',
    ctaUrl: params.resetUrl,
  };
}

export function buildAccountNotificationTemplate(params: {
  name: string;
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
}): EmailTemplatePayload {
  return {
    subject: `${params.title} — Job Karenge`,
    title: params.title,
    preheader: params.message,
    bodyHtml: `<p>Hi ${escapeHtml(params.name)},</p>
      <p>${escapeHtml(params.message)}</p>`,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
  };
}
