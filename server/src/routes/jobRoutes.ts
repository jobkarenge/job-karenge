import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import {
  optionalAuth,
  requireAuth,
  requireRole,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { handlePublishedJobNotifications } from '../services/schedulerJobs.ts';
import { db } from '../store/dataLayer.ts';
import { slugify } from '../utils/sanitize.ts';

const router = Router();

const jobInputSchema = z.object({
  title: z.string().min(3).max(150),
  category: z.string().min(2).max(100),
  description: z.string().min(20).max(8000),
  applicationDeadline: z.string().nullable().optional(),
  requiredExperience: z.string().min(1).max(80),
  employmentType: z.enum(['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance']),
  workMode: z.enum(['Remote', 'Hybrid', 'On-site']),
  location: z.string().min(2).max(120),
  salaryMin: z.coerce.number().min(0).default(0),
  salaryMax: z.coerce.number().min(0).default(0),
  salaryPeriod: z.enum(['Annual', 'Monthly']).default('Annual'),
  currency: z.string().default('INR'),
  skills: z.array(z.string()).default([]),
  educationQualification: z.string().max(200).default(''),
  openings: z.coerce.number().int().min(1).max(500).default(1),
  responsibilities: z.array(z.string()).default([]),
  requiredQualifications: z.array(z.string()).default([]),
  preferredQualifications: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  contactPerson: z.string().max(100).default(''),
  contactEmail: z.string().email().or(z.literal('')).default(''),
  contactPhone: z.string().max(30).default(''),
  applicationInstructions: z.string().max(1000).default(''),
  status: z.enum(['draft', 'published', 'scheduled', 'closed']).default('published'),
  scheduledFor: z.string().optional(),
  featured: z.boolean().default(false),
  allowDirectApply: z.boolean().default(true),
  companyId: z.string().optional(),
});

router.get('/home', async (_req, res) => {
  const data = await db.getHomeSummaryData();
  res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
  res.json({ success: true, data });
});

router.get('/stats', async (_req, res) => {
  const stats = await db.getPublicStats();
  res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
  res.json({
    success: true,
    data: stats,
  });
});

router.get('/categories', async (_req, res) => {
  const enriched = await db.listCategoriesWithCounts();
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json({ success: true, data: enriched });
});

router.post('/categories', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    name: z.string().trim().min(2, 'Category name must be at least 2 characters').max(80),
    description: z.string().trim().max(300).optional(),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      success: false,
      message: parsed.error.issues[0]?.message || 'Valid category name required.',
    });
  }

  const name = parsed.data.name;
  const slug = slugify(name);
  if (!slug) {
    return res.status(400).json({ success: false, message: 'Valid category name required.' });
  }

  const created = await db.createCategory({
    name,
    slug,
    description: parsed.data.description || `Open positions in ${name}`,
    active: true,
  });

  res.status(201).json({ success: true, message: 'Category ready.', data: created });
});

router.get('/featured', async (_req, res) => {
  const featured = await db.listFeaturedJobs(6);
  res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
  res.json({ success: true, data: featured });
});

router.get('/companies', async (_req, res) => {
  const enriched = await db.listCompaniesWithCounts();
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.json({ success: true, data: enriched });
});

router.get('/companies/:id', async (req, res) => {
  const detail = await db.getCompanyProfileWithJobs(String(req.params.id));
  if (!detail) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }
  res.setHeader('Cache-Control', 'public, max-age=20, stale-while-revalidate=40');
  res.json({ success: true, data: detail });
});

router.get('/', async (req, res) => {
  const result = await db.queryPublishedJobs({
    q: String(req.query.q || ''),
    company: String(req.query.company || ''),
    category: String(req.query.category || ''),
    location: String(req.query.location || ''),
    workMode: String(req.query.workMode || ''),
    experience: String(req.query.experience || ''),
    employmentType: String(req.query.employmentType || ''),
    skills: String(req.query.skills || ''),
    education: String(req.query.education || ''),
    salaryMin: Number(req.query.salaryMin || 0),
    salaryMax: Number(req.query.salaryMax || 0),
    postedDays: Number(req.query.postedDays || 0),
    sort: String(req.query.sort || 'latest'),
    page: Math.max(1, Number(req.query.page || 1)),
    limit: Math.min(50, Math.max(1, Number(req.query.limit || 9))),
  });

  res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  res.json({
    success: true,
    data: result,
  });
});

router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const job = await db.findJobById(String(req.params.id));
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job listing not found' });
  }

  const isCandidate = req.user?.role === 'candidate';
  const [company, dup, isSaved] = await Promise.all([
    db.findCompanyById(job.companyId),
    isCandidate ? db.findDuplicateApplication(req.user!._id, job._id) : Promise.resolve(null),
    isCandidate ? db.hasSavedJob(req.user!._id, job._id) : Promise.resolve(false),
    db.incrementJobViews(job._id),
  ]);

  res.setHeader('Vary', 'Authorization, Cookie');
  if (req.user) {
    res.setHeader('Cache-Control', 'no-store');
  } else {
    res.setHeader('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
  }

  res.json({
    success: true,
    data: {
      ...job,
      viewsCount: (job.viewsCount || 0) + 1,
      company,
      hasApplied: Boolean(dup),
      isSaved,
    },
  });
});

