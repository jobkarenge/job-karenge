import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { resolveLocalFilePath } from '../services/cloudinaryService.ts';
import { verifyUnsubscribeToken } from '../services/emailService.ts';
import { db } from '../store/dataLayer.ts';

export const notificationRouter = Router();

notificationRouter.get('/', requireAuth, async (req: AuthenticatedRequest, res) => {
  const items = await db.listNotifications(req.user!._id);
  const unreadCount = items.filter((n) => !n.read).length;
  res.json({ success: true, data: { items, unreadCount } });
});

notificationRouter.patch('/read-all', requireAuth, async (req: AuthenticatedRequest, res) => {
  await db.markAllNotificationsRead(req.user!._id);
  res.json({ success: true, message: 'All notifications marked as read.' });
});

notificationRouter.patch('/:id/read', requireAuth, async (req: AuthenticatedRequest, res) => {
  const ok = await db.markNotificationRead(String(req.params.id), req.user!._id);
  if (!ok) return res.status(404).json({ success: false, message: 'Notification not found.' });
  res.json({ success: true });
});

notificationRouter.delete('/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
  const ok = await db.deleteNotification(String(req.params.id), req.user!._id);
  if (!ok) return res.status(404).json({ success: false, message: 'Notification not found.' });
  res.json({ success: true });
});

export const emailRouter = Router();

emailRouter.get('/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  const pref = await db.getEmailPreference(req.user!._id);
  res.json({ success: true, data: pref });
});

emailRouter.put('/preferences', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    dailyJobAlerts: z.boolean().optional(),
    weeklyJobAlerts: z.boolean().optional(),
    newJobNotifications: z.boolean().optional(),
    featuredJobAnnouncements: z.boolean().optional(),
    promotionalEmails: z.boolean().optional(),
    applicationNotifications: z.boolean().optional(),
    interviewNotifications: z.boolean().optional(),
    preferredCategories: z.array(z.string()).optional(),
    preferredLocations: z.array(z.string()).optional(),
    preferredWorkModes: z.array(z.string()).optional(),
    frequency: z.enum(['daily', 'weekly', 'monthly']).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid email preferences payload.' });
  }

  const patch: Record<string, unknown> = { ...parsed.data };
  if (parsed.data.promotionalEmails === true) {
    patch.unsubscribedAt = '';
  } else if (parsed.data.promotionalEmails === false) {
    patch.unsubscribedAt = new Date().toISOString();
  }

  const updated = await db.updateEmailPreference(req.user!._id, patch);

  res.json({
    success: true,
    message: 'Email preferences saved.',
    data: updated,
  });
});

emailRouter.post('/unsubscribe', async (req, res) => {
  const token = String(req.body?.token || '');
  const decoded = verifyUnsubscribeToken(token);
  if (!decoded) {
    return res.status(400).json({ success: false, message: 'Invalid or expired unsubscribe link.' });
  }

  await db.updateEmailPreference(decoded.userId, {
    promotionalEmails: false,
    dailyJobAlerts: false,
    weeklyJobAlerts: false,
    newJobNotifications: false,
    featuredJobAnnouncements: false,
    unsubscribedAt: new Date().toISOString(),
  });

  res.json({
    success: true,
    message: `Unsubscribed ${decoded.email} from promotional job alerts. Essential transactional notifications remain active.`,
  });
});

export const filesRouter = Router();

filesRouter.get('/public/:fileName', (req, res) => {
  const filePath = resolveLocalFilePath(String(req.params.fileName));
  if (!filePath || !filePath.endsWith('.webp')) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  res.setHeader('Cache-Control', 'public, max-age=86400');
  res.sendFile(filePath);
});

filesRouter.get('/resume/:fileName', requireAuth, async (req: AuthenticatedRequest, res) => {
  const fileName = String(req.params.fileName);
  const filePath = resolveLocalFilePath(fileName);
  if (!filePath || !filePath.endsWith('.pdf')) {
    return res.status(404).json({ success: false, message: 'Resume file not found' });
  }

  // Strictly enforce authorization on resume access (Candidate owner, Admin, or Recruiter with an application referencing it)
  if (req.user!.role === 'candidate') {
    const prof = await db.getCandidateProfile(req.user!._id);
    if (prof?.resumePublicId !== fileName) {
      return res.status(403).json({ success: false, message: 'Unauthorized resume access.' });
    }
  } else if (req.user!.role === 'recruiter') {
    const allowed = await db.hasRecruiterResumeAccess(req.user!._id, fileName);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Unauthorized resume access.' });
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.sendFile(filePath);
});
