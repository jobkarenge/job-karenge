import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  sendApplicationConfirmationEmail,
  sendApplicationStatusUpdateEmail,
} from '../services/emailService.ts';
import { pushNotification } from '../services/notificationService.ts';
import { db } from '../store/dataLayer.ts';
import type { ApplicationStatus } from '../types/domain.ts';
import { sanitizeUser } from '../utils/sanitize.ts';

const router = Router();

const applySchema = z.object({
  jobId: z.string().min(1),
  coverLetter: z.string().max(3000).default(''),
});

router.post('/', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid application submission.' });
  }

  const job = await db.findJobById(parsed.data.jobId);
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found.' });
  }
  if (job.status !== 'published' || !job.allowDirectApply) {
    return res.status(400).json({ success: false, message: 'This job is not accepting applications.' });
  }
  if (job.applicationDeadline && new Date(job.applicationDeadline).getTime() < Date.now()) {
    return res.status(400).json({ success: false, message: 'The application deadline for this job has passed.' });
  }

  const dup = await db.findDuplicateApplication(req.user!._id, job._id);
  if (dup) {
    return res.status(409).json({ success: false, message: 'You have already applied to this position.' });
  }

  const profile = await db.getCandidateProfile(req.user!._id);
  if (!profile?.resumeUrl) {
    return res.status(400).json({
      success: false,
      message: 'Please upload a compressed PDF resume in your Candidate Profile before applying.',
    });
  }

  const now = new Date().toISOString();
  const app = await db.createApplication({
    candidateId: req.user!._id,
    jobId: job._id,
    recruiterId: job.recruiterId,
    companyId: job.companyId,
    resumeUrl: profile.resumeUrl,
    resumePublicId: profile.resumePublicId,
    coverLetter: parsed.data.coverLetter.trim(),
    status: 'Applied',
    statusHistory: [
      {
        previousStatus: '',
        newStatus: 'Applied',
        updatedBy: req.user!._id,
        updatedByName: req.user!.name,
        message: 'Application submitted via Job Karenge',
        timestamp: now,
      },
    ],
    recruiterNotes: '',
    internalFeedback: '',
    appliedAt: now,
  });

  await Promise.all([
    db.updateJob(job._id, { applicationsCount: (job.applicationsCount || 0) + 1 }),
    job.recruiterId && job.recruiterId !== 'system-catalog'
      ? pushNotification({
          userId: job.recruiterId,
          type: 'new_application',
          title: 'New Candidate Application',
          message: `${req.user!.name} applied for ${job.title}.`,
          link: '/recruiter/applications',
        })
      : Promise.resolve(),
  ]);

  void sendApplicationConfirmationEmail({ candidate: req.user!, job }).catch((err) =>
    console.error('[Application] Confirmation email dispatch warning:', err)
  );

  res.status(201).json({
    success: true,
    message: 'Application submitted successfully.',
    data: app,
  });
});

function buildInterviewByAppMap<T extends { applicationId: string; status: string; createdAt?: string }>(
  interviews: T[]
): Map<string, T> {
  const map = new Map<string, T>();
  for (const item of interviews) {
    const existing = map.get(item.applicationId);
    if (!existing) {
      map.set(item.applicationId, item);
      continue;
    }
    const existingActive = existing.status !== 'Cancelled';
    const nextActive = item.status !== 'Cancelled';
    if (!existingActive && nextActive) {
      map.set(item.applicationId, item);
    } else if (existingActive === nextActive && (item.createdAt || '') >= (existing.createdAt || '')) {
      map.set(item.applicationId, item);
    }
  }
  return map;
}

router.get('/my-applications', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const [mine, interviews] = await Promise.all([
    db.listApplicationsByCandidate(req.user!._id),
    db.listInterviewsByUser('candidate', req.user!._id),
  ]);

  if (mine.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const [jobs, companies] = await Promise.all([
    db.listJobsByIds(mine.map((a) => a.jobId)),
    db.listCompaniesByIds(mine.map((a) => a.companyId)),
  ]);

  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));
  const interviewByApp = buildInterviewByAppMap(interviews);

  const enriched = mine.map((a) => ({
    ...a,
    job: jobMap.get(a.jobId) || null,
    company: companyMap.get(a.companyId) || null,
    interview: interviewByApp.get(a._id) || null,
  }));

  res.json({ success: true, data: enriched });
});

