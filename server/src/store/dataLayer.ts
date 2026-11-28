import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { isMongoConnected } from '../config/db.ts';
import { Models } from '../models/index.ts';
import { appCache } from '../services/cacheService.ts';
import type {
  ApplicationRecord,
  AuditLogRecord,
  CandidateProfileRecord,
  CompanyRecord,
  ContactMessageRecord,
  EmailCampaignRecord,
  EmailLogRecord,
  EmailPreferenceRecord,
  InterviewRecord,
  JobCategoryRecord,
  JobRecord,
  NewsletterRecord,
  NotificationRecord,
  PlatformSettingsRecord,
  RecruiterProfileRecord,
  RefreshTokenRecord,
  SavedJobRecord,
  UserRecord,
} from '../types/domain.ts';

interface StoreState {
  users: UserRecord[];
  candidateProfiles: CandidateProfileRecord[];
  recruiterProfiles: RecruiterProfileRecord[];
  companies: CompanyRecord[];
  jobs: JobRecord[];
  applications: ApplicationRecord[];
  savedJobs: SavedJobRecord[];
  interviews: InterviewRecord[];
  notifications: NotificationRecord[];
  emailPreferences: EmailPreferenceRecord[];
  emailCampaigns: EmailCampaignRecord[];
  emailLogs: EmailLogRecord[];
  jobCategories: JobCategoryRecord[];
  contactMessages: ContactMessageRecord[];
  auditLogs: AuditLogRecord[];
  refreshTokens: RefreshTokenRecord[];
  newsletterSubscribers: NewsletterRecord[];
  platformSettings: PlatformSettingsRecord;
}

const DATA_DIR = path.resolve(process.cwd(), '.data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');

export function newId(): string {
  return crypto.randomBytes(12).toString('hex');
}

function nowIso(): string {
  return new Date().toISOString();
}

const JOB_LIST_OMIT =
  '-responsibilities -requiredQualifications -preferredQualifications -benefits -applicationInstructions -contactPerson -contactEmail -contactPhone';
const USER_SAFE_OMIT = '-passwordHash -verificationToken -resetTokenHash -resetTokenExpires';

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isObjectIdLike(id: string): boolean {
  return /^[a-f0-9]{24}$/i.test(id);
}

function buildActiveJobMongoFilter(now = new Date()): Record<string, unknown> {
  return {
    status: 'published',
    $or: [
      { applicationDeadline: null },
      { applicationDeadline: { $exists: false } },
      { applicationDeadline: { $gte: now } },
    ],
  };
}

function mapJobDoc(d: Record<string, unknown>): JobRecord {
  return {
    ...(d as unknown as JobRecord),
    _id: String(d._id),
    recruiterId: String(d.recruiterId),
    companyId: String(d.companyId),
    skills: Array.isArray(d.skills) ? (d.skills as string[]) : [],
    responsibilities: Array.isArray(d.responsibilities) ? (d.responsibilities as string[]) : [],
    requiredQualifications: Array.isArray(d.requiredQualifications) ? (d.requiredQualifications as string[]) : [],
    preferredQualifications: Array.isArray(d.preferredQualifications) ? (d.preferredQualifications as string[]) : [],
    benefits: Array.isArray(d.benefits) ? (d.benefits as string[]) : [],
    applicationDeadline: d.applicationDeadline ? new Date(String(d.applicationDeadline)).toISOString() : null,
    createdAt: new Date(String(d.createdAt || nowIso())).toISOString(),
    updatedAt: new Date(String(d.updatedAt || nowIso())).toISOString(),
  };
}

function mapCompanyDoc(d: Record<string, unknown>): CompanyRecord {
  return {
    ...(d as unknown as CompanyRecord),
    _id: String(d._id),
    ...(d.ownerRecruiterId ? { ownerRecruiterId: String(d.ownerRecruiterId) } : { ownerRecruiterId: undefined }),
  };
}

function mapAppDoc(d: Record<string, unknown>): ApplicationRecord {
  return {
    ...(d as unknown as ApplicationRecord),
    _id: String(d._id),
    candidateId: String(d.candidateId),
    jobId: String(d.jobId),
    recruiterId: String(d.recruiterId),
    companyId: String(d.companyId),
  };
}

function futureIso(days: number): string {
  return new Date(Date.now() + days * 86400_000).toISOString();
}

function pastIso(days: number): string {
  return new Date(Date.now() - days * 86400_000).toISOString();
}

const LEGACY_SEED_COMPANY_SLUGS = new Set([
  'narmada-cloud-systems',
  'kaveri-paytech',
  'aravalli-health-labs',
  'vindhya-logistics-grid',
  'sahyadri-design-collective',
]);

const LEGACY_SEED_JOB_SLUGS = new Set([
  'senior-full-stack-engineer-narmada-cloud',
  'staff-product-designer-kaveri-paytech',
  'lead-data-engineer-aravalli-health',
  'site-reliability-engineer-vindhya-logistics',
  'frontend-engineer-react-motion-sahyadri',
  'application-security-engineer-kaveri-paytech',
  'growth-lifecycle-marketing-narmada',
  'enterprise-account-executive-aravalli',
]);

function createInitialSeed(): StoreState {
  const categories: JobCategoryRecord[] = [
    { _id: newId(), name: 'Software Engineering', slug: 'software-engineering', description: 'Full-stack, backend, mobile, and distributed systems roles.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Product & Design', slug: 'product-design', description: 'Product management, UX research, and interface design.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Data & Analytics', slug: 'data-analytics', description: 'Data engineering, BI analytics, and quantitative research.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Cloud & DevOps', slug: 'cloud-devops', description: 'SRE, Kubernetes infrastructure, and platform reliability.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Marketing & Growth', slug: 'marketing-growth', description: 'Performance marketing, lifecycle CRM, and brand strategy.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Finance & Operations', slug: 'finance-operations', description: 'FP&A, compliance, people operations, and strategy.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Sales & Partnerships', slug: 'sales-partnerships', description: 'Enterprise AE, solutions consulting, and customer success.', active: true, createdAt: pastIso(60) },
    { _id: newId(), name: 'Cybersecurity', slug: 'cybersecurity', description: 'AppSec, cloud security architecture, and compliance.', active: true, createdAt: pastIso(60) },
  ];

  return {
    users: [],
    candidateProfiles: [],
    recruiterProfiles: [],
    companies: [],
    jobs: [],
    applications: [],
    savedJobs: [],
    interviews: [],
    notifications: [],
    emailPreferences: [],
    emailCampaigns: [],
    emailLogs: [],
    jobCategories: categories,
    contactMessages: [],
    auditLogs: [],
    refreshTokens: [],
    newsletterSubscribers: [],
    platformSettings: {
      requireRecruiterApproval: true,
      autoExpireJobs: true,
      maxPdfSizeBytes: 1024 * 1024,
      promotionalDigestEnabled: true,
      supportEmail: 'support@jobkarenge.com',
      emailFromEmail: '',
      emailFromName: '',
      clientUrl: '',
      serverUrl: '',
      socialLinks: {
        linkedin: '',
        twitter: '',
        instagram: '',
        facebook: '',
        youtube: '',
        github: '',
      },
      schedulerState: {
        lastDailyDigestKey: '',
        lastWeeklyDigestKey: '',
        notifiedJobIds: [],
        lastRunAt: '',
      },
    },
  };
}

let memoryStore: StoreState | null = null;
let cachedPlatformSettings: PlatformSettingsRecord | null = null;

function purgeLegacySeedRecords(state: StoreState): boolean {
  let changed = false;
  const recruiterCompanyIds = new Set(state.recruiterProfiles.map((r) => r.companyId));
  const seedCompanyIds = new Set(
    state.companies
      .filter((c) => LEGACY_SEED_COMPANY_SLUGS.has(c.slug) && !c.ownerRecruiterId && !recruiterCompanyIds.has(c._id))
      .map((c) => c._id)
  );

  const beforeJobs = state.jobs.length;
  state.jobs = state.jobs.filter(
    (j) =>
      j.recruiterId !== 'system-catalog' &&
      !seedCompanyIds.has(j.companyId) &&
      !LEGACY_SEED_JOB_SLUGS.has(j.slug)
  );
  if (state.jobs.length !== beforeJobs) changed = true;

  const activeCompanyIds = new Set([
    ...recruiterCompanyIds,
    ...state.jobs.map((j) => j.companyId),
  ]);
  const beforeCompanies = state.companies.length;
  state.companies = state.companies.filter(
    (c) => !LEGACY_SEED_COMPANY_SLUGS.has(c.slug) || activeCompanyIds.has(c._id)
  );
  if (state.companies.length !== beforeCompanies) changed = true;

  return changed;
}

function ensureStoreLoaded(): StoreState {
  if (memoryStore) return memoryStore;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (fs.existsSync(STORE_PATH)) {
    try {
      const raw = fs.readFileSync(STORE_PATH, 'utf-8');
      memoryStore = JSON.parse(raw) as StoreState;
      if (purgeLegacySeedRecords(memoryStore)) {
        persistStore();
      }
      return memoryStore;
    } catch {
      // Fall back to fresh seed if file was corrupted
    }
  }
  memoryStore = createInitialSeed();
  persistStore();
  return memoryStore;
}

function persistStore(): void {
  if (!memoryStore) return;
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  const tmpPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(memoryStore, null, 2), 'utf-8');
  fs.renameSync(tmpPath, STORE_PATH);
}

