import { Router } from 'express';
import { z } from 'zod';
import { integrationStatus, resolveClientOrigin, resolveRequestOrigin } from '../config/env.ts';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import {
  dispatchEmail,
  dispatchEmailBounded,
  getEmailDiagnostics,
  recomputeCampaignStatsFromLogs,
  sendAccountNotificationEmail,
  verifyGmailSmtpConnection,
} from '../services/emailService.ts';
import { emitUserEvent, pushNotification } from '../services/notificationService.ts';
import { dispatchCampaignToSubscribedCandidates, handlePublishedJobNotifications } from '../services/schedulerJobs.ts';
import { db } from '../store/dataLayer.ts';
import { sanitizeUser, slugify } from '../utils/sanitize.ts';

const router = Router();

router.use(requireAuth, requireRole('admin'));

router.get('/dashboard', async (_req, res) => {
  const metrics = await db.getAdminDashboardMetrics();
  res.json({
    success: true,
    data: {
      ...metrics,
      integrationStatus,
    },
  });
});

router.get('/users', async (req, res) => {
  const role = String(req.query.role || '');
  const q = String(req.query.q || '').trim();
  const [users, recProfiles] = await Promise.all([
    db.listUsersSafe({ role: role || undefined, q: q || undefined }),
    db.listRecruiterProfiles(),
  ]);
  const recMap = new Map(recProfiles.map((r) => [r.userId, r]));

  res.json({
    success: true,
    data: users.map((u) => ({
      ...u,
      recruiterProfile: recMap.get(u._id) || null,
    })),
  });
});

router.patch('/users/:id/status', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ accountStatus: z.enum(['active', 'suspended']) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }
  const targetId = String(req.params.id);
  if (targetId === req.user!._id) {
    return res.status(400).json({ success: false, message: 'Cannot suspend your own admin account.' });
  }
  const updated = await db.updateUser(targetId, { accountStatus: parsed.data.accountStatus });
  if (!updated) return res.status(404).json({ success: false, message: 'User not found.' });

  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: `USER_STATUS_${parsed.data.accountStatus.toUpperCase()}`,
    targetType: 'User',
    targetId,
    details: `Changed user ${updated.email} status to ${parsed.data.accountStatus}`,
    ipAddress: req.ip || '',
  });

  res.json({ success: true, message: 'User status updated.', data: sanitizeUser(updated) });
});

router.get('/recruiters', async (_req, res) => {
  const recProfiles = await db.listRecruiterProfiles();
  if (recProfiles.length === 0) {
    return res.json({ success: true, data: [] });
  }
  const [users, companies] = await Promise.all([
    db.listUsersByIds(recProfiles.map((r) => r.userId)),
    db.listCompaniesByIds(recProfiles.map((r) => r.companyId)),
  ]);
  const userMap = new Map(users.map((u) => [u._id, sanitizeUser(u)]));
  const compMap = new Map(companies.map((c) => [c._id, c]));

  const items = recProfiles.map((r) => ({
    ...r,
    user: userMap.get(r.userId) || null,
    company: compMap.get(r.companyId) || null,
  }));

  res.json({ success: true, data: items });
});

