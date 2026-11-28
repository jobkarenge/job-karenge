import crypto from 'crypto';
import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { uploadImageMiddleware } from '../middleware/uploadMiddleware.ts';
import { deleteStoredAsset, uploadOptimizedImage } from '../services/cloudinaryService.ts';
import { emitUserEvent } from '../services/notificationService.ts';
import { db } from '../store/dataLayer.ts';
import type { CompanyRecord } from '../types/domain.ts';
import { isSafeHttpUrl, sanitizeUser, slugify } from '../utils/sanitize.ts';

const router = Router();

async function getOwnedCompanies(recruiterId: string, primaryCompanyId?: string): Promise<CompanyRecord[]> {
  return db.listOwnedCompanies(recruiterId, primaryCompanyId);
}

function isOwnedByRecruiter(company: CompanyRecord | null, recruiterId: string, primaryCompanyId?: string): boolean {
  if (!company) return false;
  const recId = String(recruiterId);
  const primId = primaryCompanyId ? String(primaryCompanyId) : '';
  return (
    (Boolean(company.ownerRecruiterId) && String(company.ownerRecruiterId) === recId) ||
    (primId !== '' && String(company._id) === primId)
  );
}

router.get('/dashboard', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const recruiterId = req.user!._id;
  const [myJobs, myApps, myInterviews, recProfile] = await Promise.all([
    db.listJobsByRecruiter(recruiterId),
    db.listApplicationsByRecruiter(recruiterId),
    db.listInterviewsByUser('recruiter', recruiterId),
    db.getRecruiterProfile(recruiterId),
  ]);

  const stats = {
    totalJobs: myJobs.length,
    activeJobs: myJobs.filter((j) => j.status === 'published').length,
    draftJobs: myJobs.filter((j) => j.status === 'draft').length,
    expiredJobs: myJobs.filter((j) => j.status === 'expired' || j.status === 'closed').length,
    totalApplications: myApps.length,
    newApplications: myApps.filter((a) => a.status === 'Applied').length,
    shortlisted: myApps.filter((a) => a.status === 'Shortlisted').length,
    interviewsScheduled: myInterviews.filter((i) => i.status === 'Scheduled' || i.status === 'Rescheduled').length,
    selected: myApps.filter((a) => a.status === 'Selected').length,
  };

  const statusDistribution = [
    { name: 'Applied', count: myApps.filter((a) => a.status === 'Applied').length },
    { name: 'Shortlisted', count: myApps.filter((a) => a.status === 'Shortlisted').length },
    { name: 'Interview', count: myApps.filter((a) => a.status === 'Interview Scheduled').length },
    { name: 'Selected', count: myApps.filter((a) => a.status === 'Selected').length },
    { name: 'Rejected', count: myApps.filter((a) => a.status === 'Rejected').length },
  ];

  const appCountByJob = new Map<string, number>();
  for (const a of myApps) {
    appCountByJob.set(a.jobId, (appCountByJob.get(a.jobId) || 0) + 1);
  }
  const applicationsByJob = myJobs.slice(0, 6).map((j) => ({
    jobTitle: j.title.length > 26 ? `${j.title.slice(0, 26)}...` : j.title,
    applications: appCountByJob.get(j._id) || 0,
    views: j.viewsCount,
  }));

  res.json({
    success: true,
    data: {
      verificationStatus: recProfile?.verificationStatus || 'pending',
      stats,
      statusDistribution,
      applicationsByJob,
    },
  });
});

router.get('/jobs', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const jobs = await db.listJobsByRecruiter(req.user!._id);
  res.json({ success: true, data: jobs });
});

router.get('/companies', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const recProfile = await db.getRecruiterProfile(req.user!._id);
  const companies = await getOwnedCompanies(req.user!._id, recProfile?.companyId);
  res.json({ success: true, data: companies });
});

router.get('/profile', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const recProfile = await db.getRecruiterProfile(req.user!._id);
  const companies = await getOwnedCompanies(req.user!._id, recProfile?.companyId);
  const company = companies.find((c) => c._id === recProfile?.companyId) || companies[0] || null;
  res.json({
    success: true,
    data: {
      user: sanitizeUser(req.user!),
      recruiterProfile: recProfile,
      company,
      companies,
    },
  });
});

const companyFieldsSchema = z.object({
  companyName: z.string().trim().min(2, 'Company name must be at least 2 characters').max(150).optional(),
  name: z.string().trim().min(2).max(150).optional(),
  industry: z.string().trim().max(120).optional(),
  description: z.string().trim().max(4000).optional(),
  website: z.string().trim().max(300).optional(),
  size: z.string().trim().max(60).optional(),
  headquarters: z.string().trim().max(160).optional(),
  contactEmail: z.string().trim().email().or(z.literal('')).optional(),
  contactPhone: z.string().trim().max(30).optional(),
  socialLinks: z
    .object({
      linkedin: z.string().optional(),
      twitter: z.string().optional(),
    })
    .optional(),
});

