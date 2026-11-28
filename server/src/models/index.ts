import mongoose, { Schema } from 'mongoose';

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['candidate', 'recruiter', 'admin'], required: true },
    emailVerified: { type: Boolean, default: false },
    accountStatus: { type: String, enum: ['active', 'pending', 'suspended'], default: 'active', index: true },
    profileImage: { type: String, default: '' },
    profileImagePublicId: { type: String, default: '' },
    location: { type: String, default: '' },
    verificationToken: { type: String, default: '' },
    resetTokenHash: { type: String, default: '', index: true },
    resetTokenExpires: { type: Date },
  },
  { timestamps: true }
);

userSchema.index({ role: 1, accountStatus: 1, createdAt: -1 });

const candidateProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    headline: { type: String, default: '' },
    designation: { type: String, default: '' },
    objective: { type: String, default: '' },
    totalExperienceYears: { type: Number, default: 0 },
    expectedSalary: { type: String, default: '' },
    dob: { type: String, default: '' },
    gender: { type: String, default: '' },
    currentLocation: { type: String, default: '' },
    address: { type: String, default: '' },
    education: [
      {
        institution: String,
        degree: String,
        fieldOfStudy: String,
        startDate: String,
        endDate: String,
        grade: String,
      },
    ],
    experience: [
      {
        company: String,
        jobTitle: String,
        employmentType: String,
        startDate: String,
        endDate: String,
        current: Boolean,
        responsibilities: String,
      },
    ],
    technicalSkills: [{ name: String, proficiency: String }],
    softSkills: [String],
    projects: [
      {
        title: String,
        description: String,
        technologies: [String],
        url: String,
      },
    ],
    certifications: [String],
    languages: [String],
    socialLinks: {
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      portfolio: { type: String, default: '' },
      website: { type: String, default: '' },
    },
    resumeUrl: { type: String, default: '' },
    resumePublicId: { type: String, default: '' },
    resumeFileName: { type: String, default: '' },
    resumeSizeBytes: { type: Number, default: 0 },
    resumeUploadedAt: { type: Date },
    completionPercentage: { type: Number, default: 15 },
  },
  { timestamps: true }
);

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    slug: { type: String, required: true, unique: true },
    logoUrl: { type: String, default: '' },
    logoPublicId: { type: String, default: '' },
    bannerUrl: { type: String, default: '' },
    bannerPublicId: { type: String, default: '' },
    industry: { type: String, default: '' },
    description: { type: String, default: '' },
    website: { type: String, default: '' },
    size: { type: String, default: '' },
    headquarters: { type: String, default: '' },
    socialLinks: {
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
    },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    verified: { type: Boolean, default: false },
    ownerRecruiterId: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

companySchema.index({ ownerRecruiterId: 1, createdAt: -1 });
companySchema.index({ verified: 1, createdAt: -1 });

const recruiterProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company' },
    companyName: { type: String, required: true },
    designation: { type: String, required: true },
    verificationStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending', index: true },
    verifiedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    rejectionReason: { type: String, default: '' },
  },
  { timestamps: true }
);

const jobSchema = new Schema(
  {
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyName: { type: String, required: true },
    title: { type: String, required: true, trim: true, index: true },
    slug: { type: String, required: true, unique: true },
    category: { type: String, required: true, index: true },
    description: { type: String, required: true },
    applicationDeadline: { type: Date, required: false, default: null, index: true },
    requiredExperience: { type: String, required: true },
    employmentType: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'], required: true },
    workMode: { type: String, enum: ['Remote', 'Hybrid', 'On-site'], required: true, index: true },
    location: { type: String, required: true, index: true },
    salaryMin: { type: Number, default: 0 },
    salaryMax: { type: Number, default: 0 },
    salaryPeriod: { type: String, enum: ['Annual', 'Monthly'], default: 'Annual' },
    currency: { type: String, default: 'INR' },
    skills: [{ type: String, index: true }],
    educationQualification: { type: String, default: '' },
    openings: { type: Number, default: 1 },
    responsibilities: [String],
    requiredQualifications: [String],
    preferredQualifications: [String],
    benefits: [String],
    contactPerson: { type: String, default: '' },
    contactEmail: { type: String, default: '' },
    contactPhone: { type: String, default: '' },
    applicationInstructions: { type: String, default: '' },
    status: { type: String, enum: ['draft', 'published', 'scheduled', 'closed', 'expired'], default: 'published' },
    scheduledFor: { type: Date },
    featured: { type: Boolean, default: false },
    allowDirectApply: { type: Boolean, default: true },
    viewsCount: { type: Number, default: 0 },
    applicationsCount: { type: Number, default: 0 },
    publishedAt: { type: Date },
  },
  { timestamps: true }
);