router.patch('/recruiters/:userId/verification', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    status: z.enum(['approved', 'rejected']),
    reason: z.string().max(400).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid verification decision' });
  }

  const userId = String(req.params.userId);
  const updated = await db.updateRecruiterProfile(userId, {
    verificationStatus: parsed.data.status,
    verifiedBy: req.user!._id,
    verifiedAt: new Date().toISOString(),
    rejectionReason: parsed.data.reason || '',
  });

  if (!updated) {
    return res.status(404).json({ success: false, message: 'Recruiter profile not found.' });
  }

  const ownedCompanies = await db.listOwnedCompanies(userId, updated.companyId);
  await Promise.all(
    ownedCompanies.map((c) => db.updateCompany(c._id, { verified: parsed.data.status === 'approved' }))
  );
  emitUserEvent(userId, 'companies:updated', { action: 'verification_updated' });

  await pushNotification({
    userId,
    type: 'recruiter_verification',
    title: parsed.data.status === 'approved' ? 'Recruiter Account Verified' : 'Recruiter Verification Rejected',
    message:
      parsed.data.status === 'approved'
        ? 'Your recruiter account is now verified. You can publish live job listings.'
        : `Verification declined: ${parsed.data.reason || 'Please review your company profile details.'}`,
    link: '/recruiter/jobs/new',
  });

  const recruiterUser = await db.findUserById(userId);
  if (recruiterUser) {
    const clientUrl =
      db.getPlatformSettings().clientUrl?.trim() ||
      getEmailDiagnostics(resolveRequestOrigin(req), resolveClientOrigin(req)).clientUrl;
    await dispatchEmailBounded(
      sendAccountNotificationEmail({
        user: recruiterUser,
        title: parsed.data.status === 'approved' ? 'Recruiter Account Verified' : 'Recruiter Verification Update',
        message:
          parsed.data.status === 'approved'
            ? 'Your recruiter profile has been verified by our admin team. You can now publish live job openings on Job Karenge.'
            : `Your recruiter verification status is currently rejected: ${parsed.data.reason || 'Please review your company profile details.'}`,
        ctaLabel: parsed.data.status === 'approved' ? 'Post a New Job' : 'Review Company Profile',
        ctaUrl: `${clientUrl}${parsed.data.status === 'approved' ? '/recruiter/jobs/new' : '/recruiter/company'}`,
        requestOrigin: resolveRequestOrigin(req),
        clientOrigin: resolveClientOrigin(req),
      }),
      8000
    );
  }

  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: `RECRUITER_${parsed.data.status.toUpperCase()}`,
    targetType: 'RecruiterProfile',
    targetId: userId,
    details: `Recruiter verification set to ${parsed.data.status}`,
    ipAddress: req.ip || '',
  });

  res.json({ success: true, message: `Recruiter marked as ${parsed.data.status}.`, data: updated });
});

router.get('/companies', async (_req, res) => {
  res.json({ success: true, data: await db.listCompanies() });
});

router.patch('/companies/:id/verify', async (req: AuthenticatedRequest, res) => {
  const verified = Boolean(req.body?.verified);
  const updated = await db.updateCompany(String(req.params.id), { verified });
  if (!updated) return res.status(404).json({ success: false, message: 'Company not found.' });
  if (updated.ownerRecruiterId) {
    const ownerId = String(updated.ownerRecruiterId);
    if (verified) {
      await db.updateRecruiterProfile(ownerId, {
        verificationStatus: 'approved',
        verifiedBy: req.user!._id,
        verifiedAt: new Date().toISOString(),
      });
    } else {
      const owned = await db.listOwnedCompanies(ownerId);
      const otherVerified = owned.some((c) => c._id !== updated._id && c.verified);
      if (!otherVerified) {
        await db.updateRecruiterProfile(ownerId, {
          verificationStatus: 'rejected',
          verifiedBy: req.user!._id,
          verifiedAt: new Date().toISOString(),
        });
      }
    }
    emitUserEvent(ownerId, 'companies:updated', { companyId: updated._id, action: 'verified_updated' });
  }
  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: verified ? 'COMPANY_VERIFIED' : 'COMPANY_UNVERIFIED',
    targetType: 'Company',
    targetId: updated._id,
    details: `${updated.name} verified=${verified}`,
    ipAddress: req.ip || '',
  });
  res.json({ success: true, data: updated });
});

router.get('/jobs', async (_req, res) => {
  res.json({ success: true, data: await db.listJobs() });
});

