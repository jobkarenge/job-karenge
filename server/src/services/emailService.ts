import {
  getEffectiveEmailConfig,
  getEmailDiagnostics,
  verifyGmailSmtpConnection,
} from '../config/mailer.ts';
import { db } from '../store/dataLayer.ts';
import { buildApplicationConfirmationTemplate, buildGenericStatusUpdateTemplate } from '../templates/applicationEmail.ts';
import { buildInterviewEmailTemplate } from '../templates/interviewEmail.ts';
import { buildPromotionalDigestTemplate } from '../templates/promotionalEmail.ts';
import { buildRejectionEmailTemplate } from '../templates/rejectionEmail.ts';
import { buildSelectionEmailTemplate } from '../templates/selectionEmail.ts';
import { buildShortlistEmailTemplate } from '../templates/shortlistEmail.ts';
import {
  buildAccountNotificationTemplate,
  buildPasswordResetTemplate,
  buildWelcomeEmailTemplate,
} from '../templates/welcomeEmail.ts';
import type { EmailCampaignRecord, JobRecord, UserRecord } from '../types/domain.ts';
import {
  createUnsubscribeToken,
  htmlToPlainText,
  renderBrandedEmail,
  verifyUnsubscribeToken,
} from './emailTemplateService.ts';
import { sendGmailSmtpEmail } from './gmailSmtpService.ts';

export {
  createUnsubscribeToken,
  getEffectiveEmailConfig,
  getEmailDiagnostics,
  verifyGmailSmtpConnection,
  verifyUnsubscribeToken,
};

export type EmailDispatchResult = {
  status: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed';
  accepted: boolean;
  messageId: string;
  error?: string;
};

