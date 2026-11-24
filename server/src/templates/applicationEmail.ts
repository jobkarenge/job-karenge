import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';
import type { JobRecord } from '../types/domain.ts';

export function buildApplicationConfirmationTemplate(params: {
  candidateName: string;
  job: JobRecord;
  applicationsUrl: string;
}): EmailTemplatePayload {
  return {
    subject: `Application submitted: ${params.job.title} at ${params.job.companyName}`,
    title: 'Application Confirmed',
    preheader: `Your application for ${params.job.title} has been received.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>Your application for <strong>${escapeHtml(params.job.title)}</strong> at <strong>${escapeHtml(params.job.companyName)}</strong> (${escapeHtml(params.job.location)}) has been delivered to the hiring team.</p>
      <p>Track every milestone in real time from your Candidate Dashboard.</p>`,
    ctaLabel: 'Track Application',
    ctaUrl: params.applicationsUrl,
  };
}

export function buildGenericStatusUpdateTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  newStatus: string;
  note?: string;
  applicationsUrl: string;
}): EmailTemplatePayload {
  return {
    subject: `Application Update (${params.newStatus}): ${params.jobTitle}`,
    title: `Application Status: ${params.newStatus}`,
    preheader: `Your application at ${params.companyName} moved to ${params.newStatus}.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>Your application for <strong>${escapeHtml(params.jobTitle)}</strong> at <strong>${escapeHtml(params.companyName)}</strong> has been updated to <strong>${escapeHtml(params.newStatus)}</strong>.</p>
      ${params.note ? `<p><strong>Message from hiring team:</strong> ${escapeHtml(params.note)}</p>` : ''}`,
    ctaLabel: 'View Application Timeline',
    ctaUrl: params.applicationsUrl,
  };
}