export async function ensureSeededDatabase(): Promise<void> {
  if (isMongoConnected()) {
    const catCount = await Models.JobCategory.countDocuments();
    if (catCount === 0) {
      const seed = createInitialSeed();
      await Models.JobCategory.insertMany(seed.jobCategories.map(({ _id, ...rest }) => rest));
    }

    // Remove legacy pre-seeded sample companies & jobs without touching real recruiter records
    const legacyCompanies = await Models.Company.find({
      slug: { $in: [...LEGACY_SEED_COMPANY_SLUGS] },
    }).lean();

    const candidateCompanyIds = legacyCompanies.map((c) => c._id);
    const linkedProfiles = candidateCompanyIds.length
      ? await Models.RecruiterProfile.find({ companyId: { $in: candidateCompanyIds } }).lean()
      : [];
    const linkedCompanyIdSet = new Set(linkedProfiles.map((p) => String(p.companyId)));

    const unownedSeedCompanyIds = legacyCompanies
      .filter((c) => !c.ownerRecruiterId && !linkedCompanyIdSet.has(String(c._id)))
      .map((c) => c._id);

    const legacyJobs = await Models.Job.find({
      $or: [
        ...(unownedSeedCompanyIds.length > 0 ? [{ companyId: { $in: unownedSeedCompanyIds } }] : []),
        { slug: { $in: [...LEGACY_SEED_JOB_SLUGS] } },
      ],
    }).lean();

    if (legacyJobs.length > 0) {
      const jobRecruiterIds = [...new Set(legacyJobs.map((j) => j.recruiterId))];
      const realRecruiters = await Models.User.find({ _id: { $in: jobRecruiterIds } })
        .select('_id')
        .lean();
      const realUserIds = new Set(realRecruiters.map((u) => String(u._id)));

      const seedJobIdsToDelete = legacyJobs
        .filter((j) => !realUserIds.has(String(j.recruiterId)))
        .map((j) => j._id);

      if (seedJobIdsToDelete.length > 0) {
        await Models.SavedJob.deleteMany({ jobId: { $in: seedJobIdsToDelete } });
        await Models.Job.deleteMany({ _id: { $in: seedJobIdsToDelete } });
      }
    }

    if (unownedSeedCompanyIds.length > 0) {
      const remainingCompanyJobs = await Models.Job.find({
        companyId: { $in: unownedSeedCompanyIds },
      })
        .select('companyId')
        .lean();
      const stillReferencedCompanyIds = new Set(
        remainingCompanyJobs.map((j) => String(j.companyId))
      );
      const companyIdsToDelete = unownedSeedCompanyIds.filter(
        (id) => !stillReferencedCompanyIds.has(String(id))
      );
      if (companyIdsToDelete.length > 0) {
        await Models.Company.deleteMany({ _id: { $in: companyIdsToDelete } });
      }
    }

    const defaults = createInitialSeed().platformSettings;
    let settingsDoc = await Models.PlatformSetting.findOne({ key: 'global' }).lean();
    if (!settingsDoc) {
      const created = await Models.PlatformSetting.create({ key: 'global', ...defaults });
      settingsDoc = created.toObject();
    }
    cachedPlatformSettings = {
      requireRecruiterApproval: settingsDoc.requireRecruiterApproval ?? defaults.requireRecruiterApproval,
      autoExpireJobs: settingsDoc.autoExpireJobs ?? defaults.autoExpireJobs,
      maxPdfSizeBytes: settingsDoc.maxPdfSizeBytes ?? defaults.maxPdfSizeBytes,
      promotionalDigestEnabled: settingsDoc.promotionalDigestEnabled ?? defaults.promotionalDigestEnabled,
      supportEmail: settingsDoc.supportEmail || defaults.supportEmail,
      emailFromEmail: settingsDoc.emailFromEmail || settingsDoc.brevoSenderEmail || '',
      emailFromName: settingsDoc.emailFromName || settingsDoc.brevoSenderName || '',
      clientUrl: settingsDoc.clientUrl || '',
      serverUrl: settingsDoc.serverUrl || '',
      socialLinks: {
        linkedin: settingsDoc.socialLinks?.linkedin || '',
        twitter: settingsDoc.socialLinks?.twitter || '',
        instagram: settingsDoc.socialLinks?.instagram || '',
        facebook: settingsDoc.socialLinks?.facebook || '',
        youtube: settingsDoc.socialLinks?.youtube || '',
        github: settingsDoc.socialLinks?.github || '',
      },
      schedulerState: {
        lastDailyDigestKey: settingsDoc.schedulerState?.lastDailyDigestKey || '',
        lastWeeklyDigestKey: settingsDoc.schedulerState?.lastWeeklyDigestKey || '',
        notifiedJobIds: Array.isArray(settingsDoc.schedulerState?.notifiedJobIds)
          ? settingsDoc.schedulerState.notifiedJobIds
          : [],
        lastRunAt: settingsDoc.schedulerState?.lastRunAt
          ? new Date(settingsDoc.schedulerState.lastRunAt).toISOString()
          : '',
      },
    };
  } else {
    ensureStoreLoaded();
  }
}

