import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { env } from '../config/env.ts';
import { requireAuth, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { resolveLocalFilePath } from '../services/cloudinaryService.ts';
import {
  processBrevoWebhookEvent,
  syncCandidateContactToBrevo,
  verifyUnsubscribeToken,
  type BrevoWebhookPayload,
} from '../services/emailService.ts';
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
  const syncResult = await syncCandidateContactToBrevo(req.user!._id);

  res.json({
    success: true,
    message: syncResult.synced
      ? 'Email preferences saved & synchronized with Brevo.'
      : 'Email preferences saved.',
    data: await db.getEmailPreference(req.user!._id),
    brevoSynced: syncResult.synced,
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

  await syncCandidateContactToBrevo(decoded.userId);

  res.json({
    success: true,
    message: `Unsubscribed ${decoded.email} from promotional job alerts. Essential transactional notifications remain active.`,
  });
});

function verifyWebhookToken(supplied: string, expected: string): boolean {
  if (!supplied || !expected) return false;
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

emailRouter.post('/webhooks/brevo', async (req, res) => {
  if (env.brevoWebhookSecret) {
    const headerSecret =
      String(req.headers['x-brevo-webhook-secret'] || req.headers['authorization'] || '')
        .replace(/^Bearer\s+/i, '')
        .trim() || String(req.query.secret || '').trim();

    if (!verifyWebhookToken(headerSecret, env.brevoWebhookSecret)) {
      return res.status(401).json({ success: false, message: 'Unauthorized Brevo webhook request.' });
    }
  }

  const rawBody = req.body;
  const events: BrevoWebhookPayload[] = Array.isArray(rawBody) ? rawBody : [rawBody];
  let processed = 0;

  for (const evt of events) {
    if (!evt || typeof evt !== 'object') continue;
    const outcome = await processBrevoWebhookEvent(evt);
    if (outcome.handled) processed++;
  }

  res.json({ success: true, processed });
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
    const apps = await db.listApplications();
    const allowed = apps.some((a) => a.recruiterId === req.user!._id && a.resumePublicId === fileName);
    if (!allowed) {
      return res.status(403).json({ success: false, message: 'Unauthorized resume access.' });
    }
  }

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="${fileName}"`);
  res.sendFile(filePath);
});