router.patch('/:id/withdraw', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const app = await db.findApplicationById(String(req.params.id));
  if (!app || app.candidateId !== req.user!._id) {
    return res.status(404).json({ success: false, message: 'Application not found.' });
  }
  if (['Selected', 'Rejected', 'Withdrawn'].includes(app.status)) {
    return res.status(400).json({ success: false, message: `Cannot withdraw an application marked ${app.status}.` });
  }

  const updated = await db.updateApplication(app._id, {
    status: 'Withdrawn',
    statusHistory: [
      ...app.statusHistory,
      {
        previousStatus: app.status,
        newStatus: 'Withdrawn',
        updatedBy: req.user!._id,
        updatedByName: req.user!.name,
        message: 'Withdrawn by candidate',
        timestamp: new Date().toISOString(),
      },
    ],
  });

  if (app.recruiterId && app.recruiterId !== 'system-catalog') {
    await pushNotification({
      userId: app.recruiterId,
      type: 'application_withdrawn',
      title: 'Application Withdrawn',
      message: `${req.user!.name} withdrew their application.`,
      link: '/recruiter/applications',
    });
  }

  res.json({ success: true, message: 'Application withdrawn.', data: updated });
});

async function listRecruiterApplications(req: AuthenticatedRequest, res: import('express').Response) {
  const statusFilter = String(req.query.status || '');
  const jobFilter = String(req.query.jobId || '');
  const companyFilter = String(req.query.companyId || '');
  const q = String(req.query.q || '').trim().toLowerCase();

  const scopedRecruiterId = req.user!.role === 'admin' ? null : req.user!._id;
  const [list, interviews] = await Promise.all([
    db.listApplicationsByRecruiter(scopedRecruiterId, {
      status: statusFilter || undefined,
      jobId: jobFilter || undefined,
      companyId: companyFilter || undefined,
    }),
    db.listInterviewsByUser(req.user!.role, req.user!._id),
  ]);

  if (list.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const jobIds = list.map((a) => a.jobId);
  const candidateIds = list.map((a) => a.candidateId);
  const jobs = await db.listJobsByIds(jobIds);
  const companyIds = [...list.map((a) => a.companyId), ...jobs.map((j) => j.companyId)];

  const [companies, users, profiles] = await Promise.all([
    db.listCompaniesByIds(companyIds),
    db.listUsersByIds(candidateIds),
    db.listCandidateProfilesByUserIds(candidateIds),
  ]);

  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));
  const userMap = new Map(users.map((u) => [u._id, sanitizeUser(u)]));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));
  const interviewMap = buildInterviewByAppMap(interviews);

  const enriched = list.map((a) => {
    const candidate = userMap.get(a.candidateId) || null;
    const candidateProfile = profileMap.get(a.candidateId) || null;
    const job = jobMap.get(a.jobId) || null;
    const company = companyMap.get(a.companyId) || (job?.companyId ? companyMap.get(job.companyId) || null : null);
    return {
      ...a,
      candidate,
      candidateProfile,
      job,
      company,
      interview: interviewMap.get(a._id) || null,
    };
  });

  const final = q
    ? enriched.filter(
        (item) =>
          item.candidate?.name.toLowerCase().includes(q) ||
          item.candidate?.email.toLowerCase().includes(q) ||
          item.candidate?.phone?.toLowerCase().includes(q) ||
          item.candidate?.location?.toLowerCase().includes(q) ||
          item.candidateProfile?.currentLocation?.toLowerCase().includes(q) ||
          item.candidateProfile?.headline?.toLowerCase().includes(q) ||
          item.candidateProfile?.designation?.toLowerCase().includes(q) ||
          item.job?.title.toLowerCase().includes(q) ||
          item.job?.companyName?.toLowerCase().includes(q) ||
          item.company?.name?.toLowerCase().includes(q) ||
          item.candidateProfile?.technicalSkills.some((s) => s.name.toLowerCase().includes(q))
      )
    : enriched;

  res.json({ success: true, data: final });
}