export async function dispatchEmailBounded(
  promise: Promise<EmailDispatchResult>,
  timeoutMs = 8000
): Promise<EmailDispatchResult> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const safePromise = promise.catch((err): EmailDispatchResult => ({
    status: 'failed',
    accepted: false,
    messageId: '',
    error: err instanceof Error ? err.message : 'Email dispatch failed',
  }));
  try {
    return await Promise.race([
      safePromise,
      new Promise<EmailDispatchResult>((resolve) => {
        timer = setTimeout(() => {
          resolve({
            status: 'queued',
            accepted: true,
            messageId: `queued-${Date.now()}`,
          });
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function dispatchEmail(params: {
  to: string;
  toName?: string;
  userId?: string;
  type: 'transactional' | 'promotional';
  templateName: string;
  subject: string;
  title: string;
  preheader: string;
  bodyHtml: string;
  ctaLabel?: string;
  ctaUrl?: string;
  campaignId?: string;
  jobId?: string;
  dedupeKey?: string;
  requestOrigin?: string;
  clientOrigin?: string;
}): Promise<EmailDispatchResult> {
  // Prevent duplicate sends when an explicit dedupeKey is provided (e.g., digest window or job alert)
  if (params.dedupeKey) {
    const existing = await db.findEmailLogByDedupeKey(params.dedupeKey);
    if (existing) {
      const normalizedStatus =
        existing.status === 'delivered'
          ? 'delivered'
          : existing.status === 'sent'
            ? 'sent'
            : existing.status === 'simulated'
              ? 'simulated'
              : 'queued';
      return {
        status: normalizedStatus,
        accepted: existing.status !== 'failed',
        messageId: existing.messageId,
      };
    }
  }

  // Respect unsubscribe / preference opt-out strictly for promotional emails ONLY.
  // Essential transactional emails ALWAYS continue even after promotional unsubscribe.
  if (params.type === 'promotional' && params.userId) {
    const pref = await db.getEmailPreference(params.userId);
    if (!pref.promotionalEmails || pref.unsubscribedAt) {
      return { status: 'simulated', accepted: false, messageId: 'skipped-unsubscribed' };
    }
  }

  const recipient = (params.to || '').trim();
  if (!recipient) {
    return { status: 'failed', accepted: false, messageId: '', error: 'Missing recipient email address.' };
  }

  const cfg = getEffectiveEmailConfig(params.requestOrigin, params.clientOrigin);
  const unsubscribeUrl =
    params.type === 'promotional' && params.userId
      ? `${cfg.clientUrl}/unsubscribe?token=${encodeURIComponent(createUnsubscribeToken(params.userId, recipient))}`
      : undefined;
  const preferencesUrl =
    params.type === 'promotional' && params.userId
      ? `${cfg.clientUrl}/candidate/email-preferences`
      : undefined;

  const html = renderBrandedEmail({
    title: params.title,
    preheader: params.preheader,
    bodyHtml: params.bodyHtml,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
    unsubscribeUrl,
    preferencesUrl,
  });

  const text = [
    params.title,
    '',
    htmlToPlainText(params.bodyHtml),
    params.ctaUrl ? `\n${params.ctaLabel || 'Open'}: ${params.ctaUrl}` : '',
    unsubscribeUrl ? `\nUnsubscribe: ${unsubscribeUrl}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  if (cfg.gmailUser && cfg.gmailAppPassword) {
    const headers: Record<string, string> = {};
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    }

    const res = await sendGmailSmtpEmail({
      toEmail: recipient,
      toName: params.toName,
      subject: params.subject,
      htmlContent: html,
      textContent: text,
      headers,
    });

    if (res.accepted) {
      await db.createEmailLog({
        recipientEmail: recipient,
        recipientUserId: params.userId,
        type: params.type,
        templateName: params.templateName,
        subject: params.subject,
        status: 'sent',
        provider: 'gmail_smtp',
        smtpEvent: 'smtp_accepted',
        deliveredAt: new Date().toISOString(),
        campaignId: params.campaignId || '',
        jobId: params.jobId || '',
        dedupeKey: params.dedupeKey || '',
        messageId: res.messageId,
        htmlPreview: html,
      });
      return { status: 'sent', accepted: true, messageId: res.messageId };
    }

    console.warn(`[Email][Gmail SMTP] Dispatch failed (${params.templateName} -> ${recipient}): ${res.error}`);
    await db.createEmailLog({
      recipientEmail: recipient,
      recipientUserId: params.userId,
      type: params.type,
      templateName: params.templateName,
      subject: params.subject,
      status: 'failed',
      provider: 'gmail_smtp',
      smtpEvent: 'smtp_rejected',
      campaignId: params.campaignId || '',
      jobId: params.jobId || '',
      dedupeKey: params.dedupeKey || '',
      messageId: '',
      error: res.error || 'Gmail SMTP rejected request',
      htmlPreview: html,
    });
    return { status: 'failed', accepted: false, messageId: '', error: res.error };
  }

  // GMAIL_USER / GMAIL_APP_PASSWORD not configured: log preview transparently without claiming SMTP delivery
  const simId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.createEmailLog({
    recipientEmail: recipient,
    recipientUserId: params.userId,
    type: params.type,
    templateName: params.templateName,
    subject: params.subject,
    status: 'simulated',
    provider: 'gmail_smtp',
    smtpEvent: 'not_configured_preview',
    campaignId: params.campaignId || '',
    jobId: params.jobId || '',
    dedupeKey: params.dedupeKey || '',
    messageId: simId,
    htmlPreview: html,
  });
  return { status: 'simulated', accepted: false, messageId: simId };
}

export async function sendWelcomeEmail(
  user: { _id: string; name: string; email: string; role: string },
  verificationToken: string,
  requestOrigin?: string,
  clientOrigin?: string
) {
  const { clientUrl } = getEffectiveEmailConfig(requestOrigin, clientOrigin);
  const verifyUrl = `${clientUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const tpl = buildWelcomeEmailTemplate({ name: user.name, role: user.role, verifyUrl });

  return dispatchEmail({
    to: user.email,
    toName: user.name,
    userId: user._id,
    type: 'transactional',
    templateName: 'welcome_verification',
    requestOrigin,
    clientOrigin,
    ...tpl,
  });
}

export async function sendPasswordResetEmail(
  user: { _id: string; name: string; email: string },
  resetToken: string,
  requestOrigin?: string,
  clientOrigin?: string
) {
  const { clientUrl } = getEffectiveEmailConfig(requestOrigin, clientOrigin);
  const resetUrl = `${clientUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const tpl = buildPasswordResetTemplate({ name: user.name, resetUrl });
  return dispatchEmail({
    to: user.email,
    toName: user.name,
    userId: user._id,
    type: 'transactional',
    templateName: 'password_reset',
    requestOrigin,
    clientOrigin,
    ...tpl,
  });
}

export async function sendAccountNotificationEmail(params: {
  user: { _id: string; name: string; email: string };
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
  requestOrigin?: string;
  clientOrigin?: string;
}) {
  const tpl = buildAccountNotificationTemplate({
    name: params.user.name,
    title: params.title,
    message: params.message,
    ctaLabel: params.ctaLabel,
    ctaUrl: params.ctaUrl,
  });
  return dispatchEmail({
    to: params.user.email,
    toName: params.user.name,
    userId: params.user._id,
    type: 'transactional',
    templateName: 'account_notification',
    requestOrigin: params.requestOrigin,
    clientOrigin: params.clientOrigin,
    ...tpl,
  });
}

export async function sendApplicationConfirmationEmail(params: {
  candidate: { _id: string; name: string; email: string };
  job: JobRecord;
  requestOrigin?: string;
  clientOrigin?: string;
}) {
  const { clientUrl } = getEffectiveEmailConfig(params.requestOrigin, params.clientOrigin);
  const tpl = buildApplicationConfirmationTemplate({
    candidateName: params.candidate.name,
    job: params.job,
    applicationsUrl: `${clientUrl}/candidate/applications`,
  });
  return dispatchEmail({
    to: params.candidate.email,
    toName: params.candidate.name,
    userId: params.candidate._id,
    type: 'transactional',
    templateName: 'application_confirmation',
    jobId: params.job._id,
    requestOrigin: params.requestOrigin,
    clientOrigin: params.clientOrigin,
    ...tpl,
  });
}

export async function sendApplicationStatusUpdateEmail(params: {
  candidate: { _id: string; name: string; email: string };
  jobTitle: string;
  companyName: string;
  newStatus: string;
  note?: string;
  requestOrigin?: string;
  clientOrigin?: string;
}) {
  const { clientUrl } = getEffectiveEmailConfig(params.requestOrigin, params.clientOrigin);
  const applicationsUrl = `${clientUrl}/candidate/applications`;

  let templateName = 'application_status_update';
  let tpl;

  if (params.newStatus === 'Shortlisted') {
    templateName = 'application_shortlisted';
    tpl = buildShortlistEmailTemplate({
      candidateName: params.candidate.name,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      note: params.note,
      applicationsUrl,
    });
  } else if (params.newStatus === 'Selected') {
    templateName = 'candidate_selected';
    tpl = buildSelectionEmailTemplate({
      candidateName: params.candidate.name,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      note: params.note,
      applicationsUrl,
    });
  } else if (params.newStatus === 'Rejected') {
    templateName = 'candidate_rejected';
    tpl = buildRejectionEmailTemplate({
      candidateName: params.candidate.name,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      note: params.note,
      jobsUrl: `${clientUrl}/jobs`,
    });
  } else {
    templateName = params.newStatus === 'Interview Scheduled' ? 'interview_scheduled' : 'application_status_update';
    tpl = buildGenericStatusUpdateTemplate({
      candidateName: params.candidate.name,
      jobTitle: params.jobTitle,
      companyName: params.companyName,
      newStatus: params.newStatus,
      note: params.note,
      applicationsUrl,
    });
  }

  return dispatchEmail({
    to: params.candidate.email,
    toName: params.candidate.name,
    userId: params.candidate._id,
    type: 'transactional',
    templateName,
    requestOrigin: params.requestOrigin,
    clientOrigin: params.clientOrigin,
    ...tpl,
  });
}

export async function sendInterviewEmail(params: {
  candidate: { _id: string; name: string; email: string };
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
  requestOrigin?: string;
  clientOrigin?: string;
}) {
  const { clientUrl } = getEffectiveEmailConfig(params.requestOrigin, params.clientOrigin);
  const tpl = buildInterviewEmailTemplate({
    candidateName: params.candidate.name,
    jobTitle: params.jobTitle,
    companyName: params.companyName,
    event: params.event,
    date: params.date,
    time: params.time,
    timezone: params.timezone,
    type: params.type,
    meetingLinkOrLocation: params.meetingLinkOrLocation,
    interviewerName: params.interviewerName,
    instructions: params.instructions,
    interviewsUrl: `${clientUrl}/candidate/interviews`,
  });

  return dispatchEmail({
    to: params.candidate.email,
    toName: params.candidate.name,
    userId: params.candidate._id,
    type: 'transactional',
    templateName: `interview_${params.event}`,
    requestOrigin: params.requestOrigin,
    clientOrigin: params.clientOrigin,
    ...tpl,
  });
}

export async function sendPromotionalDigest(params: {
  candidate: { _id: string; name: string; email: string };
  jobs: JobRecord[];
  subject: string;
  campaignTitle: string;
  digestKind?:
    | 'daily_job_digest'
    | 'weekly_job_digest'
    | 'new_job_alert'
    | 'featured_job_announcement'
    | 'personalized_recommendations'
    | 'career_updates';
  campaignId?: string;
  jobId?: string;
  dedupeKey?: string;
}) {
  const { clientUrl } = getEffectiveEmailConfig();
  const tpl = buildPromotionalDigestTemplate({
    candidateName: params.candidate.name,
    jobs: params.jobs,
    subject: params.subject,
    campaignTitle: params.campaignTitle,
    clientUrl,
    digestKind: params.digestKind,
  });

  return dispatchEmail({
    to: params.candidate.email,
    toName: params.candidate.name,
    userId: params.candidate._id,
    type: 'promotional',
    templateName: params.digestKind || 'promotional_job_digest',
    campaignId: params.campaignId,
    jobId: params.jobId,
    dedupeKey: params.dedupeKey,
    ...tpl,
  });
}

export function matchJobsForCandidate(params: {
  jobs: JobRecord[];
  candidateProfile: Awaited<ReturnType<typeof db.getCandidateProfile>>;
  pref: Awaited<ReturnType<typeof db.getEmailPreference>>;
  candidateUser?: Pick<UserRecord, 'location'> | null;
}): JobRecord[] {
  const { jobs, candidateProfile, pref, candidateUser } = params;
  const categories = new Set(pref.preferredCategories.map((c) => c.toLowerCase()));
  const locations = new Set(pref.preferredLocations.map((l) => l.toLowerCase()));
  const workModes = new Set(pref.preferredWorkModes.map((w) => w.toLowerCase()));
  const skills = new Set((candidateProfile?.technicalSkills || []).map((s) => s.name.toLowerCase()));
  const userLocation = (candidateProfile?.currentLocation || candidateUser?.location || '').trim().toLowerCase();
  const expYears = candidateProfile?.totalExperienceYears ?? 0;

  const scored = jobs.map((job) => {
    let score = 0;
    if (categories.size > 0 && categories.has(job.category.toLowerCase())) score += 4;
    if (workModes.size > 0 && workModes.has(job.workMode.toLowerCase())) score += 2;
    if (locations.size > 0) {
      const jobLoc = job.location.toLowerCase();
      if ([...locations].some((loc) => jobLoc.includes(loc))) score += 3;
    } else if (userLocation && job.location.toLowerCase().includes(userLocation)) {
      score += 2;
    }
    if (skills.size > 0 && job.skills.some((s) => skills.has(s.toLowerCase()))) {
      score += 3;
    }
    if (job.requiredExperience && expYears >= 0) {
      const m = job.requiredExperience.match(/(\d+)/);
      const minExp = m ? Number(m[1]) : 0;
      if (expYears >= minExp) score += 1;
    }
    if (job.featured) score += 1;
    return { job, score };
  });

  const strictMatches = scored.filter((item) => item.score > 0).sort((a, b) => b.score - a.score);
  if (strictMatches.length > 0) {
    return strictMatches.map((m) => m.job);
  }
  return jobs;
}

export async function recomputeCampaignStatsFromLogs(campaignId: string): Promise<EmailCampaignRecord | null> {
  const campaign = await db.findEmailCampaignById(campaignId);
  if (!campaign) return null;

  const logs = await db.listEmailLogsByCampaign(campaignId);
  if (logs.length === 0) return campaign;

  const sentAndDelivered = logs.filter((l) => l.status === 'sent' || l.status === 'delivered').length;
  const failed = logs.filter((l) => l.status === 'failed').length;
  const bounced = logs.filter((l) => l.status === 'bounced').length;
  const accepted = logs.filter((l) => l.status === 'queued' || l.status === 'sent' || l.status === 'delivered').length;

  return db.updateEmailCampaign(campaignId, {
    lastStatsSyncAt: new Date().toISOString(),
    stats: {
      sent: campaign.stats.sent || logs.length,
      accepted,
      delivered: Math.max(campaign.stats.delivered || 0, sentAndDelivered),
      failed: Math.max(campaign.stats.failed || 0, failed),
      bounced: Math.max(campaign.stats.bounced || 0, bounced),
      unsubscribed: campaign.stats.unsubscribed || 0,
      opened: campaign.stats.opened || 0,
      clicked: campaign.stats.clicked || 0,
    },
  });
}
