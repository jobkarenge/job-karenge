import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole, type AuthenticatedRequest } from '../middleware/authMiddleware.ts';
import { uploadImageMiddleware, uploadPdfMiddleware } from '../middleware/uploadMiddleware.ts';
import {
  deleteStoredAsset,
  uploadCompressedResumePdf,
  uploadOptimizedImage,
} from '../services/cloudinaryService.ts';
import { db } from '../store/dataLayer.ts';
import type { CandidateProfileRecord } from '../types/domain.ts';
import { isSafeHttpUrl, sanitizeUser } from '../utils/sanitize.ts';

const router = Router();

function calculateCompletion(user: { name: string; phone: string; profileImage: string }, p: CandidateProfileRecord): number {
  let score = 0;
  if (user.name) score += 10;
  if (user.phone) score += 5;
  if (user.profileImage) score += 5;
  if (p.headline && p.objective) score += 15;
  if (p.currentLocation) score += 5;
  if (p.education.length > 0) score += 15;
  if (p.experience.length > 0) score += 15;
  if (p.technicalSkills.length > 0) score += 10;
  if (p.projects.length > 0 || p.certifications.length > 0) score += 5;
  if (p.socialLinks.linkedin || p.socialLinks.github || p.socialLinks.portfolio) score += 5;
  if (p.resumeUrl) score += 10;
  return Math.min(100, score);
}

router.get('/dashboard', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const userId = req.user!._id;
  const [applications, saved, interviews, allJobs, companies, profile] = await Promise.all([
    db.listApplications(),
    db.listSavedJobs(userId),
    db.listInterviews(),
    db.listJobs(),
    db.listCompanies(),
    db.getCandidateProfile(userId),
  ]);

  const myApps = applications.filter((a) => a.candidateId === userId);
  const jobMap = new Map(allJobs.map((j) => [j._id, j]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));

  const stats = {
    totalApplications: myApps.length,
    underReview: myApps.filter((a) => a.status === 'Applied').length,
    shortlisted: myApps.filter((a) => a.status === 'Shortlisted').length,
    interviewScheduled: myApps.filter((a) => a.status === 'Interview Scheduled').length,
    selected: myApps.filter((a) => a.status === 'Selected').length,
    rejected: myApps.filter((a) => a.status === 'Rejected').length,
    savedJobs: saved.length,
  };

  const recentApplications = myApps.slice(0, 5).map((a) => ({
    ...a,
    job: jobMap.get(a.jobId) || null,
    company: companyMap.get(a.companyId) || null,
  }));

  const upcomingInterviews = interviews
    .filter((i) => i.candidateId === userId && (i.status === 'Scheduled' || i.status === 'Rescheduled'))
    .slice(0, 5)
    .map((i) => ({ ...i, job: jobMap.get(i.jobId) || null }));

  const candidateSkills = new Set((profile?.technicalSkills || []).map((s) => s.name.toLowerCase()));
  const appliedIds = new Set(myApps.map((a) => a.jobId));
  const now = Date.now();
  const recommendedJobs = allJobs
    .filter(
      (j) =>
        j.status === 'published' &&
        (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now) &&
        !appliedIds.has(j._id)
    )
    .sort((a, b) => {
      const overlapA = a.skills.filter((s) => candidateSkills.has(s.toLowerCase())).length;
      const overlapB = b.skills.filter((s) => candidateSkills.has(s.toLowerCase())).length;
      return overlapB - overlapA || Number(b.featured) - Number(a.featured);
    })
    .slice(0, 4)
    .map((j) => ({ ...j, company: companyMap.get(j.companyId) || null }));

  res.json({
    success: true,
    data: {
      stats,
      completionPercentage: profile?.completionPercentage || 15,
      recentApplications,
      upcomingInterviews,
      recommendedJobs,
    },
  });
});