const statusUpdateSchema = z.object({
  status: z.enum(['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected']),
  message: z.string().max(1000).optional(),
  recruiterNotes: z.string().max(2000).optional(),
  internalFeedback: z.string().max(2000).optional(),
});

async function updateRecruiterApplicationStatus(req: AuthenticatedRequest, res: import('express').Response) {
  const app = await db.findApplicationById(String(req.params.id));
  if (!app) {
    return res.status(404).json({ success: false, message: 'Application not found.' });
  }
  if (req.user!.role === 'recruiter' && app.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'You can only manage applications for your own jobs.' });
  }

  const parsed = statusUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid status update payload.' });
  }

  const { status, message, recruiterNotes, internalFeedback } = parsed.data;
  const statusChanged = status !== app.status;
  const history = statusChanged
    ? [
        ...app.statusHistory,
        {
          previousStatus: app.status,
          newStatus: status as ApplicationStatus,
          updatedBy: req.user!._id,
          updatedByName: req.user!.name,
          message: message || `Status updated to ${status}`,
          timestamp: new Date().toISOString(),
        },
      ]
    : app.statusHistory;

  const updated = await db.updateApplication(app._id, {
    status,
    statusHistory: history,
    ...(recruiterNotes !== undefined ? { recruiterNotes } : {}),
    ...(internalFeedback !== undefined ? { internalFeedback } : {}),
  });

  let emailStatus: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | undefined;

  if (statusChanged) {
    const candidate = await db.findUserById(app.candidateId);
    const job = await db.findJobById(app.jobId);
    const jobTitle = job?.title || 'your applied role';
    const companyName = job?.companyName || 'Hiring Team';
    if (candidate) {
      try {
        await pushNotification({
          userId: candidate._id,
          type: 'application_status',
          title: `Application ${status}`,
          message: `Your application for ${jobTitle} at ${companyName} is now ${status}.`,
          link: '/candidate/applications',
        });
      } catch (err) {
        console.error('[Application] Failed to push status notification:', err);
      }
      try {
        const resEmail = await sendApplicationStatusUpdateEmail({
          candidate,
          jobTitle,
          companyName,
          newStatus: status,
          note: message,
        });
        emailStatus = resEmail.status;
        emailError = resEmail.error;
      } catch (err) {
        console.error('[Application] Failed to send status update email:', err);
        emailStatus = 'failed';
        emailError = err instanceof Error ? err.message : 'Email dispatch failed';
      }
    }
  }

  res.json({ success: true, message: 'Application updated.', data: updated, emailStatus, emailError });
}

