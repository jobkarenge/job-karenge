import { escapeHtml, type EmailTemplatePayload } from '../services/emailTemplateService.ts';

export function buildInterviewEmailTemplate(params: {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  event: 'scheduled' | 'rescheduled' | 'cancelled' | 'reminder';
  date: string;
  time: string;
  timezone: string;
  type: string;
  meetingLinkOrLocation?: string;
  interviewerName: string;
  instructions?: string;
  interviewsUrl: string;
}): EmailTemplatePayload {
  const subjectPrefix =
    params.event === 'scheduled'
      ? 'Interview Scheduled'
      : params.event === 'rescheduled'
        ? 'Interview Rescheduled'
        : params.event === 'cancelled'
          ? 'Interview Cancelled'
          : 'Upcoming Interview Reminder';

  const locationText = params.meetingLinkOrLocation?.trim();
  const locationLine = locationText
    ? `<li><strong>Location / Link:</strong> ${escapeHtml(locationText)}</li>`
    : params.type === 'In-person'
      ? '<li><strong>Venue:</strong> In-person / Offline</li>'
      : '';
  const instructionsLine = params.instructions?.trim()
    ? `<p><strong>Instructions:</strong> ${escapeHtml(params.instructions.trim())}</p>`
    : '';

  return {
    subject: `${subjectPrefix}: ${params.jobTitle} at ${params.companyName}`,
    title: subjectPrefix,
    preheader: `${subjectPrefix} for ${params.jobTitle} on ${params.date}.`,
    bodyHtml: `<p>Hi ${escapeHtml(params.candidateName)},</p>
      <p>Details for your <strong>${escapeHtml(params.type)}</strong> interview for <strong>${escapeHtml(params.jobTitle)}</strong> at <strong>${escapeHtml(params.companyName)}</strong>:</p>
      <ul style="padding-left:18px;">
        <li><strong>Date:</strong> ${escapeHtml(params.date)}</li>
        <li><strong>Time:</strong> ${escapeHtml(params.time)} (${escapeHtml(params.timezone)})</li>
        <li><strong>Interviewer:</strong> ${escapeHtml(params.interviewerName)}</li>
        ${locationLine}
      </ul>
      ${instructionsLine}`,
    ctaLabel: 'Open Interview Schedule',
    ctaUrl: params.interviewsUrl,
  };
}
