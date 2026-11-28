import { db } from '../store/dataLayer.ts';
import {
  matchJobsForCandidate,
  sendInterviewEmail,
  sendPromotionalDigest,
} from './emailService.ts';
import { pushNotification } from './notificationService.ts';
import type { JobRecord, UserRecord } from '../types/domain.ts';

let started = false;
let running = false;

function getUtcDateKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function getIsoWeekKey(date = new Date()): string {
  const tmp = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400_000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export async function dispatchCampaignToSubscribedCandidates(campaignId: string) {
  const campaign = await db.findEmailCampaignById(campaignId);
  if (!campaign) return null;

  const [users, jobs] = await Promise.all([db.listUsers(), db.listJobs()]);
  const candidates = users.filter((u) => u.role === 'candidate' && u.accountStatus === 'active');
  const activeJobs = jobs.filter(
    (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= Date.now())
  );

  let sent = 0;
  let accepted = 0;
  let delivered = campaign.stats?.delivered || 0;
  let failed = 0;

  for (const cand of candidates) {
    const pref = await db.getEmailPreference(cand._id);
    if (!pref.promotionalEmails || pref.unsubscribedAt) continue;

    if (campaign.targetAudience === 'daily_subscribers' && !pref.dailyJobAlerts) continue;
    if (campaign.targetAudience === 'weekly_subscribers' && !pref.weeklyJobAlerts) continue;
    if (campaign.targetAudience === 'featured_subscribers' && !pref.featuredJobAnnouncements) continue;

    const profile = await db.getCandidateProfile(cand._id);
    const pool =
      campaign.targetAudience === 'featured_subscribers'
        ? activeJobs.filter((j) => j.featured)
        : activeJobs;
    const matchedJobs = matchJobsForCandidate({
      jobs: pool.length > 0 ? pool : activeJobs,
      candidateProfile: profile,
      pref,
      candidateUser: cand,
    });
    if (matchedJobs.length === 0) continue;

    const dedupeKey = `campaign:${campaign._id}:user:${cand._id}`;
    const result = await sendPromotionalDigest({
      candidate: cand,
      jobs: matchedJobs,
      subject: campaign.subject,
      campaignTitle: campaign.title,
      digestKind:
        campaign.targetAudience === 'featured_subscribers'
          ? 'featured_job_announcement'
          : 'personalized_recommendations',
      campaignId: campaign._id,
      dedupeKey,
    });

    sent++;
    if (result.status === 'failed') failed++;
    else if (result.accepted) {
      accepted++;
      if (result.status === 'sent' || result.status === 'delivered') {
        delivered++;
      }
    }
  }

  return db.updateEmailCampaign(campaign._id, {
    status: failed > 0 && accepted === 0 ? 'failed' : 'sent',
    stats: {
      ...campaign.stats,
      sent,
      accepted,
      delivered,
      failed,
      bounced: campaign.stats?.bounced || 0,
      unsubscribed: campaign.stats?.unsubscribed || 0,
      opened: campaign.stats?.opened || 0,
      clicked: campaign.stats?.clicked || 0,
    },
  });
}

export async function handlePublishedJobNotifications(
  job: JobRecord,
  preloadedCandidates?: UserRecord[]
): Promise<void> {
  const settings = db.getPlatformSettings();
  if (!settings.promotionalDigestEnabled || job.status !== 'published') return;
  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) return;

  const candidates =
    preloadedCandidates ||
    (await db.listUsers()).filter((u) => u.role === 'candidate' && u.accountStatus === 'active');

  for (const cand of candidates) {
    const pref = await db.getEmailPreference(cand._id);
    if (!pref.promotionalEmails || pref.unsubscribedAt) continue;

    const wantsFeatured = Boolean(job.featured && pref.featuredJobAnnouncements);
    const wantsNewAlert = Boolean(pref.newJobNotifications);
    if (!wantsFeatured && !wantsNewAlert) continue;

    const profile = await db.getCandidateProfile(cand._id);
    const matched = matchJobsForCandidate({
      jobs: [job],
      candidateProfile: profile,
      pref,
      candidateUser: cand,
    });
    if (matched.length === 0) continue;

    if (wantsNewAlert) {
      await sendPromotionalDigest({
        candidate: cand,
        jobs: [job],
        subject: `New Job Alert: ${job.title} (${job.location})`,
        campaignTitle: 'New Matching Job Alert',
        digestKind: 'new_job_alert',
        jobId: job._id,
        dedupeKey: `new_job_alert:${job._id}:user:${cand._id}`,
      });
    }

    if (wantsFeatured) {
      await sendPromotionalDigest({
        candidate: cand,
        jobs: [job],
        subject: `Featured Opening: ${job.title} at ${job.companyName}`,
        campaignTitle: 'Featured Job Announcement',
        digestKind: 'featured_job_announcement',
        jobId: job._id,
        dedupeKey: `featured_job_announcement:${job._id}:user:${cand._id}`,
      });
    }
  }
}

