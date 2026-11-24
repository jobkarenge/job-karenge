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

router.get('/stats', async (_req, res) => {
  const [jobs, companies, applications, users] = await Promise.all([
    db.listJobs(),
    db.listCompanies(),
    db.listApplications(),
    db.listUsers(),
  ]);

  const activeJobs = jobs.filter(
    (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= Date.now())
  );

  res.json({
    success: true,
    data: {
      activeJobs: activeJobs.length,
      verifiedCompanies: companies.filter((c) => c.verified).length,
      totalApplications: applications.length,
      registeredCandidates: users.filter((u) => u.role === 'candidate').length,
    },
  });
});

router.get('/categories', async (_req, res) => {
  const [categories, jobs] = await Promise.all([db.listCategories(), db.listJobs()]);
  const now = Date.now();
  const activeJobs = jobs.filter(
    (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
  );

  const enriched = categories
    .filter((c) => c.active)
    .map((c) => ({
      ...c,
      openCount: activeJobs.filter((j) => j.category.toLowerCase() === c.name.toLowerCase()).length,
    }));

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
  const [jobs, companies] = await Promise.all([db.listJobs(), db.listCompanies()]);
  const companyMap = new Map(companies.map((c) => [c._id, c]));
  const now = Date.now();

  const featured = jobs
    .filter((j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now))
    .sort((a, b) => Number(b.featured) - Number(a.featured) || b.viewsCount - a.viewsCount)
    .slice(0, 6)
    .map((j) => ({ ...j, company: companyMap.get(j.companyId) || null }));

  res.json({ success: true, data: featured });
});

router.get('/companies', async (_req, res) => {
  const [companies, jobs] = await Promise.all([db.listCompanies(), db.listJobs()]);
  const now = Date.now();
  const activeJobs = jobs.filter(
    (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
  );

  const enriched = companies.map((c) => ({
    ...c,
    openJobsCount: activeJobs.filter((j) => j.companyId === c._id).length,
  }));

  res.json({ success: true, data: enriched });
});

router.get('/companies/:id', async (req, res) => {
  const companies = await db.listCompanies();
  const company = companies.find((c) => c._id === req.params.id || c.slug === req.params.id);
  if (!company) {
    return res.status(404).json({ success: false, message: 'Company not found' });
  }
  const jobs = (await db.listJobs())
    .filter(
      (j) =>
        j.companyId === company._id &&
        j.status === 'published' &&
        (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= Date.now())
    )
    .map((j) => ({ ...j, company }));
  res.json({ success: true, data: { company, jobs } });
});

router.get('/', async (req, res) => {
  const q = String(req.query.q || '').trim().toLowerCase();
  const company = String(req.query.company || '').trim().toLowerCase();
  const category = String(req.query.category || '').trim().toLowerCase();
  const location = String(req.query.location || '').trim().toLowerCase();
  const workMode = String(req.query.workMode || '').trim();
  const experience = String(req.query.experience || '').trim().toLowerCase();
  const employmentType = String(req.query.employmentType || '').trim();
  const skills = String(req.query.skills || '').trim().toLowerCase();
  const education = String(req.query.education || '').trim().toLowerCase();
  const salaryMin = Number(req.query.salaryMin || 0);
  const salaryMax = Number(req.query.salaryMax || 0);
  const postedDays = Number(req.query.postedDays || 0);
  const sort = String(req.query.sort || 'latest');
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(50, Math.max(1, Number(req.query.limit || 9)));

  const [allJobs, companies] = await Promise.all([db.listJobs(), db.listCompanies()]);
  const companyMap = new Map(companies.map((c) => [c._id, c]));
  const now = Date.now();

  let filtered = allJobs.filter(
    (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
  );

  if (q) {
    filtered = filtered.filter(
      (j) =>
        j.title.toLowerCase().includes(q) ||
        j.companyName.toLowerCase().includes(q) ||
        j.description.toLowerCase().includes(q) ||
        j.skills.some((s) => s.toLowerCase().includes(q))
    );
  }
  if (company) {
    filtered = filtered.filter((j) => j.companyName.toLowerCase().includes(company) || j.companyId === company);
  }
  if (category) {
    filtered = filtered.filter((j) => j.category.toLowerCase() === category);
  }
  if (location) {
    filtered = filtered.filter((j) => j.location.toLowerCase().includes(location));
  }
  if (workMode) {
    filtered = filtered.filter((j) => j.workMode === workMode);
  }
  if (experience) {
    filtered = filtered.filter((j) => j.requiredExperience.toLowerCase().includes(experience));
  }
  if (employmentType) {
    filtered = filtered.filter((j) => j.employmentType === employmentType);
  }
  if (skills) {
    const reqSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);
    filtered = filtered.filter((j) =>
      reqSkills.every((rs) => j.skills.some((js) => js.toLowerCase().includes(rs)))
    );
  }
  if (education) {
    filtered = filtered.filter((j) => j.educationQualification.toLowerCase().includes(education));
  }
  if (salaryMin > 0) {
    filtered = filtered.filter((j) => j.salaryMax >= salaryMin || j.salaryMin >= salaryMin);
  }
  if (salaryMax > 0) {
    filtered = filtered.filter((j) => j.salaryMin <= salaryMax);
  }
  if (postedDays > 0) {
    const cutoff = now - postedDays * 86400_000;
    filtered = filtered.filter((j) => new Date(j.publishedAt || j.createdAt).getTime() >= cutoff);
  }

  filtered.sort((a, b) => {
    if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (sort === 'salary_desc') return b.salaryMax - a.salaryMax;
    if (sort === 'salary_asc') return a.salaryMin - b.salaryMin;
    if (sort === 'relevant') {
      const scoreA = (a.featured ? 50 : 0) + (q && a.title.toLowerCase().includes(q) ? 30 : 0) + a.viewsCount * 0.01;
      const scoreB = (b.featured ? 50 : 0) + (q && b.title.toLowerCase().includes(q) ? 30 : 0) + b.viewsCount * 0.01;
      return scoreB - scoreA;
    }
    return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit).map((j) => ({
    ...j,
    company: companyMap.get(j.companyId) || null,
  }));

  res.json({
    success: true,
    data: {
      items,
      pagination: { page, limit, total, totalPages },
    },
  });
});

router.get('/:id', optionalAuth, async (req: AuthenticatedRequest, res) => {
  const job = await db.findJobById(String(req.params.id));
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job listing not found' });
  }

  // Increment views count cleanly
  await db.updateJob(job._id, { viewsCount: (job.viewsCount || 0) + 1 });
  const company = await db.findCompanyById(job.companyId);

  let hasApplied = false;
  let isSaved = false;
  if (req.user?.role === 'candidate') {
    const dup = await db.findDuplicateApplication(req.user._id, job._id);
    hasApplied = Boolean(dup);
    const saved = await db.listSavedJobs(req.user._id);
    isSaved = saved.some((s) => s.jobId === job._id);
  }

  res.json({
    success: true,
    data: {
      ...job,
      viewsCount: job.viewsCount + 1,
      company,
      hasApplied,
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
