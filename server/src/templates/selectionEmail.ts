import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';

export function buildSelectionEmailTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  note?: string;
  applicationsUrl: string;
}): EmailTemplatePayload {
  return {
    subject: `Selection Update: ${params.jobTitle} at ${params.companyName}`,
    title: 'Congratulations — You Have Been Selected!',
    preheader: `${params.companyName} has selected you for ${params.jobTitle}.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>We are thrilled to inform you that you have been <strong>Selected</strong> for the <strong>${escapeHtml(params.jobTitle)}</strong> position at <strong>${escapeHtml(params.companyName)}</strong>.</p>
      ${params.note ? `<p><strong>Message from hiring team:</strong> ${escapeHtml(params.note)}</p>` : ''}
      <p>Please check your Candidate Dashboard and watch for onboarding details from the employer.</p>`,
    ctaLabel: 'View Application Details',
    ctaUrl: params.applicationsUrl,
  };
}