router.patch('/jobs/:id/feature', async (req: AuthenticatedRequest, res) => {
  const featured = Boolean(req.body?.featured);
  const updated = await db.updateJob(String(req.params.id), { featured });
  if (!updated) return res.status(404).json({ success: false, message: 'Job not found.' });
  if (updated.featured && updated.status === 'published') {
    void handlePublishedJobNotifications(updated).catch((err) =>
      console.error('[Admin] Featured job announcement error:', err)
    );
  }
  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: featured ? 'JOB_FEATURED' : 'JOB_UNFEATURED',
    targetType: 'Job',
    targetId: updated._id,
    details: `${updated.title} featured=${featured}`,
    ipAddress: req.ip || '',
  });
  res.json({ success: true, data: updated });
});

router.get('/applications', async (_req, res) => {
  const applications = await db.listApplications();
  if (applications.length === 0) {
    return res.json({ success: true, data: [] });
  }
  const [jobs, users] = await Promise.all([
    db.listJobsByIds(applications.map((a) => a.jobId)),
    db.listUsersByIds(applications.map((a) => a.candidateId)),
  ]);
  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const userMap = new Map(users.map((u) => [u._id, sanitizeUser(u)]));

  res.json({
    success: true,
    data: applications.map((a) => ({
      ...a,
      job: jobMap.get(a.jobId) || null,
      candidate: userMap.get(a.candidateId) || null,
    })),
  });
});

router.get('/categories', async (_req, res) => {
  res.json({ success: true, data: await db.listCategories() });
});

router.post('/categories', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ name: z.string().min(2).max(80), description: z.string().max(300).default('') });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Valid category name required.' });
  }
  const created = await db.createCategory({
    name: parsed.data.name.trim(),
    slug: slugify(parsed.data.name),
    description: parsed.data.description,
    active: true,
  });
  res.status(201).json({ success: true, data: created });
});

router.delete('/categories/:id', async (req, res) => {
  await db.deleteCategory(String(req.params.id));
  res.json({ success: true });
});

router.get('/email-campaigns', async (_req, res) => {
  res.json({ success: true, data: await db.listEmailCampaigns() });
});

router.post('/email-campaigns', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    title: z.string().min(2).max(150),
    subject: z.string().min(2).max(200),
    templateName: z.string().default('promotional_job_digest'),
    htmlContent: z.string().default(''),
    targetAudience: z.string().default('all_candidates'),
    scheduledDate: z.string().optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid email campaign data.' });
  }
  const hasFutureSchedule =
    Boolean(parsed.data.scheduledDate?.trim()) && new Date(parsed.data.scheduledDate!).getTime() > Date.now();
  const campaign = await db.createEmailCampaign({
    ...parsed.data,
    scheduledDate: parsed.data.scheduledDate?.trim() || undefined,
    status: hasFutureSchedule ? 'scheduled' : 'draft',
    stats: {
      sent: 0,
      accepted: 0,
      delivered: 0,
      failed: 0,
      bounced: 0,
      unsubscribed: 0,
      opened: 0,
      clicked: 0,
    },
    createdBy: req.user!._id,
  });
  res.status(201).json({ success: true, data: campaign });
});

router.post('/email-campaigns/:id/send', async (req: AuthenticatedRequest, res) => {
  const campaign = await db.findEmailCampaignById(String(req.params.id));
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
  if (campaign.status === 'sent') {
    return res.status(400).json({ success: false, message: 'This campaign has already been dispatched.' });
  }

  const updated = await dispatchCampaignToSubscribedCandidates(campaign._id);
  const sentCount = updated?.stats?.sent || 0;

  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: 'EMAIL_CAMPAIGN_DISPATCHED',
    targetType: 'EmailCampaign',
    targetId: campaign._id,
    details: `Dispatched campaign "${campaign.title}" via Gmail SMTP to ${sentCount} subscribed candidates`,
    ipAddress: req.ip || '',
  });

  res.json({
    success: true,
    message: `Campaign processed via Gmail SMTP for ${sentCount} subscribed candidate${sentCount === 1 ? '' : 's'}.`,
    data: updated,
  });
});