jobSchema.index({ status: 1, category: 1, location: 1, workMode: 1 });
jobSchema.index({ status: 1, publishedAt: -1, createdAt: -1 });
jobSchema.index({ status: 1, featured: -1, viewsCount: -1 });
jobSchema.index({ recruiterId: 1, createdAt: -1 });
jobSchema.index({ companyId: 1, status: 1 });

const applicationSchema = new Schema(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    resumeUrl: { type: String, required: true },
    resumePublicId: { type: String, default: '' },
    coverLetter: { type: String, default: '' },
    status: {
      type: String,
      enum: ['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Withdrawn'],
      default: 'Applied',
      index: true,
    },
    statusHistory: [
      {
        previousStatus: String,
        newStatus: String,
        updatedBy: Schema.Types.ObjectId,
        updatedByName: String,
        message: String,
        timestamp: { type: Date, default: Date.now },
      },
    ],
    recruiterNotes: { type: String, default: '' },
    internalFeedback: { type: String, default: '' },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

applicationSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ candidateId: 1, appliedAt: -1 });
applicationSchema.index({ recruiterId: 1, appliedAt: -1 });
applicationSchema.index({ recruiterId: 1, status: 1 });
applicationSchema.index({ recruiterId: 1, resumePublicId: 1 });
applicationSchema.index({ jobId: 1, status: 1 });

const savedJobSchema = new Schema(
  {
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
  },
  { timestamps: true }
);

savedJobSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });

const interviewSchema = new Schema(
  {
    applicationId: { type: Schema.Types.ObjectId, ref: 'Application', required: true, index: true },
    jobId: { type: Schema.Types.ObjectId, ref: 'Job', required: true },
    candidateId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    recruiterId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true },
    time: { type: String, required: true },
    timezone: { type: String, default: 'Asia/Kolkata' },
    type: { type: String, enum: ['Online', 'In-person', 'Phone'], required: true },
    meetingLinkOrLocation: { type: String, default: '' },
    interviewerName: { type: String, required: true },
    instructions: { type: String, default: '' },
    notes: { type: String, default: '' },
    status: { type: String, enum: ['Scheduled', 'Rescheduled', 'Cancelled', 'Completed'], default: 'Scheduled' },
    candidateConfirmed: { type: Boolean, default: false },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true }
);

interviewSchema.index({ candidateId: 1, date: 1, time: 1 });
interviewSchema.index({ recruiterId: 1, date: 1, time: 1 });

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    link: { type: String, default: '' },
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, read: 1 });

const emailPreferenceSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    dailyJobAlerts: { type: Boolean, default: false },
    weeklyJobAlerts: { type: Boolean, default: true },
    newJobNotifications: { type: Boolean, default: true },
    featuredJobAnnouncements: { type: Boolean, default: true },
    promotionalEmails: { type: Boolean, default: true },
    applicationNotifications: { type: Boolean, default: true },
    interviewNotifications: { type: Boolean, default: true },
    preferredCategories: [String],
    preferredLocations: [String],
    preferredWorkModes: [String],
    frequency: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'weekly' },
    unsubscribedAt: { type: Date },
    brevoSyncedAt: { type: Date },
  },
  { timestamps: true }
);