async function bulkUpdateRecruiterStatus(req: AuthenticatedRequest, res: import('express').Response) {
  const schema = z.object({
    applicationIds: z.array(z.string()).min(1).max(100),
    status: z.enum(['Shortlisted', 'Rejected']),
    message: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid bulk action request.' });
  }

  let updatedCount = 0;
  for (const appId of parsed.data.applicationIds) {
    const app = await db.findApplicationById(appId);
    if (!app) continue;
    if (req.user!.role === 'recruiter' && app.recruiterId !== req.user!._id) continue;

    if (app.status !== parsed.data.status) {
      await db.updateApplication(app._id, {
        status: parsed.data.status,
        statusHistory: [
          ...app.statusHistory,
          {
            previousStatus: app.status,
            newStatus: parsed.data.status,
            updatedBy: req.user!._id,
            updatedByName: req.user!.name,
            message: parsed.data.message || `Bulk status update to ${parsed.data.status}`,
            timestamp: new Date().toISOString(),
          },
        ],
      });
      const candidate = await db.findUserById(app.candidateId);
      const job = await db.findJobById(app.jobId);
      if (candidate && job) {
        await sendApplicationStatusUpdateEmail({
          candidate,
          jobTitle: job.title,
          companyName: job.companyName,
          newStatus: parsed.data.status,
          note: parsed.data.message,
        });
        await pushNotification({
          userId: candidate._id,
          type: 'application_status',
          title: `Application ${parsed.data.status}`,
          message: `Your application for ${job.title} at ${job.companyName} is now ${parsed.data.status}.`,
          link: '/candidate/applications',
        });
      }
      updatedCount++;
    }
  }

  res.json({ success: true, message: `Updated ${updatedCount} applications.` });
}

function csvCell(val: unknown): string {
  const raw = String(val ?? '');
  const safe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

function resolvePublicResumeUrl(rawUrl: string | undefined, req: AuthenticatedRequest): string {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  const forwardedProto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http')
    .split(',')[0]
    .trim();
  const forwardedHost = String(req.headers['x-forwarded-host'] || req.get('host') || '')
    .split(',')[0]
    .trim();
  const fallbackServerUrl = (db.getPlatformSettings().serverUrl?.trim() || env.serverUrl).replace(/\/$/, '');
  const baseUrl = forwardedHost ? `${forwardedProto}://${forwardedHost}` : fallbackServerUrl;
  return `${baseUrl}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
}

async function exportRecruiterApplicationsCsv(req: AuthenticatedRequest, res: import('express').Response) {
  const jobId = String(req.query.jobId || '');
  const companyId = String(req.query.companyId || '');
  const status = String(req.query.status || '');
  const scopedRecruiterId = req.user!.role === 'admin' ? null : req.user!._id;
  const filtered = await db.listApplicationsByRecruiter(scopedRecruiterId, {
    status: status || undefined,
    jobId: jobId || undefined,
    companyId: companyId || undefined,
  });

  const [jobs, companies, users, profiles] = await Promise.all([
    db.listJobsByIds(filtered.map((a) => a.jobId)),
    db.listCompaniesByIds(filtered.map((a) => a.companyId)),
    db.listUsersByIds(filtered.map((a) => a.candidateId)),
    db.listCandidateProfilesByUserIds(filtered.map((a) => a.candidateId)),
  ]);
  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));
  const userMap = new Map(users.map((u) => [u._id, u]));
  const profileMap = new Map(profiles.map((p) => [p.userId, p]));

  const header = [
    'Application ID',
    'Candidate Name',
    'Email',
    'Phone',
    'Company',
    'Role',
    'Experience (Years)',
    'Location',
    'Stage',
    'Resume Public Link',
    'Applied Date',
  ].join(',');

  const rows = filtered.map((a) => {
    const u = userMap.get(a.candidateId);
    const j = jobMap.get(a.jobId);
    const c = companyMap.get(a.companyId);
    const profile = profileMap.get(a.candidateId);
    const publicResumeLink = resolvePublicResumeUrl(a.resumeUrl || profile?.resumeUrl, req);
    return [
      csvCell(a._id),
      csvCell(u?.name || ''),
      csvCell(u?.email || ''),
      csvCell(u?.phone || ''),
      csvCell(c?.name || j?.companyName || ''),
      csvCell(j?.title || ''),
      csvCell(profile?.totalExperienceYears ?? 0),
      csvCell(profile?.currentLocation || u?.location || j?.location || ''),
      csvCell(a.status),
      csvCell(publicResumeLink),
      csvCell(a.appliedAt),
    ].join(',');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="job-karenge-applicants.csv"');
  res.send(`\uFEFF${[header, ...rows].join('\n')}`);
}

router.get('/recruiter', requireAuth, requireRole('recruiter', 'admin'), listRecruiterApplications);
router.patch('/recruiter/:id/status', requireAuth, requireRole('recruiter', 'admin'), updateRecruiterApplicationStatus);
router.post('/recruiter/bulk-status', requireAuth, requireRole('recruiter', 'admin'), bulkUpdateRecruiterStatus);
router.get('/recruiter/export', requireAuth, requireRole('recruiter', 'admin'), exportRecruiterApplicationsCsv);

export const recruiterAppRouter = Router();
recruiterAppRouter.get('/', requireAuth, requireRole('recruiter', 'admin'), listRecruiterApplications);
recruiterAppRouter.patch('/:id/status', requireAuth, requireRole('recruiter', 'admin'), updateRecruiterApplicationStatus);
recruiterAppRouter.post('/bulk-status', requireAuth, requireRole('recruiter', 'admin'), bulkUpdateRecruiterStatus);
recruiterAppRouter.get('/export', requireAuth, requireRole('recruiter', 'admin'), exportRecruiterApplicationsCsv);

export default router;