router.post('/', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const parsed = jobInputSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid job form input' });
  }

  let companyId = '';
  let companyName = '';

  if (req.user!.role === 'recruiter') {
    const recProfile = await db.getRecruiterProfile(req.user!._id);
    if (!recProfile) {
      return res.status(400).json({ success: false, message: 'Recruiter profile not initialized.' });
    }
    if (recProfile.verificationStatus !== 'approved') {
      return res.status(403).json({
        success: false,
        message: 'Your recruiter account must be verified by an admin before publishing jobs.',
      });
    }
    const requestedCompanyId = parsed.data.companyId?.trim() || recProfile.companyId;
    const targetCompany = requestedCompanyId ? await db.findCompanyById(requestedCompanyId) : null;
    if (
      !targetCompany ||
      (String(targetCompany.ownerRecruiterId || '') !== String(req.user!._id) &&
        String(targetCompany._id) !== String(recProfile.companyId))
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only post jobs for companies you created or manage.',
      });
    }
    if (!targetCompany.verified) {
      return res.status(403).json({
        success: false,
        message: 'This company must be verified before publishing jobs.',
      });
    }
    companyId = targetCompany._id;
    companyName = targetCompany.name;
  } else {
    const companies = await db.listCompanies();
    companyId = String(req.body.companyId || companies[0]?._id || '');
    const company = companyId ? await db.findCompanyById(companyId) : null;
    companyName = company?.name || 'Job Karenge Partner';
  }

  const data = parsed.data;
  const categoryName = data.category.trim();
  const catSlug = slugify(categoryName);
  if (catSlug) {
    await db.createCategory({
      name: categoryName,
      slug: catSlug,
      description: `Open positions in ${categoryName}`,
      active: true,
    });
  }

  const slug = `${slugify(data.title)}-${crypto.randomBytes(3).toString('hex')}`;
  const normalizedDeadline = data.applicationDeadline && data.applicationDeadline.trim() ? data.applicationDeadline.trim() : null;
  const job = await db.createJob({
    ...data,
    applicationDeadline: normalizedDeadline,
    category: categoryName,
    recruiterId: req.user!._id,
    companyId,
    companyName,
    slug,
    viewsCount: 0,
    applicationsCount: 0,
    publishedAt: data.status === 'published' ? new Date().toISOString() : undefined,
  });

  if (job.status === 'published') {
    void handlePublishedJobNotifications(job).catch((err) =>
      console.error('[Jobs] Instant job alert notification error:', err)
    );
  }

  res.status(201).json({ success: true, message: 'Job created successfully.', data: job });
});

router.put('/:id', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findJobById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'You can only edit jobs you created.' });
  }

  const parsed = jobInputSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid job data' });
  }

  const patch = { ...parsed.data } as Record<string, unknown>;
  if (parsed.data.companyId && req.user!.role === 'recruiter') {
    const recProfile = await db.getRecruiterProfile(req.user!._id);
    const targetCompany = await db.findCompanyById(parsed.data.companyId);
    if (
      !targetCompany ||
      (String(targetCompany.ownerRecruiterId || '') !== String(req.user!._id) &&
        String(targetCompany._id) !== String(recProfile?.companyId || ''))
    ) {
      return res.status(403).json({
        success: false,
        message: 'You can only assign jobs to companies you manage.',
      });
    }
    patch.companyId = targetCompany._id;
    patch.companyName = targetCompany.name;
  }
  if (parsed.data.category) {
    const categoryName = parsed.data.category.trim();
    patch.category = categoryName;
    const catSlug = slugify(categoryName);
    if (catSlug) {
      await db.createCategory({
        name: categoryName,
        slug: catSlug,
        description: `Open positions in ${categoryName}`,
        active: true,
      });
    }
  }
  if (parsed.data.applicationDeadline !== undefined) {
    patch.applicationDeadline =
      parsed.data.applicationDeadline && parsed.data.applicationDeadline.trim()
        ? parsed.data.applicationDeadline.trim()
        : null;
  }
  if (parsed.data.status === 'published' && !existing.publishedAt) {
    patch.publishedAt = new Date().toISOString();
  }

  const updated = await db.updateJob(existing._id, patch);
  if (
    updated &&
    updated.status === 'published' &&
    (existing.status !== 'published' || (!existing.featured && updated.featured))
  ) {
    void handlePublishedJobNotifications(updated).catch((err) =>
      console.error('[Jobs] Instant job update notification error:', err)
    );
  }
  res.json({ success: true, message: 'Job updated successfully.', data: updated });
});

router.patch('/:id/status', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findJobById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const statusSchema = z.object({ status: z.enum(['draft', 'published', 'scheduled', 'closed']) });
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Invalid status' });
  }

  const updated = await db.updateJob(existing._id, {
    status: parsed.data.status,
    publishedAt: parsed.data.status === 'published' ? existing.publishedAt || new Date().toISOString() : existing.publishedAt,
  });
  if (updated && updated.status === 'published' && existing.status !== 'published') {
    void handlePublishedJobNotifications(updated).catch((err) =>
      console.error('[Jobs] Instant job status notification error:', err)
    );
  }
  res.json({ success: true, message: `Job status changed to ${parsed.data.status}.`, data: updated });
});

router.post('/:id/duplicate', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findJobById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { _id, createdAt, updatedAt, viewsCount, applicationsCount, publishedAt, ...rest } = existing;
  const copy = await db.createJob({
    ...rest,
    title: `${existing.title} (Copy)`,
    slug: `${slugify(existing.title)}-copy-${crypto.randomBytes(3).toString('hex')}`,
    status: 'draft',
    viewsCount: 0,
    applicationsCount: 0,
  });
  res.status(201).json({ success: true, message: 'Job duplicated as draft.', data: copy });
});

router.delete('/:id', requireAuth, requireRole('recruiter', 'admin'), async (req: AuthenticatedRequest, res) => {
  const existing = await db.findJobById(String(req.params.id));
  if (!existing) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  if (req.user!.role === 'recruiter' && existing.recruiterId !== req.user!._id) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  await db.deleteJob(existing._id);
  res.json({ success: true, message: 'Job deleted successfully.' });
});

export default router;