router.post('/email-campaigns/:id/sync-stats', async (req, res) => {
  const campaign = await db.findEmailCampaignById(String(req.params.id));
  if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });

  const updated = await recomputeCampaignStatsFromLogs(campaign._id);
  res.json({
    success: true,
    message: 'Campaign metrics refreshed from Gmail SMTP dispatch logs.',
    data: updated,
  });
});

router.get('/email-logs', async (_req, res) => {
  res.json({ success: true, data: await db.listEmailLogs(100) });
});

router.get('/email-diagnostics', async (req, res) => {
  const diag = getEmailDiagnostics(resolveRequestOrigin(req), resolveClientOrigin(req));
  let smtpVerification: Awaited<ReturnType<typeof verifyGmailSmtpConnection>> | null = null;
  if (req.query.verify === 'true') {
    smtpVerification = await verifyGmailSmtpConnection();
  }
  res.json({
    success: true,
    data: {
      ...diag,
      ...(smtpVerification ? { smtpVerification } : {}),
    },
  });
});

router.post('/test-email', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({ to: z.string().email().optional() });
  const parsed = schema.safeParse(req.body || {});
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Please provide a valid recipient email.' });
  }
  const to = (parsed.data.to || req.user!.email).trim().toLowerCase();
  const recipientUser =
    to === req.user!.email.toLowerCase() ? req.user! : await db.findUserByEmail(to);
  const diag = getEmailDiagnostics(resolveRequestOrigin(req), resolveClientOrigin(req));
  const recipientName =
    recipientUser?.name &&
    recipientUser.name.trim().toLowerCase() !== diag.fromName.trim().toLowerCase() &&
    recipientUser.name.trim().toLowerCase() !== 'job karenge'
      ? recipientUser.name.trim()
      : undefined;

  const result = await dispatchEmail({
    to,
    toName: recipientName,
    userId: recipientUser?._id,
    type: 'transactional',
    templateName: 'admin_test_email',
    subject: 'Job Karenge — Gmail SMTP Transactional Email Test',
    title: 'Gmail SMTP Diagnostic Test',
    preheader: 'Verification email from Job Karenge Admin via Gmail SMTP.',
    bodyHtml: `<p>This is a live test email dispatched from <strong>Job Karenge</strong> via <strong>Gmail SMTP (${diag.smtpHost}:${diag.smtpPort})</strong> using sender <code>${diag.fromEmail}</code>.</p>
      <p>Your existing Job Karenge branded HTML email layout, typography, and transactional workflows are active and ready.</p>`,
  });
  res.json({
    success: result.status !== 'failed',
    message:
      result.status === 'sent' || result.status === 'queued'
        ? `Gmail SMTP accepted test email for ${to} (messageId: ${result.messageId}).`
        : result.status === 'simulated'
          ? `GMAIL_USER / GMAIL_APP_PASSWORD not configured; logged preview for ${to}.`
          : `Gmail SMTP failed: ${result.error || 'Unknown error'}`,
    data: result,
  });
});

router.get('/contact-messages', async (_req, res) => {
  res.json({ success: true, data: await db.listContactMessages() });
});

router.patch('/contact-messages/:id/resolve', async (req, res) => {
  const updated = await db.resolveContactMessage(String(req.params.id));
  if (!updated) return res.status(404).json({ success: false, message: 'Message not found' });
  res.json({ success: true, data: updated });
});