const emailCampaignSchema = new Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    templateName: { type: String, required: true },
    htmlContent: { type: String, default: '' },
    targetAudience: { type: String, default: 'all_candidates' },
    scheduledDate: { type: Date },
    status: { type: String, enum: ['draft', 'scheduled', 'sent', 'failed'], default: 'draft' },
    brevoCampaignId: { type: Number },
    brevoListId: { type: Number },
    lastStatsSyncAt: { type: Date },
    stats: {
      sent: { type: Number, default: 0 },
      accepted: { type: Number, default: 0 },
      delivered: { type: Number, default: 0 },
      failed: { type: Number, default: 0 },
      bounced: { type: Number, default: 0 },
      unsubscribed: { type: Number, default: 0 },
      opened: { type: Number, default: 0 },
      clicked: { type: Number, default: 0 },
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

const emailLogSchema = new Schema(
  {
    recipientEmail: { type: String, required: true, index: true },
    recipientUserId: { type: Schema.Types.ObjectId, ref: 'User' },
    type: { type: String, enum: ['transactional', 'promotional'], required: true },
    templateName: { type: String, required: true },
    subject: { type: String, required: true },
    status: { type: String, enum: ['queued', 'sent', 'delivered', 'bounced', 'simulated', 'failed'], default: 'queued' },
    provider: { type: String, enum: ['gmail_smtp', 'brevo'], default: 'gmail_smtp' },
    smtpEvent: { type: String, default: '' },
    brevoEvent: { type: String, default: '' },
    campaignId: { type: String, default: '', index: true },
    jobId: { type: String, default: '', index: true },
    dedupeKey: { type: String, default: '' },
    deliveredAt: { type: Date },
    messageId: { type: String, default: '', index: true },
    error: { type: String, default: '' },
    htmlPreview: { type: String, default: '' },
  },
  { timestamps: true }
);

emailLogSchema.index({ createdAt: -1 });
emailLogSchema.index({ dedupeKey: 1, status: 1 });

const jobCategorySchema = new Schema(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, default: '' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

jobCategorySchema.index({ active: 1, name: 1 });

const contactMessageSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true },
    subject: { type: String, required: true },
    message: { type: String, required: true },
    status: { type: String, enum: ['new', 'resolved'], default: 'new' },
  },
  { timestamps: true }
);

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User' },
    actorEmail: { type: String, default: '' },
    actorRole: { type: String, default: '' },
    action: { type: String, required: true },
    targetType: { type: String, default: '' },
    targetId: { type: String, default: '' },
    details: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });

const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revoked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const platformSettingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'global' },
    requireRecruiterApproval: { type: Boolean, default: true },
    autoExpireJobs: { type: Boolean, default: true },
    maxPdfSizeBytes: { type: Number, default: 1024 * 1024 },
    promotionalDigestEnabled: { type: Boolean, default: true },
    supportEmail: { type: String, default: 'support@jobkarenge.com' },
    emailFromEmail: { type: String, default: '' },
    emailFromName: { type: String, default: '' },
    brevoSenderEmail: { type: String, default: '' },
    brevoSenderName: { type: String, default: '' },
    clientUrl: { type: String, default: '' },
    serverUrl: { type: String, default: '' },
    socialLinks: {
      linkedin: { type: String, default: '' },
      twitter: { type: String, default: '' },
      instagram: { type: String, default: '' },
      facebook: { type: String, default: '' },
      youtube: { type: String, default: '' },
      github: { type: String, default: '' },
    },
    schedulerState: {
      lastDailyDigestKey: { type: String, default: '' },
      lastWeeklyDigestKey: { type: String, default: '' },
      notifiedJobIds: { type: [String], default: [] },
      lastRunAt: { type: Date },
    },
  },
  { timestamps: true }
);

export const Models = {
  User: mongoose.models.User || mongoose.model('User', userSchema),
  CandidateProfile: mongoose.models.CandidateProfile || mongoose.model('CandidateProfile', candidateProfileSchema),
  RecruiterProfile: mongoose.models.RecruiterProfile || mongoose.model('RecruiterProfile', recruiterProfileSchema),
  Company: mongoose.models.Company || mongoose.model('Company', companySchema),
  Job: mongoose.models.Job || mongoose.model('Job', jobSchema),
  Application: mongoose.models.Application || mongoose.model('Application', applicationSchema),
  SavedJob: mongoose.models.SavedJob || mongoose.model('SavedJob', savedJobSchema),
  Interview: mongoose.models.Interview || mongoose.model('Interview', interviewSchema),
  Notification: mongoose.models.Notification || mongoose.model('Notification', notificationSchema),
  EmailPreference: mongoose.models.EmailPreference || mongoose.model('EmailPreference', emailPreferenceSchema),
  EmailCampaign: mongoose.models.EmailCampaign || mongoose.model('EmailCampaign', emailCampaignSchema),
  EmailLog: mongoose.models.EmailLog || mongoose.model('EmailLog', emailLogSchema),
  JobCategory: mongoose.models.JobCategory || mongoose.model('JobCategory', jobCategorySchema),
  ContactMessage: mongoose.models.ContactMessage || mongoose.model('ContactMessage', contactMessageSchema),
  AuditLog: mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema),
  RefreshToken: mongoose.models.RefreshToken || mongoose.model('RefreshToken', refreshTokenSchema),
  PlatformSetting: mongoose.models.PlatformSetting || mongoose.model('PlatformSetting', platformSettingSchema),
};