export const db = {
  isMongo: () => isMongoConnected(),
  now: nowIso,
  newId,

  getState(): StoreState {
    return ensureStoreLoaded();
  },

  saveState(): void {
    persistStore();
  },

  async findUserByEmail(email: string): Promise<UserRecord | null> {
    const normalized = email.trim().toLowerCase();
    if (isMongoConnected()) {
      const doc = await Models.User.findOne({ email: normalized }).lean();
      return doc ? { ...(doc as unknown as UserRecord), _id: String(doc._id) } : null;
    }
    return this.getState().users.find((u) => u.email.toLowerCase() === normalized) || null;
  },

  async findUserById(id: string): Promise<UserRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.User.findById(id).lean();
      return doc ? { ...(doc as unknown as UserRecord), _id: String(doc._id) } : null;
    }
    return this.getState().users.find((u) => u._id === id) || null;
  },

  async countAdmins(): Promise<number> {
    if (isMongoConnected()) {
      return Models.User.countDocuments({ role: 'admin' });
    }
    return this.getState().users.filter((u) => u.role === 'admin').length;
  },

  async listUsers(): Promise<UserRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.User.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => ({ ...(d as unknown as UserRecord), _id: String(d._id) }));
    }
    return [...this.getState().users].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  },

  async createUser(data: Omit<UserRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<UserRecord> {
    appCache.invalidatePrefix('public:stats');
    if (isMongoConnected()) {
      const created = await Models.User.create(data);
      return { ...(created.toObject() as unknown as UserRecord), _id: String(created._id) };
    }
    const state = this.getState();
    const record: UserRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.users.push(record);
    this.saveState();
    return record;
  },

  async updateUser(id: string, patch: Partial<UserRecord>): Promise<UserRecord | null> {
    if (isMongoConnected()) {
      const updated = await Models.User.findByIdAndUpdate(id, patch, { new: true }).lean();
      return updated ? { ...(updated as unknown as UserRecord), _id: String(updated._id) } : null;
    }
    const state = this.getState();
    const idx = state.users.findIndex((u) => u._id === id);
    if (idx === -1) return null;
    state.users[idx] = { ...state.users[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.users[idx];
  },

  // Candidate Profiles
  async getCandidateProfile(userId: string): Promise<CandidateProfileRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.CandidateProfile.findOne({ userId }).lean();
      return doc ? { ...(doc as unknown as CandidateProfileRecord), _id: String(doc._id), userId: String(doc.userId) } : null;
    }
    return this.getState().candidateProfiles.find((p) => p.userId === userId) || null;
  },

  async upsertCandidateProfile(userId: string, patch: Partial<CandidateProfileRecord>): Promise<CandidateProfileRecord> {
    if (isMongoConnected()) {
      const doc = await Models.CandidateProfile.findOneAndUpdate(
        { userId },
        { $set: patch, $setOnInsert: { userId } },
        { upsert: true, new: true }
      ).lean();
      return { ...(doc as unknown as CandidateProfileRecord), _id: String(doc._id), userId: String(doc.userId) };
    }
    const state = this.getState();
    const idx = state.candidateProfiles.findIndex((p) => p.userId === userId);
    if (idx === -1) {
      const created: CandidateProfileRecord = {
        _id: newId(),
        userId,
        headline: '',
        designation: '',
        objective: '',
        totalExperienceYears: 0,
        expectedSalary: '',
        dob: '',
        gender: '',
        currentLocation: '',
        address: '',
        education: [],
        experience: [],
        technicalSkills: [],
        softSkills: [],
        projects: [],
        certifications: [],
        languages: [],
        socialLinks: { linkedin: '', github: '', portfolio: '', website: '' },
        resumeUrl: '',
        resumePublicId: '',
        resumeFileName: '',
        resumeSizeBytes: 0,
        completionPercentage: 15,
        ...patch,
        updatedAt: nowIso(),
      };
      state.candidateProfiles.push(created);
      this.saveState();
      return created;
    }
    state.candidateProfiles[idx] = { ...state.candidateProfiles[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.candidateProfiles[idx];
  },

  // Recruiter Profiles
  async getRecruiterProfile(userId: string): Promise<RecruiterProfileRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.RecruiterProfile.findOne({ userId }).lean();
      return doc
        ? {
            ...(doc as unknown as RecruiterProfileRecord),
            _id: String(doc._id),
            userId: String(doc.userId),
            companyId: String(doc.companyId || ''),
          }
        : null;
    }
    return this.getState().recruiterProfiles.find((p) => p.userId === userId) || null;
  },

  async listRecruiterProfiles(): Promise<RecruiterProfileRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.RecruiterProfile.find().lean();
      return docs.map((d) => ({
        ...(d as unknown as RecruiterProfileRecord),
        _id: String(d._id),
        userId: String(d.userId),
        companyId: String(d.companyId || ''),
      }));
    }
    return [...this.getState().recruiterProfiles];
  },

  async createRecruiterProfile(data: Omit<RecruiterProfileRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<RecruiterProfileRecord> {
    if (isMongoConnected()) {
      const created = await Models.RecruiterProfile.create(data);
      const obj = created.toObject();
      return {
        ...(obj as unknown as RecruiterProfileRecord),
        _id: String(created._id),
        userId: String(obj.userId),
        companyId: String(obj.companyId || ''),
      };
    }
    const state = this.getState();
    const record: RecruiterProfileRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.recruiterProfiles.push(record);
    this.saveState();
    return record;
  },

  async updateRecruiterProfile(userId: string, patch: Partial<RecruiterProfileRecord>): Promise<RecruiterProfileRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.RecruiterProfile.findOneAndUpdate({ userId }, patch, { new: true }).lean();
      return doc
        ? {
            ...(doc as unknown as RecruiterProfileRecord),
            _id: String(doc._id),
            userId: String(doc.userId),
            companyId: String(doc.companyId || ''),
          }
        : null;
    }
    const state = this.getState();
    const idx = state.recruiterProfiles.findIndex((r) => r.userId === userId);
    if (idx === -1) return null;
    state.recruiterProfiles[idx] = { ...state.recruiterProfiles[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.recruiterProfiles[idx];
  },

  // Companies
  async listCompanies(): Promise<CompanyRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Company.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => ({
        ...(d as unknown as CompanyRecord),
        _id: String(d._id),
        ...(d.ownerRecruiterId ? { ownerRecruiterId: String(d.ownerRecruiterId) } : { ownerRecruiterId: undefined }),
      }));
    }
    return [...this.getState().companies];
  },

  async findCompanyById(id: string): Promise<CompanyRecord | null> {
    if (isMongoConnected()) {
      const isOid = /^[a-f0-9]{24}$/i.test(id);
      const doc = isOid
        ? await Models.Company.findById(id).lean()
        : await Models.Company.findOne({ slug: id }).lean();
      return doc
        ? {
            ...(doc as unknown as CompanyRecord),
            _id: String(doc._id),
            ...(doc.ownerRecruiterId
              ? { ownerRecruiterId: String(doc.ownerRecruiterId) }
              : { ownerRecruiterId: undefined }),
          }
        : null;
    }
    return this.getState().companies.find((c) => c._id === id || c.slug === id) || null;
  },

  async createCompany(data: Omit<CompanyRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<CompanyRecord> {
    appCache.invalidateAllPublic();
    if (isMongoConnected()) {
      const created = await Models.Company.create(data);
      const obj = created.toObject();
      return {
        ...(obj as unknown as CompanyRecord),
        _id: String(created._id),
        ...(obj.ownerRecruiterId
          ? { ownerRecruiterId: String(obj.ownerRecruiterId) }
          : { ownerRecruiterId: undefined }),
      };
    }
    const state = this.getState();
    const record: CompanyRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.companies.push(record);
    this.saveState();
    return record;
  },

  async updateCompany(id: string, patch: Partial<CompanyRecord>): Promise<CompanyRecord | null> {
    appCache.invalidateAllPublic();
    if (isMongoConnected()) {
      const doc = await Models.Company.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc
        ? {
            ...(doc as unknown as CompanyRecord),
            _id: String(doc._id),
            ...(doc.ownerRecruiterId
              ? { ownerRecruiterId: String(doc.ownerRecruiterId) }
              : { ownerRecruiterId: undefined }),
          }
        : null;
    }
    const state = this.getState();
    const idx = state.companies.findIndex((c) => c._id === id);
    if (idx === -1) return null;
    state.companies[idx] = { ...state.companies[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.companies[idx];
  },

  // Jobs
  async listJobs(): Promise<JobRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Job.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => ({
        ...(d as unknown as JobRecord),
        _id: String(d._id),
        recruiterId: String(d.recruiterId),
        companyId: String(d.companyId),
        applicationDeadline: d.applicationDeadline ? new Date(d.applicationDeadline).toISOString() : null,
        createdAt: new Date(d.createdAt).toISOString(),
        updatedAt: new Date(d.updatedAt).toISOString(),
      }));
    }
    return [...this.getState().jobs];
  },

  async findJobById(id: string): Promise<JobRecord | null> {
    if (isMongoConnected()) {
      const doc = isObjectIdLike(id)
        ? await Models.Job.findById(id).lean()
        : await Models.Job.findOne({ slug: id }).lean();
      return doc ? mapJobDoc(doc as unknown as Record<string, unknown>) : null;
    }
    return this.getState().jobs.find((j) => j._id === id || j.slug === id) || null;
  },

  async createJob(data: Omit<JobRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<JobRecord> {
    appCache.invalidateAllPublic();
    if (isMongoConnected()) {
      const created = await Models.Job.create(data);
      const obj = created.toObject();
      return {
        ...(obj as unknown as JobRecord),
        _id: String(created._id),
        recruiterId: String(obj.recruiterId),
        companyId: String(obj.companyId),
        applicationDeadline: obj.applicationDeadline ? new Date(obj.applicationDeadline).toISOString() : null,
        createdAt: new Date(obj.createdAt).toISOString(),
        updatedAt: new Date(obj.updatedAt).toISOString(),
      };
    }
    const state = this.getState();
    const record: JobRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.jobs.unshift(record);
    this.saveState();
    return record;
  },

  async updateJob(id: string, patch: Partial<JobRecord>): Promise<JobRecord | null> {
    appCache.invalidateAllPublic();
    if (isMongoConnected()) {
      const doc = await Models.Job.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc
        ? {
            ...(doc as unknown as JobRecord),
            _id: String(doc._id),
            recruiterId: String(doc.recruiterId),
            companyId: String(doc.companyId),
            applicationDeadline: doc.applicationDeadline ? new Date(doc.applicationDeadline).toISOString() : null,
            createdAt: new Date(doc.createdAt).toISOString(),
            updatedAt: new Date(doc.updatedAt).toISOString(),
          }
        : null;
    }
    const state = this.getState();
    const idx = state.jobs.findIndex((j) => j._id === id);
    if (idx === -1) return null;
    state.jobs[idx] = { ...state.jobs[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.jobs[idx];
  },

  async deleteJob(id: string): Promise<boolean> {
    appCache.invalidateAllPublic();
    if (isMongoConnected()) {
      const res = await Models.Job.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = this.getState();
    const before = state.jobs.length;
    state.jobs = state.jobs.filter((j) => j._id !== id);
    this.saveState();
    return state.jobs.length < before;
  },

  // Applications
  async listApplications(): Promise<ApplicationRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Application.find().sort({ appliedAt: -1 }).maxTimeMS(15000).lean();
      return docs.map((d) => mapAppDoc(d as unknown as Record<string, unknown>));
    }
    return [...this.getState().applications];
  },

  async findApplicationById(id: string): Promise<ApplicationRecord | null> {
    if (isMongoConnected()) {
      const d = await Models.Application.findById(id).lean();
      return d
        ? {
            ...(d as unknown as ApplicationRecord),
            _id: String(d._id),
            candidateId: String(d.candidateId),
            jobId: String(d.jobId),
            recruiterId: String(d.recruiterId),
            companyId: String(d.companyId),
          }
        : null;
    }
    return this.getState().applications.find((a) => a._id === id) || null;
  },

  async findDuplicateApplication(candidateId: string, jobId: string): Promise<ApplicationRecord | null> {
    if (isMongoConnected()) {
      const d = await Models.Application.findOne({ candidateId, jobId }).lean();
      return d ? { ...(d as unknown as ApplicationRecord), _id: String(d._id) } : null;
    }
    return this.getState().applications.find((a) => a.candidateId === candidateId && a.jobId === jobId) || null;
  },

  async createApplication(data: Omit<ApplicationRecord, '_id' | 'updatedAt'>): Promise<ApplicationRecord> {
    appCache.invalidatePrefix('public:stats');
    if (isMongoConnected()) {
      const created = await Models.Application.create(data);
      const obj = created.toObject();
      return {
        ...(obj as unknown as ApplicationRecord),
        _id: String(created._id),
        candidateId: String(obj.candidateId),
        jobId: String(obj.jobId),
        recruiterId: String(obj.recruiterId),
        companyId: String(obj.companyId),
      };
    }
    const state = this.getState();
    const record: ApplicationRecord = { ...data, _id: newId(), updatedAt: nowIso() };
    state.applications.unshift(record);
    this.saveState();
    return record;
  },

  async updateApplication(id: string, patch: Partial<ApplicationRecord>): Promise<ApplicationRecord | null> {
    if (isMongoConnected()) {
      const d = await Models.Application.findByIdAndUpdate(id, patch, { new: true }).lean();
      return d
        ? {
            ...(d as unknown as ApplicationRecord),
            _id: String(d._id),
            candidateId: String(d.candidateId),
            jobId: String(d.jobId),
            recruiterId: String(d.recruiterId),
            companyId: String(d.companyId),
          }
        : null;
    }
    const state = this.getState();
    const idx = state.applications.findIndex((a) => a._id === id);
    if (idx === -1) return null;
    state.applications[idx] = { ...state.applications[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.applications[idx];
  },

  // Saved jobs
  async listSavedJobs(candidateId: string): Promise<SavedJobRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.SavedJob.find({ candidateId }).lean();
      return docs.map((d) => ({ ...(d as unknown as SavedJobRecord), _id: String(d._id), jobId: String(d.jobId), candidateId: String(d.candidateId) }));
    }
    return this.getState().savedJobs.filter((s) => s.candidateId === candidateId);
  },

  async toggleSavedJob(candidateId: string, jobId: string): Promise<{ saved: boolean }> {
    if (isMongoConnected()) {
      const existing = await Models.SavedJob.findOne({ candidateId, jobId });
      if (existing) {
        await Models.SavedJob.deleteOne({ _id: existing._id });
        return { saved: false };
      }
      await Models.SavedJob.create({ candidateId, jobId });
      return { saved: true };
    }
    const state = this.getState();
    const idx = state.savedJobs.findIndex((s) => s.candidateId === candidateId && s.jobId === jobId);
    if (idx !== -1) {
      state.savedJobs.splice(idx, 1);
      this.saveState();
      return { saved: false };
    }
    state.savedJobs.push({ _id: newId(), candidateId, jobId, createdAt: nowIso() });
    this.saveState();
    return { saved: true };
  },

  // Interviews
  async listInterviews(): Promise<InterviewRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Interview.find().sort({ date: 1, time: 1 }).lean();
      return docs.map((d) => ({
        ...(d as unknown as InterviewRecord),
        _id: String(d._id),
        applicationId: String(d.applicationId),
        jobId: String(d.jobId),
        candidateId: String(d.candidateId),
        recruiterId: String(d.recruiterId),
      }));
    }
    return [...this.getState().interviews];
  },

  async findInterviewById(id: string): Promise<InterviewRecord | null> {
    if (isMongoConnected()) {
      const d = await Models.Interview.findById(id).lean();
      return d
        ? {
            ...(d as unknown as InterviewRecord),
            _id: String(d._id),
            applicationId: String(d.applicationId),
            jobId: String(d.jobId),
            candidateId: String(d.candidateId),
            recruiterId: String(d.recruiterId),
          }
        : null;
    }
    return this.getState().interviews.find((i) => i._id === id) || null;
  },

  async createInterview(data: Omit<InterviewRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<InterviewRecord> {
    if (isMongoConnected()) {
      const created = await Models.Interview.create(data);
      const obj = created.toObject();
      return {
        ...(obj as unknown as InterviewRecord),
        _id: String(created._id),
        applicationId: String(obj.applicationId),
        jobId: String(obj.jobId),
        candidateId: String(obj.candidateId),
        recruiterId: String(obj.recruiterId),
      };
    }
    const state = this.getState();
    const record: InterviewRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.interviews.unshift(record);
    this.saveState();
    return record;
  },

  async updateInterview(id: string, patch: Partial<InterviewRecord>): Promise<InterviewRecord | null> {
    if (isMongoConnected()) {
      const d = await Models.Interview.findByIdAndUpdate(id, patch, { new: true }).lean();
      return d
        ? {
            ...(d as unknown as InterviewRecord),
            _id: String(d._id),
            applicationId: String(d.applicationId),
            jobId: String(d.jobId),
            candidateId: String(d.candidateId),
            recruiterId: String(d.recruiterId),
          }
        : null;
    }
    const state = this.getState();
    const idx = state.interviews.findIndex((i) => i._id === id);
    if (idx === -1) return null;
    state.interviews[idx] = { ...state.interviews[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.interviews[idx];
  },

  // Notifications
  async listNotifications(userId: string): Promise<NotificationRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Notification.find({ userId }).sort({ createdAt: -1 }).limit(50).lean();
      return docs.map((d) => ({ ...(d as unknown as NotificationRecord), _id: String(d._id), userId: String(d.userId) }));
    }
    return this.getState().notifications.filter((n) => n.userId === userId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 50);
  },

  async createNotification(data: Omit<NotificationRecord, '_id' | 'createdAt'>): Promise<NotificationRecord> {
    if (isMongoConnected()) {
      const created = await Models.Notification.create(data);
      return { ...(created.toObject() as unknown as NotificationRecord), _id: String(created._id), userId: String(created.userId) };
    }
    const state = this.getState();
    const record: NotificationRecord = { ...data, _id: newId(), createdAt: nowIso() };
    state.notifications.unshift(record);
    this.saveState();
    return record;
  },

  async markNotificationRead(id: string, userId: string): Promise<boolean> {
    if (isMongoConnected()) {
      const res = await Models.Notification.findOneAndUpdate({ _id: id, userId }, { read: true });
      return Boolean(res);
    }
    const state = this.getState();
    const n = state.notifications.find((item) => item._id === id && item.userId === userId);
    if (!n) return false;
    n.read = true;
    this.saveState();
    return true;
  },

  async markAllNotificationsRead(userId: string): Promise<void> {
    if (isMongoConnected()) {
      await Models.Notification.updateMany({ userId, read: false }, { read: true });
      return;
    }
    const state = this.getState();
    state.notifications.forEach((n) => {
      if (n.userId === userId) n.read = true;
    });
    this.saveState();
  },

  async deleteNotification(id: string, userId: string): Promise<boolean> {
    if (isMongoConnected()) {
      const res = await Models.Notification.findOneAndDelete({ _id: id, userId });
      return Boolean(res);
    }
    const state = this.getState();
    const before = state.notifications.length;
    state.notifications = state.notifications.filter((n) => !(n._id === id && n.userId === userId));
    this.saveState();
    return state.notifications.length < before;
  },

  // Email Preferences, Campaigns, Logs
  async getEmailPreference(userId: string): Promise<EmailPreferenceRecord> {
    if (isMongoConnected()) {
      let doc = await Models.EmailPreference.findOne({ userId }).lean();
      if (!doc) {
        const created = await Models.EmailPreference.create({ userId });
        doc = created.toObject();
      }
      return {
        ...(doc as unknown as EmailPreferenceRecord),
        newJobNotifications: (doc as unknown as EmailPreferenceRecord).newJobNotifications ?? true,
        featuredJobAnnouncements: (doc as unknown as EmailPreferenceRecord).featuredJobAnnouncements ?? true,
        _id: String(doc._id),
        userId: String(doc.userId),
      };
    }
    const state = this.getState();
    let pref = state.emailPreferences.find((p) => p.userId === userId);
    if (!pref) {
      pref = {
        _id: newId(),
        userId,
        dailyJobAlerts: false,
        weeklyJobAlerts: true,
        newJobNotifications: true,
        featuredJobAnnouncements: true,
        promotionalEmails: true,
        applicationNotifications: true,
        interviewNotifications: true,
        preferredCategories: [],
        preferredLocations: [],
        preferredWorkModes: [],
        frequency: 'weekly',
        updatedAt: nowIso(),
      };
      state.emailPreferences.push(pref);
      this.saveState();
    }
    return {
      ...pref,
      newJobNotifications: pref.newJobNotifications ?? true,
      featuredJobAnnouncements: pref.featuredJobAnnouncements ?? true,
    };
  },

  async updateEmailPreference(userId: string, patch: Partial<EmailPreferenceRecord>): Promise<EmailPreferenceRecord> {
    if (isMongoConnected()) {
      const doc = await Models.EmailPreference.findOneAndUpdate(
        { userId },
        { $set: patch, $setOnInsert: { userId } },
        { upsert: true, new: true }
      ).lean();
      return {
        ...(doc as unknown as EmailPreferenceRecord),
        newJobNotifications: (doc as unknown as EmailPreferenceRecord).newJobNotifications ?? true,
        featuredJobAnnouncements: (doc as unknown as EmailPreferenceRecord).featuredJobAnnouncements ?? true,
        _id: String(doc._id),
        userId: String(doc.userId),
      };
    }
    const current = await this.getEmailPreference(userId);
    const state = this.getState();
    const idx = state.emailPreferences.findIndex((p) => p.userId === userId);
    state.emailPreferences[idx] = { ...current, ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.emailPreferences[idx];
  },

  async listEmailCampaigns(): Promise<EmailCampaignRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.EmailCampaign.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => ({ ...(d as unknown as EmailCampaignRecord), _id: String(d._id) }));
    }
    return [...this.getState().emailCampaigns];
  },

  async findEmailCampaignById(id: string): Promise<EmailCampaignRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.EmailCampaign.findById(id).lean();
      return doc ? { ...(doc as unknown as EmailCampaignRecord), _id: String(doc._id) } : null;
    }
    return this.getState().emailCampaigns.find((c) => c._id === id) || null;
  },

  async createEmailCampaign(data: Omit<EmailCampaignRecord, '_id' | 'createdAt' | 'updatedAt'>): Promise<EmailCampaignRecord> {
    if (isMongoConnected()) {
      const created = await Models.EmailCampaign.create(data);
      return { ...(created.toObject() as unknown as EmailCampaignRecord), _id: String(created._id) };
    }
    const state = this.getState();
    const rec: EmailCampaignRecord = { ...data, _id: newId(), createdAt: nowIso(), updatedAt: nowIso() };
    state.emailCampaigns.unshift(rec);
    this.saveState();
    return rec;
  },

  async updateEmailCampaign(id: string, patch: Partial<EmailCampaignRecord>): Promise<EmailCampaignRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.EmailCampaign.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? { ...(doc as unknown as EmailCampaignRecord), _id: String(doc._id) } : null;
    }
    const state = this.getState();
    const idx = state.emailCampaigns.findIndex((c) => c._id === id);
    if (idx === -1) return null;
    state.emailCampaigns[idx] = { ...state.emailCampaigns[idx], ...patch, updatedAt: nowIso() };
    this.saveState();
    return state.emailCampaigns[idx];
  },

  async createEmailLog(data: Omit<EmailLogRecord, '_id' | 'createdAt'>): Promise<EmailLogRecord> {
    if (isMongoConnected()) {
      const created = await Models.EmailLog.create(data);
      return { ...(created.toObject() as unknown as EmailLogRecord), _id: String(created._id) };
    }
    const state = this.getState();
    const rec: EmailLogRecord = { ...data, _id: newId(), createdAt: nowIso() };
    state.emailLogs.unshift(rec);
    if (state.emailLogs.length > 500) state.emailLogs.length = 500;
    this.saveState();
    return rec;
  },

  async findEmailLogByMessageId(messageId: string): Promise<EmailLogRecord | null> {
    if (!messageId) return null;
    if (isMongoConnected()) {
      const doc = await Models.EmailLog.findOne({ messageId }).lean();
      return doc ? { ...(doc as unknown as EmailLogRecord), _id: String(doc._id) } : null;
    }
    return this.getState().emailLogs.find((l) => l.messageId === messageId) || null;
  },

  async findEmailLogByDedupeKey(dedupeKey: string): Promise<EmailLogRecord | null> {
    if (!dedupeKey) return null;
    if (isMongoConnected()) {
      const doc = await Models.EmailLog.findOne({ dedupeKey, status: { $ne: 'failed' } }).lean();
      return doc ? { ...(doc as unknown as EmailLogRecord), _id: String(doc._id) } : null;
    }
    return this.getState().emailLogs.find((l) => l.dedupeKey === dedupeKey && l.status !== 'failed') || null;
  },

  async updateEmailLog(id: string, patch: Partial<EmailLogRecord>): Promise<EmailLogRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.EmailLog.findByIdAndUpdate(id, patch, { new: true }).lean();
      return doc ? { ...(doc as unknown as EmailLogRecord), _id: String(doc._id) } : null;
    }
    const state = this.getState();
    const idx = state.emailLogs.findIndex((l) => l._id === id);
    if (idx === -1) return null;
    state.emailLogs[idx] = { ...state.emailLogs[idx], ...patch };
    this.saveState();
    return state.emailLogs[idx];
  },

  async listEmailLogs(limit = 100): Promise<EmailLogRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.EmailLog.find().sort({ createdAt: -1 }).limit(limit).select('-htmlPreview').maxTimeMS(15000).lean();
      return docs.map((d) => ({ ...(d as unknown as EmailLogRecord), _id: String(d._id), htmlPreview: '' }));
    }
    return this.getState().emailLogs.slice(0, limit).map((l) => ({ ...l, htmlPreview: '' }));
  },

  async listEmailLogsByCampaign(campaignId: string): Promise<EmailLogRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.EmailLog.find({ campaignId }).select('-htmlPreview').lean();
      return docs.map((d) => ({ ...(d as unknown as EmailLogRecord), _id: String(d._id), htmlPreview: '' }));
    }
    return this.getState().emailLogs.filter((l) => l.campaignId === campaignId);
  },

  // Categories
  async listCategories(): Promise<JobCategoryRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.JobCategory.find().sort({ name: 1 }).lean();
      return docs.map((d) => ({ ...(d as unknown as JobCategoryRecord), _id: String(d._id) }));
    }
    return [...this.getState().jobCategories];
  },

  async createCategory(data: Omit<JobCategoryRecord, '_id' | 'createdAt'>): Promise<JobCategoryRecord> {
    appCache.invalidatePrefix('public:categories');
    appCache.invalidatePrefix('public:home');
    const cleanName = data.name.trim();
    const cleanSlug = data.slug.trim().toLowerCase();
    const existing = (await this.listCategories()).find(
      (c) => c.slug.toLowerCase() === cleanSlug || c.name.trim().toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) {
      return existing;
    }
    if (isMongoConnected()) {
      const created = await Models.JobCategory.create({ ...data, name: cleanName, slug: cleanSlug });
      return { ...(created.toObject() as unknown as JobCategoryRecord), _id: String(created._id) };
    }
    const state = this.getState();
    const rec: JobCategoryRecord = { ...data, name: cleanName, slug: cleanSlug, _id: newId(), createdAt: nowIso() };
    state.jobCategories.push(rec);
    this.saveState();
    return rec;
  },

  async deleteCategory(id: string): Promise<boolean> {
    appCache.invalidatePrefix('public:categories');
    appCache.invalidatePrefix('public:home');
    if (isMongoConnected()) {
      const res = await Models.JobCategory.findByIdAndDelete(id);
      return Boolean(res);
    }
    const state = this.getState();
    const before = state.jobCategories.length;
    state.jobCategories = state.jobCategories.filter((c) => c._id !== id);
    this.saveState();
    return state.jobCategories.length < before;
  },

  // Contact & Newsletter
  async createContactMessage(data: Omit<ContactMessageRecord, '_id' | 'createdAt' | 'status'>): Promise<ContactMessageRecord> {
    if (isMongoConnected()) {
      const created = await Models.ContactMessage.create({ ...data, status: 'new' });
      return { ...(created.toObject() as unknown as ContactMessageRecord), _id: String(created._id) };
    }
    const state = this.getState();
    const rec: ContactMessageRecord = { ...data, _id: newId(), status: 'new', createdAt: nowIso() };
    state.contactMessages.unshift(rec);
    this.saveState();
    return rec;
  },

  async listContactMessages(): Promise<ContactMessageRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.ContactMessage.find().sort({ createdAt: -1 }).lean();
      return docs.map((d) => ({ ...(d as unknown as ContactMessageRecord), _id: String(d._id) }));
    }
    return [...this.getState().contactMessages];
  },

  async resolveContactMessage(id: string): Promise<ContactMessageRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.ContactMessage.findByIdAndUpdate(id, { status: 'resolved' }, { new: true }).lean();
      return doc ? { ...(doc as unknown as ContactMessageRecord), _id: String(doc._id) } : null;
    }
    const state = this.getState();
    const msg = state.contactMessages.find((m) => m._id === id);
    if (!msg) return null;
    msg.status = 'resolved';
    this.saveState();
    return msg;
  },

  async addNewsletterSubscriber(email: string): Promise<NewsletterRecord> {
    const normalized = email.trim().toLowerCase();
    const state = this.getState();
    const existing = state.newsletterSubscribers.find((s) => s.email === normalized);
    if (existing) return existing;
    const rec: NewsletterRecord = { _id: newId(), email: normalized, subscribedAt: nowIso() };
    state.newsletterSubscribers.push(rec);
    this.saveState();
    return rec;
  },

  // Audit logs
  async createAuditLog(data: Omit<AuditLogRecord, '_id' | 'createdAt'>): Promise<void> {
    if (isMongoConnected()) {
      await Models.AuditLog.create(data);
      return;
    }
    const state = this.getState();
    state.auditLogs.unshift({ ...data, _id: newId(), createdAt: nowIso() });
    if (state.auditLogs.length > 1000) state.auditLogs.length = 1000;
    this.saveState();
  },

  async listAuditLogs(limit = 100): Promise<AuditLogRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.AuditLog.find().sort({ createdAt: -1 }).limit(limit).maxTimeMS(15000).lean();
      return docs.map((d) => ({ ...(d as unknown as AuditLogRecord), _id: String(d._id) }));
    }
    return this.getState().auditLogs.slice(0, limit);
  },

  // Refresh Tokens
  async saveRefreshToken(userId: string, tokenHash: string, expiresAt: string): Promise<void> {
    if (isMongoConnected()) {
      await Models.RefreshToken.create({ userId, tokenHash, expiresAt: new Date(expiresAt) });
      return;
    }
    const state = this.getState();
    state.refreshTokens.push({ _id: newId(), userId, tokenHash, expiresAt, revoked: false, createdAt: nowIso() });
    this.saveState();
  },

  async findValidRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    if (isMongoConnected()) {
      const doc = await Models.RefreshToken.findOne({ tokenHash, revoked: false, expiresAt: { $gt: new Date() } }).lean();
      return doc ? { ...(doc as unknown as RefreshTokenRecord), _id: String(doc._id), userId: String(doc.userId) } : null;
    }
    const now = Date.now();
    return (
      this.getState().refreshTokens.find(
        (t) => t.tokenHash === tokenHash && !t.revoked && new Date(t.expiresAt).getTime() > now
      ) || null
    );
  },

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    if (isMongoConnected()) {
      await Models.RefreshToken.updateMany({ tokenHash }, { revoked: true });
      return;
    }
    const state = this.getState();
    state.refreshTokens.forEach((t) => {
      if (t.tokenHash === tokenHash) t.revoked = true;
    });
    this.saveState();
  },

  // Platform settings
  getPlatformSettings(): PlatformSettingsRecord {
    const defaults = createInitialSeed().platformSettings;
    const active =
      isMongoConnected() && cachedPlatformSettings ? cachedPlatformSettings : this.getState().platformSettings;
    return {
      ...defaults,
      ...active,
      socialLinks: {
        ...defaults.socialLinks!,
        ...(active?.socialLinks || {}),
      },
      schedulerState: {
        ...defaults.schedulerState!,
        ...(active?.schedulerState || {}),
        notifiedJobIds: active?.schedulerState?.notifiedJobIds || [],
      },
    };
  },

  async updatePlatformSettings(patch: Partial<PlatformSettingsRecord>): Promise<PlatformSettingsRecord> {
    appCache.invalidatePrefix('public:settings');
    const current = this.getPlatformSettings();
    const next: PlatformSettingsRecord = {
      ...current,
      ...patch,
      socialLinks: {
        ...(current.socialLinks || { linkedin: '', twitter: '', instagram: '', facebook: '', youtube: '', github: '' }),
        ...(patch.socialLinks || {}),
      },
      schedulerState: {
        ...(current.schedulerState || { lastDailyDigestKey: '', lastWeeklyDigestKey: '', notifiedJobIds: [] }),
        ...(patch.schedulerState || {}),
      },
    };
    cachedPlatformSettings = next;
    if (isMongoConnected()) {
      await Models.PlatformSetting.findOneAndUpdate(
        { key: 'global' },
        { $set: next, $setOnInsert: { key: 'global' } },
        { upsert: true, new: true }
      ).lean();
    } else {
      const state = this.getState();
      state.platformSettings = next;
      this.saveState();
    }
    return next;
  },

  // ---------- High-Performance Scoped & Aggregated Queries ----------

  async findUserByResetTokenHash(tokenHash: string): Promise<UserRecord | null> {
    if (!tokenHash) return null;
    if (isMongoConnected()) {
      const doc = await Models.User.findOne({
        resetTokenHash: tokenHash,
        resetTokenExpires: { $gt: new Date() },
      }).lean();
      return doc ? { ...(doc as unknown as UserRecord), _id: String(doc._id) } : null;
    }
    return (
      this.getState().users.find(
        (u) => u.resetTokenHash === tokenHash && u.resetTokenExpires && new Date(u.resetTokenExpires).getTime() > Date.now()
      ) || null
    );
  },

  async listUsersSafe(filters?: { role?: string; q?: string }): Promise<Omit<UserRecord, 'passwordHash' | 'verificationToken' | 'resetTokenHash' | 'resetTokenExpires'>[]> {
    if (isMongoConnected()) {
      const query: Record<string, unknown> = {};
      if (filters?.role) query.role = filters.role;
      if (filters?.q) {
        const rx = new RegExp(escapeRegex(filters.q), 'i');
        query.$or = [{ name: rx }, { email: rx }];
      }
      const docs = await Models.User.find(query).select(USER_SAFE_OMIT).sort({ createdAt: -1 }).maxTimeMS(15000).lean();
      return docs.map((d) => ({ ...(d as unknown as UserRecord), _id: String(d._id) }));
    }
    let users = [...this.getState().users];
    if (filters?.role) users = users.filter((u) => u.role === filters.role);
    if (filters?.q) {
      const ql = filters.q.toLowerCase();
      users = users.filter((u) => u.name.toLowerCase().includes(ql) || u.email.toLowerCase().includes(ql));
    }
    return users
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map(({ passwordHash: _p, verificationToken: _v, resetTokenHash: _r, resetTokenExpires: _re, ...rest }) => rest);
  },

  async listUsersByIds(ids: string[]): Promise<UserRecord[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    if (isMongoConnected()) {
      const validIds = unique.filter(isObjectIdLike);
      if (validIds.length === 0) return [];
      const docs = await Models.User.find({ _id: { $in: validIds } }).select(USER_SAFE_OMIT).lean();
      return docs.map((d) => ({ ...(d as unknown as UserRecord), _id: String(d._id) }));
    }
    const idSet = new Set(unique);
    return this.getState().users.filter((u) => idSet.has(u._id));
  },

  async listCandidateProfilesByUserIds(userIds: string[]): Promise<CandidateProfileRecord[]> {
    const unique = [...new Set(userIds.filter(Boolean))];
    if (unique.length === 0) return [];
    if (isMongoConnected()) {
      const validIds = unique.filter(isObjectIdLike);
      if (validIds.length === 0) return [];
      const docs = await Models.CandidateProfile.find({ userId: { $in: validIds } }).lean();
      return docs.map((d) => ({
        ...(d as unknown as CandidateProfileRecord),
        _id: String(d._id),
        userId: String(d.userId),
      }));
    }
    const idSet = new Set(unique);
    return this.getState().candidateProfiles.filter((p) => idSet.has(p.userId));
  },

  async listCompaniesByIds(ids: string[]): Promise<CompanyRecord[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    if (isMongoConnected()) {
      const validIds = unique.filter(isObjectIdLike);
      if (validIds.length === 0) return [];
      const docs = await Models.Company.find({ _id: { $in: validIds } }).lean();
      return docs.map((d) => mapCompanyDoc(d as unknown as Record<string, unknown>));
    }
    const idSet = new Set(unique);
    return this.getState().companies.filter((c) => idSet.has(c._id));
  },

  async listOwnedCompanies(recruiterId: string, primaryCompanyId?: string): Promise<CompanyRecord[]> {
    if (isMongoConnected()) {
      const orClauses: Record<string, unknown>[] = [];
      if (isObjectIdLike(recruiterId)) orClauses.push({ ownerRecruiterId: recruiterId });
      if (primaryCompanyId && isObjectIdLike(primaryCompanyId)) orClauses.push({ _id: primaryCompanyId });
      if (orClauses.length === 0) return [];
      const docs = await Models.Company.find({ $or: orClauses }).sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapCompanyDoc(d as unknown as Record<string, unknown>));
    }
    const recId = String(recruiterId);
    const primId = primaryCompanyId ? String(primaryCompanyId) : '';
    return this.getState().companies.filter(
      (c) => (c.ownerRecruiterId && String(c.ownerRecruiterId) === recId) || (primId !== '' && String(c._id) === primId)
    );
  },

  async getPublicStats(): Promise<{
    activeJobs: number;
    verifiedCompanies: number;
    totalApplications: number;
    registeredCandidates: number;
  }> {
    return appCache.getOrLoad('public:stats', 20_000, async () => {
      if (isMongoConnected()) {
        const [activeJobs, verifiedCompanies, totalApplications, registeredCandidates] = await Promise.all([
          Models.Job.countDocuments(buildActiveJobMongoFilter()).maxTimeMS(15000),
          Models.Company.countDocuments({ verified: true }).maxTimeMS(15000),
          Models.Application.countDocuments().maxTimeMS(15000),
          Models.User.countDocuments({ role: 'candidate' }).maxTimeMS(15000),
        ]);
        return { activeJobs, verifiedCompanies, totalApplications, registeredCandidates };
      }
      const now = Date.now();
      const s = this.getState();
      return {
        activeJobs: s.jobs.filter(
          (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
        ).length,
        verifiedCompanies: s.companies.filter((c) => c.verified).length,
        totalApplications: s.applications.length,
        registeredCandidates: s.users.filter((u) => u.role === 'candidate').length,
      };
    });
  },

  async listCategoriesWithCounts(): Promise<Array<JobCategoryRecord & { openCount: number }>> {
    return appCache.getOrLoad('public:categories', 30_000, async () => {
      if (isMongoConnected()) {
        const [categories, counts] = await Promise.all([
          Models.JobCategory.find({ active: true }).sort({ name: 1 }).maxTimeMS(15000).lean(),
          Models.Job.aggregate<{ _id: string; count: number }>([
            { $match: buildActiveJobMongoFilter() },
            { $group: { _id: { $toLower: '$category' }, count: { $sum: 1 } } },
          ]).option({ maxTimeMS: 15000 }),
        ]);
        const countMap = new Map(counts.map((c) => [c._id, c.count]));
        return categories.map((c) => ({
          ...(c as unknown as JobCategoryRecord),
          _id: String(c._id),
          openCount: countMap.get(c.name.toLowerCase()) || 0,
        }));
      }
      const now = Date.now();
      const s = this.getState();
      const activeJobs = s.jobs.filter(
        (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
      );
      return s.jobCategories
        .filter((c) => c.active)
        .map((c) => ({
          ...c,
          openCount: activeJobs.filter((j) => j.category.toLowerCase() === c.name.toLowerCase()).length,
        }));
    });
  },

  async listCompaniesWithCounts(): Promise<Array<CompanyRecord & { openJobsCount: number }>> {
    return appCache.getOrLoad('public:companies', 30_000, async () => {
      if (isMongoConnected()) {
        const [companies, counts] = await Promise.all([
          Models.Company.find().sort({ createdAt: -1 }).maxTimeMS(15000).lean(),
          Models.Job.aggregate<{ _id: unknown; count: number }>([
            { $match: buildActiveJobMongoFilter() },
            { $group: { _id: '$companyId', count: { $sum: 1 } } },
          ]).option({ maxTimeMS: 15000 }),
        ]);
        const countMap = new Map(counts.map((c) => [String(c._id), c.count]));
        return companies.map((c) => ({
          ...mapCompanyDoc(c as unknown as Record<string, unknown>),
          openJobsCount: countMap.get(String(c._id)) || 0,
        }));
      }
      const now = Date.now();
      const s = this.getState();
      const activeJobs = s.jobs.filter(
        (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
      );
      return s.companies.map((c) => ({
        ...c,
        openJobsCount: activeJobs.filter((j) => j.companyId === c._id).length,
      }));
    });
  },

  async listPublishedJobsByCompany(companyId: string): Promise<JobRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Job.find({
        ...buildActiveJobMongoFilter(),
        companyId,
      })
        .sort({ publishedAt: -1, createdAt: -1 })
        .select(JOB_LIST_OMIT)
        .lean();
      return docs.map((d) => mapJobDoc(d as unknown as Record<string, unknown>));
    }
    const now = Date.now();
    return this.getState().jobs.filter(
      (j) =>
        j.companyId === companyId &&
        j.status === 'published' &&
        (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
    );
  },

  async listFeaturedJobs(limit = 6): Promise<Array<JobRecord & { company: CompanyRecord | null }>> {
    return appCache.getOrLoad(`public:featured:${limit}`, 20_000, async () => {
      if (isMongoConnected()) {
        const docs = await Models.Job.find(buildActiveJobMongoFilter())
          .sort({ featured: -1, viewsCount: -1, publishedAt: -1 })
          .limit(limit)
          .select(JOB_LIST_OMIT)
          .maxTimeMS(15000)
          .lean();
        const jobs = docs.map((d) => mapJobDoc(d as unknown as Record<string, unknown>));
        const companies = await this.listCompaniesByIds(jobs.map((j) => j.companyId));
        const companyMap = new Map(companies.map((c) => [c._id, c]));
        return jobs.map((j) => ({ ...j, company: companyMap.get(j.companyId) || null }));
      }
      const now = Date.now();
      const s = this.getState();
      const companyMap = new Map(s.companies.map((c) => [c._id, c]));
      return s.jobs
        .filter((j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now))
        .sort((a, b) => Number(b.featured) - Number(a.featured) || b.viewsCount - a.viewsCount)
        .slice(0, limit)
        .map((j) => ({ ...j, company: companyMap.get(j.companyId) || null }));
    });
  },

  async getCompanyProfileWithJobs(
    idOrSlug: string
  ): Promise<{ company: CompanyRecord; jobs: Array<JobRecord & { company: CompanyRecord }> } | null> {
    return appCache.getOrLoad(`public:company:${idOrSlug}`, 20_000, async () => {
      const company = await this.findCompanyById(idOrSlug);
      if (!company) return null;
      const jobs = (await this.listPublishedJobsByCompany(company._id)).map((j) => ({ ...j, company }));
      return { company, jobs };
    });
  },

  async getHomeSummaryData() {
    return appCache.getOrLoad('public:home', 20_000, async () => {
      const [stats, categories, featuredJobs, latestResult, companies] = await Promise.all([
        this.getPublicStats(),
        this.listCategoriesWithCounts(),
        this.listFeaturedJobs(6),
        this.queryPublishedJobs({ page: 1, limit: 6, sort: 'latest' }),
        this.listCompaniesWithCounts(),
      ]);
      return {
        stats,
        categories,
        featuredJobs,
        latestJobs: latestResult.items,
        companies: companies.slice(0, 12),
      };
    });
  },

  async warmPublicCaches(): Promise<void> {
    await Promise.all([this.getHomeSummaryData(), this.listJobsForSitemap()]);
  },

  async queryPublishedJobs(filters: {
    q?: string;
    company?: string;
    category?: string;
    location?: string;
    workMode?: string;
    experience?: string;
    employmentType?: string;
    skills?: string;
    education?: string;
    salaryMin?: number;
    salaryMax?: number;
    postedDays?: number;
    sort?: string;
    page?: number;
    limit?: number;
  }): Promise<{
    items: Array<JobRecord & { company: CompanyRecord | null }>;
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const q = (filters.q || '').trim();
    const company = (filters.company || '').trim();
    const category = (filters.category || '').trim();
    const location = (filters.location || '').trim();
    const workMode = (filters.workMode || '').trim();
    const experience = (filters.experience || '').trim();
    const employmentType = (filters.employmentType || '').trim();
    const skills = (filters.skills || '').trim();
    const education = (filters.education || '').trim();
    const salaryMin = Number(filters.salaryMin || 0);
    const salaryMax = Number(filters.salaryMax || 0);
    const postedDays = Number(filters.postedDays || 0);
    const sort = filters.sort || 'latest';
    const page = Math.max(1, Number(filters.page || 1));
    const limit = Math.min(50, Math.max(1, Number(filters.limit || 9)));

    const cacheKey = `public:jobs:${JSON.stringify({
      q,
      company,
      category,
      location,
      workMode,
      experience,
      employmentType,
      skills,
      education,
      salaryMin,
      salaryMax,
      postedDays,
      sort,
      page,
      limit,
    })}`;

    return appCache.getOrLoad(cacheKey, 15_000, async () => {
      if (isMongoConnected()) {
        const andClauses: Record<string, unknown>[] = [buildActiveJobMongoFilter()];

        if (q) {
          const rx = new RegExp(escapeRegex(q), 'i');
          andClauses.push({
            $or: [{ title: rx }, { companyName: rx }, { description: rx }, { skills: rx }],
          });
        }
        if (company) {
          const companyOr: Record<string, unknown>[] = [{ companyName: new RegExp(escapeRegex(company), 'i') }];
          if (isObjectIdLike(company)) companyOr.push({ companyId: company });
          andClauses.push({ $or: companyOr });
        }
        if (category) {
          andClauses.push({ category: new RegExp(`^${escapeRegex(category)}$`, 'i') });
        }
        if (location) {
          andClauses.push({ location: new RegExp(escapeRegex(location), 'i') });
        }
        if (workMode) {
          andClauses.push({ workMode });
        }
        if (experience) {
          andClauses.push({ requiredExperience: new RegExp(escapeRegex(experience), 'i') });
        }
        if (employmentType) {
          andClauses.push({ employmentType });
        }
        if (skills) {
          const reqSkills = skills.split(',').map((s) => s.trim()).filter(Boolean);
          for (const rs of reqSkills) {
            andClauses.push({ skills: new RegExp(escapeRegex(rs), 'i') });
          }
        }
        if (education) {
          andClauses.push({ educationQualification: new RegExp(escapeRegex(education), 'i') });
        }
        if (salaryMin > 0) {
          andClauses.push({ $or: [{ salaryMax: { $gte: salaryMin } }, { salaryMin: { $gte: salaryMin } }] });
        }
        if (salaryMax > 0) {
          andClauses.push({ salaryMin: { $lte: salaryMax } });
        }
        if (postedDays > 0) {
          const cutoffDate = new Date(Date.now() - postedDays * 86400_000);
          andClauses.push({
            $or: [
              { publishedAt: { $gte: cutoffDate } },
              { publishedAt: { $exists: false }, createdAt: { $gte: cutoffDate } },
            ],
          });
        }

        const mongoFilter = andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
        const sortSpec: Record<string, 1 | -1> =
          sort === 'oldest'
            ? { createdAt: 1 }
            : sort === 'salary_desc'
              ? { salaryMax: -1, createdAt: -1 }
              : sort === 'salary_asc'
                ? { salaryMin: 1, createdAt: -1 }
                : sort === 'relevant'
                  ? { featured: -1, viewsCount: -1, publishedAt: -1 }
                  : { publishedAt: -1, createdAt: -1 };

        const [total, docs] = await Promise.all([
          Models.Job.countDocuments(mongoFilter).maxTimeMS(15000),
          Models.Job.find(mongoFilter)
            .sort(sortSpec)
            .skip((page - 1) * limit)
            .limit(limit)
            .select(JOB_LIST_OMIT)
            .maxTimeMS(15000)
            .lean(),
        ]);

        const jobs = docs.map((d) => mapJobDoc(d as unknown as Record<string, unknown>));
        const companies = await this.listCompaniesByIds(jobs.map((j) => j.companyId));
        const companyMap = new Map(companies.map((c) => [c._id, c]));
        const totalPages = Math.max(1, Math.ceil(total / limit));

        return {
          items: jobs.map((j) => ({ ...j, company: companyMap.get(j.companyId) || null })),
          pagination: { page, limit, total, totalPages },
        };
      }

      // Local store fallback
      const ql = q.toLowerCase();
      const companyL = company.toLowerCase();
      const categoryL = category.toLowerCase();
      const locationL = location.toLowerCase();
      const expL = experience.toLowerCase();
      const skillsL = skills.toLowerCase();
      const eduL = education.toLowerCase();
      const now = Date.now();
      const s = this.getState();
      const companyMap = new Map(s.companies.map((c) => [c._id, c]));

      let filtered = s.jobs.filter(
        (j) => j.status === 'published' && (!j.applicationDeadline || new Date(j.applicationDeadline).getTime() >= now)
      );
      if (ql) {
        filtered = filtered.filter(
          (j) =>
            j.title.toLowerCase().includes(ql) ||
            j.companyName.toLowerCase().includes(ql) ||
            j.description.toLowerCase().includes(ql) ||
            j.skills.some((sk) => sk.toLowerCase().includes(ql))
        );
      }
      if (companyL) {
        filtered = filtered.filter((j) => j.companyName.toLowerCase().includes(companyL) || j.companyId === company);
      }
      if (categoryL) filtered = filtered.filter((j) => j.category.toLowerCase() === categoryL);
      if (locationL) filtered = filtered.filter((j) => j.location.toLowerCase().includes(locationL));
      if (workMode) filtered = filtered.filter((j) => j.workMode === workMode);
      if (expL) filtered = filtered.filter((j) => j.requiredExperience.toLowerCase().includes(expL));
      if (employmentType) filtered = filtered.filter((j) => j.employmentType === employmentType);
      if (skillsL) {
        const reqSkills = skillsL.split(',').map((sk) => sk.trim()).filter(Boolean);
        filtered = filtered.filter((j) => reqSkills.every((rs) => j.skills.some((js) => js.toLowerCase().includes(rs))));
      }
      if (eduL) filtered = filtered.filter((j) => j.educationQualification.toLowerCase().includes(eduL));
      if (salaryMin > 0) filtered = filtered.filter((j) => j.salaryMax >= salaryMin || j.salaryMin >= salaryMin);
      if (salaryMax > 0) filtered = filtered.filter((j) => j.salaryMin <= salaryMax);
      if (postedDays > 0) {
        const cutoff = now - postedDays * 86400_000;
        filtered = filtered.filter((j) => new Date(j.publishedAt || j.createdAt).getTime() >= cutoff);
      }
      filtered.sort((a, b) => {
        if (sort === 'oldest') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        if (sort === 'salary_desc') return b.salaryMax - a.salaryMax;
        if (sort === 'salary_asc') return a.salaryMin - b.salaryMin;
        if (sort === 'relevant') {
          return (Number(b.featured) * 50 + b.viewsCount * 0.01) - (Number(a.featured) * 50 + a.viewsCount * 0.01);
        }
        return new Date(b.publishedAt || b.createdAt).getTime() - new Date(a.publishedAt || a.createdAt).getTime();
      });

      const total = filtered.length;
      const totalPages = Math.max(1, Math.ceil(total / limit));
      const offset = (page - 1) * limit;
      return {
        items: filtered.slice(offset, offset + limit).map((j) => ({ ...j, company: companyMap.get(j.companyId) || null })),
        pagination: { page, limit, total, totalPages },
      };
    });
  },

  async listJobsByRecruiter(recruiterId: string): Promise<JobRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Job.find({ recruiterId }).sort({ createdAt: -1 }).lean();
      return docs.map((d) => mapJobDoc(d as unknown as Record<string, unknown>));
    }
    return this.getState().jobs.filter((j) => j.recruiterId === recruiterId);
  },

  async listJobsByIds(ids: string[], omitHeavy = true): Promise<JobRecord[]> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (unique.length === 0) return [];
    if (isMongoConnected()) {
      const validIds = unique.filter(isObjectIdLike);
      if (validIds.length === 0) return [];
      const query = Models.Job.find({ _id: { $in: validIds } });
      if (omitHeavy) query.select(JOB_LIST_OMIT);
      const docs = await query.lean();
      return docs.map((d) => mapJobDoc(d as unknown as Record<string, unknown>));
    }
    const idSet = new Set(unique);
    return this.getState().jobs.filter((j) => idSet.has(j._id));
  },

  async listJobsForSitemap(): Promise<Array<{ _id: string }>> {
    return appCache.getOrLoad('public:sitemap', 120_000, async () => {
      if (isMongoConnected()) {
        const docs = await Models.Job.find({ status: 'published' }).select('_id').maxTimeMS(15000).lean();
        return docs.map((d) => ({ _id: String(d._id) }));
      }
      return this.getState().jobs.filter((j) => j.status === 'published').map((j) => ({ _id: j._id }));
    });
  },

  async incrementJobViews(id: string): Promise<void> {
    if (isMongoConnected()) {
      await Models.Job.updateOne({ _id: id }, { $inc: { viewsCount: 1 } });
      return;
    }
    const job = this.getState().jobs.find((j) => j._id === id);
    if (job) {
      job.viewsCount = (job.viewsCount || 0) + 1;
      this.saveState();
    }
  },

  async hasSavedJob(candidateId: string, jobId: string): Promise<boolean> {
    if (isMongoConnected()) {
      const exists = await Models.SavedJob.exists({ candidateId, jobId });
      return Boolean(exists);
    }
    return this.getState().savedJobs.some((s) => s.candidateId === candidateId && s.jobId === jobId);
  },

  async listApplicationsByCandidate(candidateId: string): Promise<ApplicationRecord[]> {
    if (isMongoConnected()) {
      const docs = await Models.Application.find({ candidateId }).sort({ appliedAt: -1 }).maxTimeMS(15000).lean();
      return docs.map((d) => mapAppDoc(d as unknown as Record<string, unknown>));
    }
    return this.getState().applications.filter((a) => a.candidateId === candidateId);
  },

  async listApplicationsByRecruiter(
    recruiterId: string | null,
    filters?: { status?: string; jobId?: string; companyId?: string }
  ): Promise<ApplicationRecord[]> {
    if (isMongoConnected()) {
      const query: Record<string, unknown> = {};
      if (recruiterId) query.recruiterId = recruiterId;
      if (filters?.status) query.status = filters.status;
      if (filters?.jobId) query.jobId = filters.jobId;
      if (filters?.companyId) query.companyId = filters.companyId;
      const docs = await Models.Application.find(query).sort({ appliedAt: -1 }).maxTimeMS(15000).lean();
      return docs.map((d) => mapAppDoc(d as unknown as Record<string, unknown>));
    }
    return this.getState().applications.filter(
      (a) =>
        (!recruiterId || a.recruiterId === recruiterId) &&
        (!filters?.status || a.status === filters.status) &&
        (!filters?.jobId || a.jobId === filters.jobId) &&
        (!filters?.companyId || a.companyId === filters.companyId)
    );
  },

  async hasRecruiterResumeAccess(recruiterId: string, resumePublicId: string): Promise<boolean> {
    if (isMongoConnected()) {
      const exists = await Models.Application.exists({ recruiterId, resumePublicId });
      return Boolean(exists);
    }
    return this.getState().applications.some((a) => a.recruiterId === recruiterId && a.resumePublicId === resumePublicId);
  },

  async listInterviewsByUser(role: string, userId: string): Promise<InterviewRecord[]> {
    if (isMongoConnected()) {
      const query: Record<string, unknown> =
        role === 'admin' ? {} : role === 'recruiter' ? { recruiterId: userId } : { candidateId: userId };
      const docs = await Models.Interview.find(query).sort({ date: 1, time: 1 }).maxTimeMS(15000).lean();
      return docs.map((d) => ({
        ...(d as unknown as InterviewRecord),
        _id: String(d._id),
        applicationId: String(d.applicationId),
        jobId: String(d.jobId),
        candidateId: String(d.candidateId),
        recruiterId: String(d.recruiterId),
      }));
    }
    return this.getState().interviews.filter((i) => {
      if (role === 'admin') return true;
      if (role === 'recruiter') return i.recruiterId === userId;
      return i.candidateId === userId;
    });
  },

  async getAdminDashboardMetrics(): Promise<{
    stats: {
      totalUsers: number;
      candidates: number;
      recruiters: number;
      pendingRecruiters: number;
      companies: number;
      totalJobs: number;
      publishedJobs: number;
      totalApplications: number;
      categories: number;
      campaigns: number;
      unreadMessages: number;
    };
    categoryBreakdown: Array<{ name: string; jobs: number }>;
    applicationStatusBreakdown: Array<{ status: string; count: number }>;
  }> {
    if (isMongoConnected()) {
      const [
        totalUsers,
        candidates,
        recruiters,
        pendingRecruiters,
        companies,
        totalJobs,
        publishedJobs,
        totalApplications,
        categoriesList,
        campaigns,
        unreadMessages,
        jobCatAgg,
        appStatusAgg,
      ] = await Promise.all([
        Models.User.countDocuments().maxTimeMS(15000),
        Models.User.countDocuments({ role: 'candidate' }).maxTimeMS(15000),
        Models.User.countDocuments({ role: 'recruiter' }).maxTimeMS(15000),
        Models.RecruiterProfile.countDocuments({ verificationStatus: 'pending' }).maxTimeMS(15000),
        Models.Company.countDocuments().maxTimeMS(15000),
        Models.Job.countDocuments().maxTimeMS(15000),
        Models.Job.countDocuments({ status: 'published' }).maxTimeMS(15000),
        Models.Application.countDocuments().maxTimeMS(15000),
        Models.JobCategory.find().select('name').sort({ name: 1 }).maxTimeMS(15000).lean(),
        Models.EmailCampaign.countDocuments().maxTimeMS(15000),
        Models.ContactMessage.countDocuments({ status: 'new' }).maxTimeMS(15000),
        Models.Job.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$category', count: { $sum: 1 } } }]).option({ maxTimeMS: 15000 }),
        Models.Application.aggregate<{ _id: string; count: number }>([{ $group: { _id: '$status', count: { $sum: 1 } } }]).option({ maxTimeMS: 15000 }),
      ]);

      const jobCatMap = new Map(jobCatAgg.map((g) => [g._id, g.count]));
      const appStatusMap = new Map(appStatusAgg.map((g) => [g._id, g.count]));

      return {
        stats: {
          totalUsers,
          candidates,
          recruiters,
          pendingRecruiters,
          companies,
          totalJobs,
          publishedJobs,
          totalApplications,
          categories: categoriesList.length,
          campaigns,
          unreadMessages,
        },
        categoryBreakdown: categoriesList.map((cat) => ({
          name: cat.name,
          jobs: jobCatMap.get(cat.name) || 0,
        })),
        applicationStatusBreakdown: [
          { status: 'Applied', count: appStatusMap.get('Applied') || 0 },
          { status: 'Shortlisted', count: appStatusMap.get('Shortlisted') || 0 },
          { status: 'Interview', count: appStatusMap.get('Interview Scheduled') || 0 },
          { status: 'Selected', count: appStatusMap.get('Selected') || 0 },
          { status: 'Rejected', count: appStatusMap.get('Rejected') || 0 },
        ],
      };
    }

    const s = this.getState();
    return {
      stats: {
        totalUsers: s.users.length,
        candidates: s.users.filter((u) => u.role === 'candidate').length,
        recruiters: s.users.filter((u) => u.role === 'recruiter').length,
        pendingRecruiters: s.recruiterProfiles.filter((r) => r.verificationStatus === 'pending').length,
        companies: s.companies.length,
        totalJobs: s.jobs.length,
        publishedJobs: s.jobs.filter((j) => j.status === 'published').length,
        totalApplications: s.applications.length,
        categories: s.jobCategories.length,
        campaigns: s.emailCampaigns.length,
        unreadMessages: s.contactMessages.filter((m) => m.status === 'new').length,
      },
      categoryBreakdown: s.jobCategories.map((cat) => ({
        name: cat.name,
        jobs: s.jobs.filter((j) => j.category === cat.name).length,
      })),
      applicationStatusBreakdown: [
        { status: 'Applied', count: s.applications.filter((a) => a.status === 'Applied').length },
        { status: 'Shortlisted', count: s.applications.filter((a) => a.status === 'Shortlisted').length },
        { status: 'Interview', count: s.applications.filter((a) => a.status === 'Interview Scheduled').length },
        { status: 'Selected', count: s.applications.filter((a) => a.status === 'Selected').length },
        { status: 'Rejected', count: s.applications.filter((a) => a.status === 'Rejected').length },
      ],
    };
  },
};