function isOptionalHttpUrl(val?: string): boolean {
  if (!val || !val.trim()) return true;
  try {
    const parsed = new URL(val.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

router.get('/settings', async (req, res) => {
  res.json({
    success: true,
    data: {
      settings: db.getPlatformSettings(),
      integrationStatus,
      emailDiagnostics: getEmailDiagnostics(resolveRequestOrigin(req), resolveClientOrigin(req)),
    },
  });
});

router.put('/settings', async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    requireRecruiterApproval: z.boolean().optional(),
    autoExpireJobs: z.boolean().optional(),
    promotionalDigestEnabled: z.boolean().optional(),
    supportEmail: z.string().trim().email().optional(),
    maxPdfSizeBytes: z.number().int().min(100_000).max(5_242_880).optional(),
    emailFromEmail: z
      .string()
      .trim()
      .refine((v) => v === '' || z.string().email().safeParse(v).success, {
        message: 'Sender Email must be empty (to use server env) or a valid email address.',
      })
      .optional(),
    emailFromName: z.string().trim().max(100).optional(),
    clientUrl: z
      .string()
      .trim()
      .refine(isOptionalHttpUrl, { message: 'Public App URL must be a valid http(s) URL or empty.' })
      .optional(),
    serverUrl: z
      .string()
      .trim()
      .refine(isOptionalHttpUrl, { message: 'Public Server URL must be a valid http(s) URL or empty.' })
      .optional(),
    socialLinks: z
      .object({
        linkedin: z.string().trim().refine(isOptionalHttpUrl, { message: 'LinkedIn URL must be a valid http(s) URL.' }).optional(),
        twitter: z.string().trim().refine(isOptionalHttpUrl, { message: 'Twitter / X URL must be a valid http(s) URL.' }).optional(),
        instagram: z.string().trim().refine(isOptionalHttpUrl, { message: 'Instagram URL must be a valid http(s) URL.' }).optional(),
        facebook: z.string().trim().refine(isOptionalHttpUrl, { message: 'Facebook URL must be a valid http(s) URL.' }).optional(),
        youtube: z.string().trim().refine(isOptionalHttpUrl, { message: 'YouTube URL must be a valid http(s) URL.' }).optional(),
        github: z.string().trim().refine(isOptionalHttpUrl, { message: 'GitHub URL must be a valid http(s) URL.' }).optional(),
      })
      .optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Invalid platform or environment settings.',
    });
  }
  const currentSocial = db.getPlatformSettings().socialLinks || {
    linkedin: '',
    twitter: '',
    instagram: '',
    facebook: '',
    youtube: '',
    github: '',
  };
  const { socialLinks: incomingSocial, ...restSettings } = parsed.data;
  const normalizedPatch: Partial<import('../types/domain.ts').PlatformSettingsRecord> = {
    ...restSettings,
    ...(restSettings.clientUrl !== undefined ? { clientUrl: restSettings.clientUrl.replace(/\/+$/, '') } : {}),
    ...(restSettings.serverUrl !== undefined ? { serverUrl: restSettings.serverUrl.replace(/\/+$/, '') } : {}),
    ...(incomingSocial !== undefined
      ? {
          socialLinks: {
            linkedin: incomingSocial.linkedin ?? currentSocial.linkedin,
            twitter: incomingSocial.twitter ?? currentSocial.twitter,
            instagram: incomingSocial.instagram ?? currentSocial.instagram,
            facebook: incomingSocial.facebook ?? currentSocial.facebook,
            youtube: incomingSocial.youtube ?? currentSocial.youtube,
            github: incomingSocial.github ?? currentSocial.github,
          },
        }
      : {}),
  };
  const updated = await db.updatePlatformSettings(normalizedPatch);
  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'admin',
    action: 'PLATFORM_SETTINGS_UPDATED',
    targetType: 'PlatformSettings',
    targetId: 'global',
    details: JSON.stringify(normalizedPatch),
    ipAddress: req.ip || '',
  });
  res.json({
    success: true,
    message: 'Platform & environment settings updated.',
    data: {
      settings: updated,
      emailDiagnostics: getEmailDiagnostics(resolveRequestOrigin(req), resolveClientOrigin(req)),
    },
  });
});

router.get('/audit-logs', async (_req, res) => {
  res.json({ success: true, data: await db.listAuditLogs(150) });
});

export default router;