async function runPromotionalAutomation(now: number): Promise<void> {
  const settings = db.getPlatformSettings();
  if (!settings.promotionalDigestEnabled) return;

  const [users, jobs, campaigns] = await Promise.all([
    db.listUsers(),
    db.listJobs(),
    db.listEmailCampaigns(),
  ]);

  const candidates = users.filter((u) => u.role === 'candidate' && u.accountStatus === 'active');
  const activeJobs = jobs.filter(
    (j) =>
      j.status === 'published' &&
      (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
  );

  // 1. Dispatch scheduled admin email campaigns whose scheduledDate <= now
  for (const camp of campaigns) {
    if (camp.status === 'scheduled' && camp.scheduledDate && new Date(camp.scheduledDate).getTime() <= now) {
      await dispatchCampaignToSubscribedCandidates(camp._id);
    }
  }

  if (candidates.length === 0 || activeJobs.length === 0) return;

  const schedulerState = settings.schedulerState || {
    lastDailyDigestKey: '',
    lastWeeklyDigestKey: '',
    notifiedJobIds: [],
  };
  const notifiedSet = new Set(schedulerState.notifiedJobIds || []);
  let stateUpdated = false;

  // 2. New Job Alerts & Featured Job Announcements (persistent deduplication by jobId + dedupeKey)
  const freshJobs = activeJobs.filter((j) => {
    const publishedTime = new Date(j.publishedAt || j.createdAt).getTime();
    return !notifiedSet.has(j._id) && now - publishedTime <= 24 * 3600_000;
  });

  for (const job of freshJobs) {
    await handlePublishedJobNotifications(job, candidates);
    notifiedSet.add(job._id);
    stateUpdated = true;
  }

  // 3. Daily Digest (once per UTC day persisted in DB)
  const todayKey = getUtcDateKey(new Date(now));
  if (schedulerState.lastDailyDigestKey !== todayKey) {
    for (const cand of candidates) {
      const pref = await db.getEmailPreference(cand._id);
      if (!pref.promotionalEmails || pref.unsubscribedAt || !pref.dailyJobAlerts) continue;

      const profile = await db.getCandidateProfile(cand._id);
      const matchedJobs = matchJobsForCandidate({
        jobs: activeJobs,
        candidateProfile: profile,
        pref,
        candidateUser: cand,
      });
      if (matchedJobs.length === 0) continue;

      await sendPromotionalDigest({
        candidate: cand,
        jobs: matchedJobs,
        subject: `Daily Job Digest — ${matchedJobs.length} Open Role${matchedJobs.length === 1 ? '' : 's'} on Job Karenge`,
        campaignTitle: 'Your Daily Job Digest',
        digestKind: 'daily_job_digest',
        dedupeKey: `daily_digest:${todayKey}:user:${cand._id}`,
      });
    }
    schedulerState.lastDailyDigestKey = todayKey;
    stateUpdated = true;
  }

  // 4. Weekly Digest (once per ISO week persisted in DB)
  const weekKey = getIsoWeekKey(new Date(now));
  if (schedulerState.lastWeeklyDigestKey !== weekKey) {
    for (const cand of candidates) {
      const pref = await db.getEmailPreference(cand._id);
      if (!pref.promotionalEmails || pref.unsubscribedAt || !pref.weeklyJobAlerts) continue;

      const profile = await db.getCandidateProfile(cand._id);
      const matchedJobs = matchJobsForCandidate({
        jobs: activeJobs,
        candidateProfile: profile,
        pref,
        candidateUser: cand,
      });
      if (matchedJobs.length === 0) continue;

      await sendPromotionalDigest({
        candidate: cand,
        jobs: matchedJobs,
        subject: `Weekly Job Roundup (${weekKey}) — Personalized Roles on Job Karenge`,
        campaignTitle: 'Weekly Personalized Job Recommendations',
        digestKind: 'weekly_job_digest',
        dedupeKey: `weekly_digest:${weekKey}:user:${cand._id}`,
      });
    }
    schedulerState.lastWeeklyDigestKey = weekKey;
    stateUpdated = true;
  }

  if (stateUpdated) {
    await db.updatePlatformSettings({
      schedulerState: {
        lastDailyDigestKey: schedulerState.lastDailyDigestKey,
        lastWeeklyDigestKey: schedulerState.lastWeeklyDigestKey,
        notifiedJobIds: [...notifiedSet].slice(-500),
        lastRunAt: new Date(now).toISOString(),
      },
    });
  }
}

export async function runMaintenanceJobs(): Promise<void> {
  if (running) return;
  running = true;
  try {
    const settings = db.getPlatformSettings();
    const now = Date.now();
    const jobs = await db.listJobs();

    for (const job of jobs) {
      // 1. Auto-expire jobs past deadline
      if (
        settings.autoExpireJobs &&
        job.status === 'published' &&
        job.applicationDeadline &&
        new Date(job.applicationDeadline).getTime() < now
      ) {
        await db.updateJob(job._id, { status: 'expired' });
      }

      // 2. Auto-publish scheduled jobs when scheduledFor <= now
      if (
        job.status === 'scheduled' &&
        job.scheduledFor &&
        new Date(job.scheduledFor).getTime() <= now
      ) {
        await db.updateJob(job._id, {
          status: 'published',
          publishedAt: new Date().toISOString(),
        });
      }
    }

    // 3. Interview reminders within 24 hours
    const interviews = await db.listInterviews();
    for (const interview of interviews) {
      if (interview.reminderSent || (interview.status !== 'Scheduled' && interview.status !== 'Rescheduled')) {
        continue;
      }
      const dt = new Date(`${interview.date}T${interview.time || '09:00'}:00`);
      const diffMs = dt.getTime() - now;
      if (diffMs > 0 && diffMs <= 24 * 3600 * 1000) {
        const candidate = await db.findUserById(interview.candidateId);
        const job = await db.findJobById(interview.jobId);
        if (candidate && job) {
          await sendInterviewEmail({
            candidate,
            jobTitle: job.title,
            companyName: job.companyName,
            event: 'reminder',
            date: interview.date,
            time: interview.time,
            timezone: interview.timezone,
            type: interview.type,
            meetingLinkOrLocation: interview.meetingLinkOrLocation,
            interviewerName: interview.interviewerName,
          });
          await pushNotification({
            userId: candidate._id,
            type: 'interview_reminder',
            title: 'Upcoming Interview Reminder',
            message: `Your interview for ${job.title} at ${job.companyName} is scheduled for ${interview.date} at ${interview.time}.`,
            link: '/candidate/interviews',
          });
        }
        await db.updateInterview(interview._id, { reminderSent: true });
      }
    }

    // 4. Persistent promotional automation (new job alerts, featured announcements, daily/weekly digests, scheduled campaigns)
    await runPromotionalAutomation(now);
  } finally {
    running = false;
  }
}

export { runMaintenanceJobs as runScheduledJobsNow };

export function startBackgroundSchedulers(): void {
  if (started) return;
  started = true;
  runMaintenanceJobs().catch((err) => console.error('[Scheduler] Initial run error:', err));
  setInterval(() => {
    runMaintenanceJobs().catch((err) => console.error('[Scheduler] Interval error:', err));
  }, 60_000);
}