router.post('/companies', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const parsed = companyFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid company input' });
  }
  const d = parsed.data;
  const companyTitle = (d.companyName || d.name || '').trim();
  if (companyTitle.length < 2) {
    return res.status(400).json({ success: false, message: 'Company name is required (at least 2 characters).' });
  }
  if (d.website && !isSafeHttpUrl(d.website)) {
    return res.status(400).json({ success: false, message: 'Website must be a valid http(s) URL.' });
  }

  const recProfile = await db.getRecruiterProfile(req.user!._id);
  const isApprovedRecruiter = recProfile?.verificationStatus === 'approved';
  const slug = `${slugify(companyTitle) || 'company'}-${crypto.randomBytes(2).toString('hex')}`;

  const created = await db.createCompany({
    name: companyTitle,
    slug,
    logoUrl: '',
    logoPublicId: '',
    bannerUrl: '',
    bannerPublicId: '',
    industry: d.industry || 'Technology & Services',
    description: d.description || `${companyTitle} hiring team on Job Karenge.`,
    website: d.website || '',
    size: d.size || '50-200 employees',
    headquarters: d.headquarters || req.user!.location || 'India',
    socialLinks: {
      linkedin: d.socialLinks?.linkedin || '',
      twitter: d.socialLinks?.twitter || '',
    },
    contactEmail: d.contactEmail || req.user!.email,
    contactPhone: d.contactPhone || req.user!.phone || '',
    verified: isApprovedRecruiter,
    ownerRecruiterId: req.user!._id,
  });

  if (recProfile && !recProfile.companyId) {
    await db.updateRecruiterProfile(req.user!._id, {
      companyId: created._id,
      companyName: created.name,
    });
  }

  await db.createAuditLog({
    actorId: req.user!._id,
    actorEmail: req.user!.email,
    actorRole: 'recruiter',
    action: 'RECRUITER_COMPANY_CREATED',
    targetType: 'Company',
    targetId: created._id,
    details: `Recruiter created company "${created.name}"`,
    ipAddress: req.ip || '',
  });

  emitUserEvent(req.user!._id, 'companies:updated', { companyId: created._id, action: 'created' });

  res.status(201).json({
    success: true,
    message: isApprovedRecruiter
      ? `Company "${created.name}" created and ready for job postings.`
      : `Company "${created.name}" created. It will be verified once your recruiter account is approved.`,
    data: created,
  });
});

router.put('/companies/:id', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const parsed = companyFieldsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid company input' });
  }
  const d = parsed.data;
  if (d.website && !isSafeHttpUrl(d.website)) {
    return res.status(400).json({ success: false, message: 'Website must be a valid http(s) URL.' });
  }

  const recProfile = await db.getRecruiterProfile(req.user!._id);
  const target = await db.findCompanyById(String(req.params.id));
  if (!isOwnedByRecruiter(target, req.user!._id, recProfile?.companyId)) {
    return res.status(403).json({ success: false, message: 'You do not have permission to edit this company.' });
  }

  const nextName = (d.companyName || d.name || '').trim();
  const updated = await db.updateCompany(target!._id, {
    ...(nextName ? { name: nextName } : {}),
    ...(d.industry !== undefined ? { industry: d.industry } : {}),
    ...(d.description !== undefined ? { description: d.description } : {}),
    ...(d.website !== undefined ? { website: d.website } : {}),
    ...(d.size !== undefined ? { size: d.size } : {}),
    ...(d.headquarters !== undefined ? { headquarters: d.headquarters } : {}),
    ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
    ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}),
    ...(d.socialLinks
      ? {
          socialLinks: {
            linkedin: d.socialLinks.linkedin || '',
            twitter: d.socialLinks.twitter || '',
          },
        }
      : {}),
  });

  if (updated && recProfile && recProfile.companyId === updated._id && nextName) {
    await db.updateRecruiterProfile(req.user!._id, { companyName: nextName });
  }

  emitUserEvent(req.user!._id, 'companies:updated', { companyId: updated?._id, action: 'updated' });

  res.json({ success: true, message: 'Company profile updated.', data: updated });
});

const updateProfileSchema = companyFieldsSchema.extend({
  name: z.string().min(2).max(120).optional(),
  designation: z.string().min(2).max(120).optional(),
  companyId: z.string().optional(),
});