router.get('/profile', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const profile = await db.upsertCandidateProfile(req.user!._id, {});
  res.json({
    success: true,
    data: {
      user: sanitizeUser(req.user!),
      profile,
    },
  });
});

const profileUpdateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  phone: z.string().max(24).optional(),
  location: z.string().max(120).optional(),
  headline: z.string().max(160).optional(),
  designation: z.string().max(120).optional(),
  objective: z.string().max(2000).optional(),
  totalExperienceYears: z.coerce.number().min(0).max(50).optional(),
  expectedSalary: z.string().max(80).optional(),
  dob: z.string().max(30).optional(),
  gender: z.string().max(30).optional(),
  currentLocation: z.string().max(120).optional(),
  address: z.string().max(300).optional(),
  education: z.array(z.any()).optional(),
  experience: z.array(z.any()).optional(),
  technicalSkills: z.array(z.object({ name: z.string(), proficiency: z.string() })).optional(),
  softSkills: z.array(z.string()).optional(),
  projects: z.array(z.any()).optional(),
  certifications: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  socialLinks: z
    .object({
      linkedin: z.string().optional(),
      github: z.string().optional(),
      portfolio: z.string().optional(),
      website: z.string().optional(),
    })
    .optional(),
});

router.put('/profile', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid profile data' });
  }

  const { name, phone, location, socialLinks, ...profileFields } = parsed.data;
  if (socialLinks) {
    for (const val of Object.values(socialLinks)) {
      if (val && !isSafeHttpUrl(val)) {
        return res.status(400).json({ success: false, message: 'Social links must use valid http(s) URLs.' });
      }
    }
  }

  let updatedUser = req.user!;
  if (name !== undefined || phone !== undefined || location !== undefined) {
    updatedUser = (await db.updateUser(req.user!._id, {
      ...(name !== undefined ? { name: name.trim() } : {}),
      ...(phone !== undefined ? { phone: phone.trim() } : {}),
      ...(location !== undefined ? { location: location.trim() } : {}),
    }))!;
  }

  const mergedPatch: Partial<CandidateProfileRecord> = {
    ...profileFields,
    ...(socialLinks
      ? {
          socialLinks: {
            linkedin: socialLinks.linkedin || '',
            github: socialLinks.github || '',
            portfolio: socialLinks.portfolio || '',
            website: socialLinks.website || '',
          },
        }
      : {}),
  };

  const updatedProfile = await db.upsertCandidateProfile(req.user!._id, mergedPatch);
  const completionPercentage = calculateCompletion(updatedUser, updatedProfile);
  const finalProfile = await db.upsertCandidateProfile(req.user!._id, { completionPercentage });

  res.json({
    success: true,
    message: 'Candidate profile saved.',
    data: { user: sanitizeUser(updatedUser), profile: finalProfile },
  });
});

router.post(
  '/photo',
  requireAuth,
  requireRole('candidate'),
  uploadImageMiddleware.single('photo'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please select an image file (JPEG, PNG, or WebP).' });
    }
    try {
      const uploaded = await uploadOptimizedImage(req.file.buffer, 'profiles', 480);
      if (req.user!.profileImagePublicId) {
        await deleteStoredAsset(req.user!.profileImagePublicId, 'image');
      }
      const updated = await db.updateUser(req.user!._id, {
        profileImage: uploaded.url,
        profileImagePublicId: uploaded.publicId,
      });
      res.json({ success: true, message: 'Profile photo updated.', data: { user: sanitizeUser(updated!) } });
    } catch (err) {
      res.status(400).json({ success: false, message: err instanceof Error ? err.message : 'Image upload failed' });
    }
  }
);

