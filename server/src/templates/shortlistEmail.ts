import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';

export function buildShortlistEmailTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  note?: string;
  applicationsUrl: string;
}): EmailTemplatePayload {
  return {
    subject: `Application Shortlisted: ${params.jobTitle} at ${params.companyName}`,
    title: 'You Have Been Shortlisted!',
    preheader: `Great news! ${params.companyName} shortlisted your application for ${params.jobTitle}.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>Congratulations! Your application for <strong>${escapeHtml(params.jobTitle)}</strong> at <strong>${escapeHtml(params.companyName)}</strong> has been <strong>Shortlisted</strong> by the hiring team.</p>
      ${params.note ? `<p><strong>Recruiter Note:</strong> ${escapeHtml(params.note)}</p>` : ''}
      <p>Stay tuned for next-step updates and interview scheduling details on your Candidate Dashboard.</p>`,
    ctaLabel: 'View Application Timeline',
    ctaUrl: params.applicationsUrl,
  };
}
