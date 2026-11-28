import { Router } from 'express';
import { z } from 'zod';
import { resolveClientOrigin, resolveRequestOrigin } from '../config/env.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { dispatchEmailBounded, sendInterviewEmail } from '../services/emailService.ts';
import { pushNotification } from '../services/notificationService.ts';
import { db } from '../store/dataLayer.ts';
import { sanitizeUser } from '../utils/sanitize.ts';

const router = Router();

router.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const filtered = await db.listInterviewsByUser(req.user!.role, req.user!._id);
  if (filtered.length === 0) {
    return res.json({ success: true, data: [] });
  }

  const jobs = await db.listJobsByIds(filtered.map((i) => i.jobId));
  const [users, companies] = await Promise.all([
    db.listUsersByIds([...filtered.map((i) => i.candidateId), ...filtered.map((i) => i.recruiterId)]),
    db.listCompaniesByIds(jobs.map((j) => j.companyId)),
  ]);

  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const userMap = new Map(users.map((u) => [u._id, sanitizeUser(u)]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));

  const enriched = filtered.map((i) => {
    const job = jobMap.get(i.jobId) || null;
    return {
      ...i,
      job,
      company: job ? companyMap.get(job.companyId) || null : null,
      candidate: userMap.get(i.candidateId) || null,
      recruiter: userMap.get(i.recruiterId) || null,
    };
  });

  res.json({ success: true, data: enriched });
});

const interviewBaseSchema = z.object({
  applicationId: z.string().min(1),
  date: z.string().min(4),
  time: z.string().min(3),
  timezone: z.string().default('Asia/Kolkata'),
  type: z.enum(['Online', 'In-person', 'Phone']),
  meetingLinkOrLocation: z.string().trim().max(500).optional().default(''),
  interviewerName: z.string().min(2).max(120),
  instructions: z.string().max(1500).default(''),
  notes: z.string().max(1500).default(''),
});

const createInterviewSchema = interviewBaseSchema.superRefine((data, ctx) => {
  if (data.type === 'Online' && data.meetingLinkOrLocation.length < 2) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['meetingLinkOrLocation'],
      message: 'Meeting link is required for Online interviews.',
    });
  }
});

router.post('/', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const parsed = createInterviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid interview input' });
  }

  const app = await db.findApplicationById(parsed.data.applicationId);
  if (!app) {
    return res.status(404).json({ success: false, message: 'Application not found.' });
  }
  if (req.user!.role === 'recruiter' && app.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const interview = await db.createInterview({
    applicationId: app._id,
    jobId: app.jobId,
    candidateId: app.candidateId,
    recruiterId: app.recruiterId,
    date: parsed.data.date,
    time: parsed.data.time,
    timezone: parsed.data.timezone,
    type: parsed.data.type,
    meetingLinkOrLocation: parsed.data.meetingLinkOrLocation,
    interviewerName: parsed.data.interviewerName,
    instructions: parsed.data.instructions,
    notes: parsed.data.notes,
    status: 'Scheduled',
    candidateConfirmed: false,
    reminderSent: false,
  });

  if (app.status !== 'Interview Scheduled') {
    await db.updateApplication(app._id, {
      status: 'Interview Scheduled',
      statusHistory: [
        ...app.statusHistory,
        {
          previousStatus: app.status,
          newStatus: 'Interview Scheduled',
          updatedBy: req.user!._id,
          updatedByName: req.user!.name,
          message: `Interview scheduled on ${parsed.data.date} at ${parsed.data.time}`,
          timestamp: new Date().toISOString(),
        },
      ],
    });
  }

  const candidate = await db.findUserById(app.candidateId);
  const job = await db.findJobById(app.jobId);
  const jobTitle = job?.title || 'your applied role';
  const companyName = job?.companyName || 'Hiring Team';

  let notificationSent = false;
  let emailStatus: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | undefined;

  if (candidate) {
    try {
      await pushNotification({
        userId: candidate._id,
        type: 'interview_scheduled',
        title: 'Interview Scheduled',
        message: `${companyName} scheduled a ${interview.type} interview for ${jobTitle} on ${interview.date} at ${interview.time}.`,
        link: '/candidate/interviews',
      });
      notificationSent = true;
    } catch (err) {
      console.error('[Interview] Failed to push notification:', err);
    }

    try {
      const emailResult = await dispatchEmailBounded(
        sendInterviewEmail({
          candidate,
          jobTitle,
          companyName,
          event: 'scheduled',
          date: interview.date,
          time: interview.time,
          timezone: interview.timezone,
          type: interview.type,
          meetingLinkOrLocation: interview.meetingLinkOrLocation,
          interviewerName: interview.interviewerName,
          instructions: interview.instructions,
          requestOrigin: resolveRequestOrigin(req),
          clientOrigin: resolveClientOrigin(req),
        }),
        8000
      );
      emailStatus = emailResult.status;
      emailError = emailResult.error;
    } catch (err) {
      console.error('[Interview] Failed to send interview email:', err);
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message : 'Email dispatch failed';
    }
  }

  res.status(201).json({
    success: true,
    message:
      emailStatus === 'failed'
        ? 'Interview scheduled and candidate notified in-app, but email delivery failed.'
        : 'Interview scheduled.',
    data: interview,
    notificationSent,
    emailStatus,
    emailError,
  });
});