router.put('/profile', requireAuth, requireRole('recruiter'), async (req: AuthenticatedRequest, res) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid profile input' });
  }

  const d = parsed.data;
  if (d.website && !isSafeHttpUrl(d.website)) {
    return res.status(400).json({ success: false, message: 'Website must be a valid http(s) URL.' });
  }

  if (d.name) {
    await db.updateUser(req.user!._id, { name: d.name.trim() });
  }

  const recProfile = await db.getRecruiterProfile(req.user!._id);
  if (!recProfile) {
    return res.status(404).json({ success: false, message: 'Recruiter profile missing.' });
  }

  const targetCompanyId = d.companyId || recProfile.companyId;
  const targetCompany = targetCompanyId ? await db.findCompanyById(targetCompanyId) : null;

  await db.updateRecruiterProfile(req.user!._id, {
    ...(d.designation ? { designation: d.designation.trim() } : {}),
    ...(d.companyName && targetCompanyId === recProfile.companyId ? { companyName: d.companyName.trim() } : {}),
  });

  let updatedCompany = null;
  if (targetCompany && isOwnedByRecruiter(targetCompany, req.user!._id, recProfile.companyId)) {
    updatedCompany = await db.updateCompany(targetCompany._id, {
      ...(d.companyName ? { name: d.companyName.trim() } : {}),
      ...(d.industry !== undefined ? { industry: d.industry } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
      ...(d.website !== undefined ? { website: d.website } : {}),
      ...(d.size !== undefined ? { size: d.size } : {}),
      ...(d.headquarters !== undefined ? { headquarters: d.headquarters } : {}),
      ...(d.contactEmail !== undefined ? { contactEmail: d.contactEmail } : {}),
      ...(d.contactPhone !== undefined ? { contactPhone: d.contactPhone } : {}),
      ...(d.socialLinks
        ? {
            socialLinks: {
              linkedin: d.socialLinks.linkedin || '',
              twitter: d.socialLinks.twitter || '',
            },
          }
        : {}),
    });
  }

  emitUserEvent(req.user!._id, 'companies:updated', { companyId: updatedCompany?._id, action: 'updated' });

  res.json({
    success: true,
    message: 'Recruiter & Company profile updated.',
    data: {
      recruiterProfile: await db.getRecruiterProfile(req.user!._id),
      company: updatedCompany,
      companies: await getOwnedCompanies(req.user!._id, recProfile.companyId),
    },
  });
});

async function handleCompanyAssetUpload(
  req: AuthenticatedRequest,
  companyId: string,
  kind: 'logo' | 'banner'
) {
  const recProfile = await db.getRecruiterProfile(req.user!._id);
  const company = await db.findCompanyById(companyId);
  if (!isOwnedByRecruiter(company, req.user!._id, recProfile?.companyId)) {
    return { status: 403, message: 'You do not have permission to update this company.' };
  }
  const uploaded = await uploadOptimizedImage(
    req.file!.buffer,
    kind === 'logo' ? 'logos' : 'banners',
    kind === 'logo' ? 400 : 1400
  );
  const prevPublicId = kind === 'logo' ? company!.logoPublicId : company!.bannerPublicId;
  if (prevPublicId) {
    await deleteStoredAsset(prevPublicId, 'image');
  }
  const updated = await db.updateCompany(
    company!._id,
    kind === 'logo'
      ? { logoUrl: uploaded.url, logoPublicId: uploaded.publicId }
      : { bannerUrl: uploaded.url, bannerPublicId: uploaded.publicId }
  );
  emitUserEvent(req.user!._id, 'companies:updated', { companyId: company!._id, action: 'asset_updated' });
  return { status: 200, updated };
}

router.post(
  '/companies/:id/logo',
  requireAuth,
  requireRole('recruiter'),
  uploadImageMiddleware.single('image'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a logo image.' });
    }
    const result = await handleCompanyAssetUpload(req, String(req.params.id), 'logo');
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: 'Company logo updated.', data: result.updated });
  }
);

router.post(
  '/companies/:id/banner',
  requireAuth,
  requireRole('recruiter'),
  uploadImageMiddleware.single('image'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a banner image.' });
    }
    const result = await handleCompanyAssetUpload(req, String(req.params.id), 'banner');
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: 'Company banner updated.', data: result.updated });
  }
);

router.post(
  '/company/logo',
  requireAuth,
  requireRole('recruiter'),
  uploadImageMiddleware.single('image'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a logo image.' });
    }
    const recProfile = await db.getRecruiterProfile(req.user!._id);
    const targetId = String(req.query.companyId || recProfile?.companyId || '');
    if (!targetId) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    const result = await handleCompanyAssetUpload(req, targetId, 'logo');
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: 'Company logo updated.', data: result.updated });
  }
);

router.post(
  '/company/banner',
  requireAuth,
  requireRole('recruiter'),
  uploadImageMiddleware.single('image'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a banner image.' });
    }
    const recProfile = await db.getRecruiterProfile(req.user!._id);
    const targetId = String(req.query.companyId || recProfile?.companyId || '');
    if (!targetId) {
      return res.status(404).json({ success: false, message: 'Company not found.' });
    }
    const result = await handleCompanyAssetUpload(req, targetId, 'banner');
    if (result.status !== 200) {
      return res.status(result.status).json({ success: false, message: result.message });
    }
    res.json({ success: true, message: 'Company banner updated.', data: result.updated });
  }
);

export default router;
