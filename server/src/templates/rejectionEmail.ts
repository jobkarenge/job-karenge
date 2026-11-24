import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';

export function buildRejectionEmailTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  note?: string;
  jobsUrl: string;
}): EmailTemplatePayload {
  return {
    subject: `Application Update: ${params.jobTitle} at ${params.companyName}`,
    title: 'Application Status Update',
    preheader: `An update regarding your application for ${params.jobTitle} at ${params.companyName}.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>Thank you for taking the time to apply for <strong>${escapeHtml(params.jobTitle)}</strong> at <strong>${escapeHtml(params.companyName)}</strong>.</p>
      <p>At this time, the hiring team has decided to move forward with other candidates whose experience aligns more closely with current role requirements.</p>
      ${params.note ? `<p><strong>Feedback / Note:</strong> ${escapeHtml(params.note)}</p>` : ''}
      <p>We encourage you to explore other active opportunities on Job Karenge that match your skills.</p>`,
    ctaLabel: 'Explore Open Roles',
    ctaUrl: params.jobsUrl,
  };
}
