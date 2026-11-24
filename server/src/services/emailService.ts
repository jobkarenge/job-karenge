import { getEffectiveEmailConfig, getEmailDiagnostics } from '../config/brevo.ts';
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
import type { EmailCampaignRecord, EmailLogRecord, JobRecord, UserRecord } from '../types/domain.ts';
import {
  ensureBrevoList,
  sendBrevoTransactionalEmail,
  syncContactToBrevo,
  verifyBrevoAccount,
} from './brevoService.ts';
import {
  createUnsubscribeToken,
  htmlToPlainText,
  renderBrandedEmail,
  verifyUnsubscribeToken,
} from './emailTemplateService.ts';

export { createUnsubscribeToken, getEffectiveEmailConfig, getEmailDiagnostics, verifyUnsubscribeToken };

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
}): Promise<{
  status: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed';
  accepted: boolean;
  messageId: string;
  error?: string;
}> {
  // Prevent duplicate sends when an explicit dedupeKey is provided (e.g., digest window or job alert)
  if (params.dedupeKey) {
    const existing = await db.findEmailLogByDedupeKey(params.dedupeKey);
    if (existing) {
      return {
        status: existing.status === 'delivered' ? 'delivered' : existing.status === 'simulated' ? 'simulated' : 'queued',
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

  const cfg = getEffectiveEmailConfig();
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

  if (cfg.apiKey) {
    const headers: Record<string, string> = {};
    if (unsubscribeUrl) {
      headers['List-Unsubscribe'] = `<${unsubscribeUrl}>`;
    }

    const res = await sendBrevoTransactionalEmail({
      toEmail: recipient,
      toName: params.toName,
      subject: params.subject,
      htmlContent: html,
      textContent: text,
      tags: [params.type, params.templateName],
      headers,
    });

    if (res.accepted) {
      // Mark as 'queued' (accepted by Brevo API). Actual 'delivered' state is promoted only via Brevo webhook events.
      await db.createEmailLog({
        recipientEmail: recipient,
        recipientUserId: params.userId,
        type: params.type,
        templateName: params.templateName,
        subject: params.subject,
        status: 'queued',
        provider: 'brevo',
        brevoEvent: 'api_accepted',
        campaignId: params.campaignId || '',
        jobId: params.jobId || '',
        dedupeKey: params.dedupeKey || '',
        messageId: res.messageId,
        htmlPreview: html,
      });
      return { status: 'queued', accepted: true, messageId: res.messageId };
    }

    console.warn(`[Email][Brevo] Dispatch failed (${params.templateName} -> ${recipient}): ${res.error}`);
    await db.createEmailLog({
      recipientEmail: recipient,
      recipientUserId: params.userId,
      type: params.type,
      templateName: params.templateName,
      subject: params.subject,
      status: 'failed',
      provider: 'brevo',
      brevoEvent: 'api_rejected',
      campaignId: params.campaignId || '',
      jobId: params.jobId || '',
      dedupeKey: params.dedupeKey || '',
      messageId: '',
      error: res.error || 'Brevo API rejected request',
      htmlPreview: html,
    });
    return { status: 'failed', accepted: false, messageId: '', error: res.error };
  }

  // BREVO_API_KEY not configured: record log preview transparently without claiming Brevo acceptance/delivery
  const simId = `preview-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  await db.createEmailLog({
    recipientEmail: recipient,
    recipientUserId: params.userId,
    type: params.type,
    templateName: params.templateName,
    subject: params.subject,
    status: 'simulated',
    provider: 'brevo',
    brevoEvent: 'not_configured_preview',
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
  verificationToken: string
) {
  const { clientUrl } = getEffectiveEmailConfig();
  const verifyUrl = `${clientUrl}/verify-email?token=${encodeURIComponent(verificationToken)}`;
  const tpl = buildWelcomeEmailTemplate({ name: user.name, role: user.role, verifyUrl });

  // Sync newly registered user to Brevo contacts asynchronously (non-blocking)
  syncCandidateContactToBrevo(user._id).catch(() => {});

  return dispatchEmail({
    to: user.email,
    toName: user.name,
    userId: user._id,
    type: 'transactional',
    templateName: 'welcome_verification',
    ...tpl,
  });
}

export async function sendPasswordResetEmail(
  user: { _id: string; name: string; email: string },
  resetToken: string
) {
  const { clientUrl } = getEffectiveEmailConfig();
  const resetUrl = `${clientUrl}/reset-password?token=${encodeURIComponent(resetToken)}`;
  const tpl = buildPasswordResetTemplate({ name: user.name, resetUrl });
  return dispatchEmail({
    to: user.email,
    toName: user.name,
    userId: user._id,
    type: 'transactional',
    templateName: 'password_reset',
    ...tpl,
  });
}

export async function sendAccountNotificationEmail(params: {
  user: { _id: string; name: string; email: string };
  title: string;
  message: string;
  ctaLabel?: string;
  ctaUrl?: string;
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
    ...tpl,
  });
}

export async function sendApplicationConfirmationEmail(params: {
  candidate: { _id: string; name: string; email: string };
  job: JobRecord;
}) {
  const { clientUrl } = getEffectiveEmailConfig();
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
    ...tpl,
  });
}

export async function sendApplicationStatusUpdateEmail(params: {
  candidate: { _id: string; name: string; email: string };
  jobTitle: string;
  companyName: string;
  newStatus: string;
  note?: string;
}) {
  const { clientUrl } = getEffectiveEmailConfig();
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
}) {
  const { clientUrl } = getEffectiveEmailConfig();
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

export async function syncCandidateContactToBrevo(userId: string): Promise<{ synced: boolean; error?: string }> {
  const cfg = getEffectiveEmailConfig();
  if (!cfg.apiKey) return { synced: false, error: 'BREVO_API_KEY not configured' };

  const user = await db.findUserById(userId);
  if (!user) return { synced: false, error: 'User not found' };

  const pref = await db.getEmailPreference(userId);
  const profile = user.role === 'candidate' ? await db.getCandidateProfile(userId) : null;
  const optedOut = !pref.promotionalEmails || Boolean(pref.unsubscribedAt);

  const subscribedListId = await ensureBrevoList('Job Karenge Subscribed Candidates');
  const dailyListId = pref.dailyJobAlerts && !optedOut ? await ensureBrevoList('Job Karenge Daily Alerts') : null;
  const weeklyListId = pref.weeklyJobAlerts && !optedOut ? await ensureBrevoList('Job Karenge Weekly Alerts') : null;

  const listIds = [
    ...(!optedOut && subscribedListId ? [subscribedListId] : []),
    ...(dailyListId ? [dailyListId] : []),
    ...(weeklyListId ? [weeklyListId] : []),
  ];
  const unlinkListIds = optedOut && subscribedListId ? [subscribedListId] : undefined;

  const res = await syncContactToBrevo({
    email: user.email,
    name: user.name,
    promotionalOptOut: optedOut,
    listIds,
    unlinkListIds,
    attributes: {
      ROLE: user.role,
      LOCATION: profile?.currentLocation || user.location || '',
      PREF_CATEGORIES: pref.preferredCategories.join(', '),
      PREF_LOCATIONS: pref.preferredLocations.join(', '),
      DAILY_ALERTS: Boolean(pref.dailyJobAlerts && !optedOut),
      WEEKLY_ALERTS: Boolean(pref.weeklyJobAlerts && !optedOut),
      NEW_JOB_ALERTS: Boolean(pref.newJobNotifications && !optedOut),
      FEATURED_ALERTS: Boolean(pref.featuredJobAnnouncements && !optedOut),
      PROMOTIONAL_OPT_IN: !optedOut,
    },
  });

  if (res.synced) {
    await db.updateEmailPreference(userId, { brevoSyncedAt: new Date().toISOString() });
  }
  return res;
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

  const delivered = logs.filter((l) => l.status === 'delivered').length;
  const failed = logs.filter((l) => l.status === 'failed').length;
  const bounced = logs.filter((l) => l.status === 'bounced').length;
  const accepted = logs.filter((l) => l.status === 'queued' || l.status === 'sent' || l.status === 'delivered').length;

  return db.updateEmailCampaign(campaignId, {
    lastStatsSyncAt: new Date().toISOString(),
    stats: {
      sent: campaign.stats.sent || logs.length,
      accepted,
      delivered: Math.max(campaign.stats.delivered || 0, delivered),
      failed: Math.max(campaign.stats.failed || 0, failed),
      bounced: Math.max(campaign.stats.bounced || 0, bounced),
      unsubscribed: campaign.stats.unsubscribed || 0,
      opened: campaign.stats.opened || 0,
      clicked: campaign.stats.clicked || 0,
    },
  });
}

export interface BrevoWebhookPayload {
  event?: string;
  email?: string;
  'message-id'?: string;
  messageId?: string;
  camp_id?: number;
  reason?: string;
  date?: string;
}

export async function processBrevoWebhookEvent(payload: BrevoWebhookPayload): Promise<{
  handled: boolean;
  updatedLogId?: string;
  event?: string;
}> {
  const event = String(payload.event || '').toLowerCase();
  const messageId = String(payload['message-id'] || payload.messageId || '').trim();
  const recipientEmail = String(payload.email || '').trim().toLowerCase();

  let updatedLog: EmailLogRecord | null = null;
  if (messageId) {
    const existingLog = await db.findEmailLogByMessageId(messageId);
    if (existingLog) {
      const patch: Partial<EmailLogRecord> = { brevoEvent: event };
      if (event === 'delivered') {
        patch.status = 'delivered';
        patch.deliveredAt = new Date().toISOString();
      } else if (event === 'soft_bounce' || event === 'hard_bounce' || event === 'blocked' || event === 'invalid_email') {
        patch.status = 'bounced';
        patch.error = payload.reason || `Brevo webhook event: ${event}`;
      } else if (event === 'error') {
        patch.status = 'failed';
        patch.error = payload.reason || 'Brevo delivery error';
      }
      updatedLog = await db.updateEmailLog(existingLog._id, patch);

      if (existingLog.campaignId) {
        const campaign = await db.findEmailCampaignById(existingLog.campaignId);
        if (campaign) {
          const stats = { ...campaign.stats };
          if (event === 'delivered') stats.delivered = (stats.delivered || 0) + 1;
          if (event === 'soft_bounce' || event === 'hard_bounce') stats.bounced = (stats.bounced || 0) + 1;
          if (event === 'unique_opened' || event === 'opened') stats.opened = (stats.opened || 0) + 1;
          if (event === 'click') stats.clicked = (stats.clicked || 0) + 1;
          if (event === 'unsubscribed' || event === 'spam') stats.unsubscribed = (stats.unsubscribed || 0) + 1;
          await db.updateEmailCampaign(campaign._id, {
            stats,
            lastStatsSyncAt: new Date().toISOString(),
          });
        }
      }
    }
  }

  if (payload.camp_id) {
    const camp = await db.findEmailCampaignByBrevoId(Number(payload.camp_id));
    if (camp) {
      const stats = { ...camp.stats };
      if (event === 'delivered') stats.delivered = (stats.delivered || 0) + 1;
      if (event === 'soft_bounce' || event === 'hard_bounce') stats.bounced = (stats.bounced || 0) + 1;
      if (event === 'unique_opened' || event === 'opened') stats.opened = (stats.opened || 0) + 1;
      if (event === 'click') stats.clicked = (stats.clicked || 0) + 1;
      if (event === 'unsubscribed' || event === 'spam') stats.unsubscribed = (stats.unsubscribed || 0) + 1;
      await db.updateEmailCampaign(camp._id, {
        stats,
        lastStatsSyncAt: new Date().toISOString(),
      });
    }
  }

  // Propagate unsubscribe / spam complaints back to candidate preferences
  if ((event === 'unsubscribed' || event === 'spam') && recipientEmail) {
    const user = await db.findUserByEmail(recipientEmail);
    if (user) {
      await db.updateEmailPreference(user._id, {
        promotionalEmails: false,
        dailyJobAlerts: false,
        weeklyJobAlerts: false,
        newJobNotifications: false,
        featuredJobAnnouncements: false,
        unsubscribedAt: new Date().toISOString(),
      });
    }
  }

  return {
    handled: Boolean(event),
    updatedLogId: updatedLog?._id,
    event,
  };
}

export { verifyBrevoAccount };