router.put('/:id', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findInterviewById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const schema = z.object({
    date: z.string().min(4).optional(),
    time: z.string().min(3).optional(),
    timezone: z.string().optional(),
    type: z.enum(['Online', 'In-person', 'Phone']).optional(),
    meetingLinkOrLocation: z.string().trim().max(500).optional(),
    interviewerName: z.string().min(2).max(120).optional(),
    instructions: z.string().max(1500).optional(),
    notes: z.string().max(1500).optional(),
    status: z.enum(['Scheduled', 'Rescheduled', 'Cancelled', 'Completed']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid interview update.' });
  }

  const effectiveType = parsed.data.type ?? existing.type;
  const effectiveLocation =
    parsed.data.meetingLinkOrLocation !== undefined ? parsed.data.meetingLinkOrLocation : existing.meetingLinkOrLocation;
  if (effectiveType === 'Online' && (!effectiveLocation || effectiveLocation.trim().length < 2)) {
    return res.status(400).json({
      success: false,
      message: 'Meeting link is required for Online interviews.',
    });
  }

  const nextStatus = parsed.data.status || 'Rescheduled';
  const updated = await db.updateInterview(existing._id, {
    ...parsed.data,
    meetingLinkOrLocation: parsed.data.meetingLinkOrLocation !== undefined ? parsed.data.meetingLinkOrLocation.trim() : existing.meetingLinkOrLocation,
    status: nextStatus,
    reminderSent: false,
  });

  const candidate = await db.findUserById(existing.candidateId);
  const job = await db.findJobById(existing.jobId);
  const jobTitle = job?.title || 'your applied role';
  const companyName = job?.companyName || 'Hiring Team';

  let notificationSent = false;
  let emailStatus: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | undefined;

  if (candidate && updated) {
    try {
      await pushNotification({
        userId: candidate._id,
        type: 'interview_updated',
        title: `Interview ${nextStatus}`,
        message: `Your interview for ${jobTitle} was updated (${updated.date} at ${updated.time}).`,
        link: '/candidate/interviews',
      });
      notificationSent = true;
    } catch (err) {
      console.error('[Interview] Failed to push update notification:', err);
    }

    try {
      const emailResult = await dispatchEmailBounded(
        sendInterviewEmail({
          candidate,
          jobTitle,
          companyName,
          event: nextStatus === 'Cancelled' ? 'cancelled' : 'rescheduled',
          date: updated.date,
          time: updated.time,
          timezone: updated.timezone,
          type: updated.type,
          meetingLinkOrLocation: updated.meetingLinkOrLocation,
          interviewerName: updated.interviewerName,
          instructions: updated.instructions,
          requestOrigin: resolveRequestOrigin(req),
          clientOrigin: resolveClientOrigin(req),
        }),
        8000
      );
      emailStatus = emailResult.status;
      emailError = emailResult.error;
    } catch (err) {
      console.error('[Interview] Failed to send interview update email:', err);
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message : 'Email dispatch failed';
    }
  }

  res.json({
    success: true,
    message:
      emailStatus === 'failed'
        ? 'Interview updated and candidate notified in-app, but email delivery failed.'
        : 'Interview updated.',
    data: updated,
    notificationSent,
    emailStatus,
    emailError,
  });
});

router.patch('/:id/confirm', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findInterviewById(String(req.params.id));
  if (!existing || existing.candidateId !== req.user!._id) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }
  const updated = await db.updateInterview(existing._id, { candidateConfirmed: true });
  if (existing.recruiterId && existing.recruiterId !== 'system-catalog') {
    await pushNotification({
      userId: existing.recruiterId,
      type: 'interview_confirmed',
      title: 'Candidate Confirmed Interview',
      message: `${req.user!.name} confirmed attendance for the interview on ${existing.date}.`,
      link: '/recruiter/interviews',
    });
  }
  res.json({ success: true, message: 'Interview attendance confirmed.', data: updated });
});

router.delete('/:id', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findInterviewById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Interview not found.' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const updated = await db.updateInterview(existing._id, { status: 'Cancelled' });
  const candidate = await db.findUserById(existing.candidateId);
  const job = await db.findJobById(existing.jobId);
  const jobTitle = job?.title || 'your applied role';
  const companyName = job?.companyName || 'Hiring Team';

  let notificationSent = false;
  let emailStatus: 'queued' | 'sent' | 'delivered' | 'simulated' | 'failed' | 'skipped' = 'skipped';
  let emailError: string | undefined;

  if (candidate) {
    try {
      await pushNotification({
        userId: candidate._id,
        type: 'interview_cancelled',
        title: 'Interview Cancelled',
        message: `Your interview for ${jobTitle} on ${existing.date} has been cancelled.`,
        link: '/candidate/interviews',
      });
      notificationSent = true;
    } catch (err) {
      console.error('[Interview] Failed to push cancellation notification:', err);
    }
    try {
      const emailResult = await dispatchEmailBounded(
        sendInterviewEmail({
          candidate,
          jobTitle,
          companyName,
          event: 'cancelled',
          date: existing.date,
          time: existing.time,
          timezone: existing.timezone,
          type: existing.type,
          meetingLinkOrLocation: existing.meetingLinkOrLocation,
          interviewerName: existing.interviewerName,
          requestOrigin: resolveRequestOrigin(req),
          clientOrigin: resolveClientOrigin(req),
        }),
        8000
      );
      emailStatus = emailResult.status;
      emailError = emailResult.error;
    } catch (err) {
      console.error('[Interview] Failed to send cancellation email:', err);
      emailStatus = 'failed';
      emailError = err instanceof Error ? err.message : 'Email dispatch failed';
    }
  }

  res.json({
    success: true,
    message:
      emailStatus === 'failed'
        ? 'Interview cancelled and candidate notified in-app, but email delivery failed.'
        : 'Interview cancelled.',
    data: updated,
    notificationSent,
    emailStatus,
    emailError,
  });
});

export default router;