router.post(
  '/resume',
  requireAuth,
  requireRole('candidate'),
  uploadPdfMiddleware.single('resume'),
  async (req: AuthenticatedRequest, res) => {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please attach a PDF resume file.' });
    }

    try {
      const currentProfile = await db.upsertCandidateProfile(req.user!._id, {});
      const uploaded = await uploadCompressedResumePdf(req.file.buffer, req.file.mimetype, req.user!._id);
      if (currentProfile.resumePublicId) {
        await deleteStoredAsset(currentProfile.resumePublicId, 'raw');
      }

      const updatedProfile = await db.upsertCandidateProfile(req.user!._id, {
        resumeUrl: uploaded.url,
        resumePublicId: uploaded.publicId,
        resumeFileName: req.file.originalname,
        resumeSizeBytes: uploaded.sizeBytes,
        resumeUploadedAt: new Date().toISOString(),
      });

      const completionPercentage = calculateCompletion(req.user!, updatedProfile);
      const finalProfile = await db.upsertCandidateProfile(req.user!._id, { completionPercentage });

      res.json({
        success: true,
        message: `Resume verified & uploaded (${(uploaded.sizeBytes / 1024).toFixed(0)} KB).`,
        data: { profile: finalProfile, sizeBytes: uploaded.sizeBytes },
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: err instanceof Error ? err.message : 'Resume compression or upload failed.',
      });
    }
  }
);

router.delete('/resume', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const profile = await db.getCandidateProfile(req.user!._id);
  if (profile?.resumePublicId) {
    await deleteStoredAsset(profile.resumePublicId, 'raw');
  }
  const updated = await db.upsertCandidateProfile(req.user!._id, {
    resumeUrl: '',
    resumePublicId: '',
    resumeFileName: '',
    resumeSizeBytes: 0,
    resumeUploadedAt: undefined,
  });
  const completionPercentage = calculateCompletion(req.user!, updated);
  const finalProfile = await db.upsertCandidateProfile(req.user!._id, { completionPercentage });
  res.json({ success: true, message: 'Resume removed.', data: { profile: finalProfile } });
});

router.get('/saved-jobs', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const [saved, jobs, companies] = await Promise.all([
    db.listSavedJobs(req.user!._id),
    db.listJobs(),
    db.listCompanies(),
  ]);
  const jobMap = new Map(jobs.map((j) => [j._id, j]));
  const companyMap = new Map(companies.map((c) => [c._id, c]));

  const items = saved
    .map((s) => {
      const job = jobMap.get(s.jobId);
      if (!job) return null;
      return { ...s, job: { ...job, company: companyMap.get(job.companyId) || null } };
    })
    .filter(Boolean);

  res.json({ success: true, data: items });
});

router.post('/saved-jobs/:jobId', requireAuth, requireRole('candidate'), async (req: AuthenticatedRequest, res) => {
  const job = await db.findJobById(String(req.params.jobId));
  if (!job) {
    return res.status(404).json({ success: false, message: 'Job not found' });
  }
  const result = await db.toggleSavedJob(req.user!._id, job._id);
  res.json({
    success: true,
    message: result.saved ? 'Job saved to your bookmarks.' : 'Job removed from bookmarks.',
    data: result,
  });
});

router.get('/public-profile/:candidateId', async (req, res) => {
  const user = await db.findUserById(req.params.candidateId);
  if (!user || user.role !== 'candidate') {
    return res.status(404).json({ success: false, message: 'Candidate profile not found' });
  }
  const profile = await db.getCandidateProfile(user._id);
  res.json({
    success: true,
    data: {
      candidate: {
        _id: user._id,
        name: user.name,
        profileImage: user.profileImage,
        location: user.location,
      },
      profile: profile
        ? {
            headline: profile.headline,
            designation: profile.designation,
            objective: profile.objective,
            totalExperienceYears: profile.totalExperienceYears,
            currentLocation: profile.currentLocation,
            education: profile.education,
            experience: profile.experience,
            technicalSkills: profile.technicalSkills,
            softSkills: profile.softSkills,
            projects: profile.projects,
            certifications: profile.certifications,
            languages: profile.languages,
            socialLinks: profile.socialLinks,
          }
        : null,
    },
  });
});

export default router;
