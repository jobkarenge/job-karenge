export type UserRole = 'candidate' | 'recruiter' | 'admin';
export type AccountStatus = 'active' | 'pending' | 'suspended';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type EmploymentType = 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Freelance';
export type WorkMode = 'Remote' | 'Hybrid' | 'On-site';
export type JobStatus = 'draft' | 'published' | 'scheduled' | 'closed' | 'expired';
export type ApplicationStatus =
  | 'Applied'
  | 'Shortlisted'
  | 'Interview Scheduled'
  | 'Selected'
  | 'Rejected'
  | 'Withdrawn';
export type InterviewType = 'Online' | 'In-person' | 'Phone';
export type InterviewStatus = 'Scheduled' | 'Rescheduled' | 'Cancelled' | 'Completed';
export type SalaryPeriod = 'Annual' | 'Monthly';

export interface UserRecord {
  _id: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  role: UserRole;
  emailVerified: boolean;
  accountStatus: AccountStatus;
  profileImage: string;
  profileImagePublicId: string;
  location: string;
  verificationToken?: string;
  passwordResetTokenHash?: string;
  passwordResetExpires?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CandidateProfileRecord {
  _id: string;
  userId: string;
  headline: string;
  designation: string;
  objective: string;
  totalExperienceYears: number;
  expectedSalary: string;
  dob: string;
  gender: string;
  currentLocation: string;
  address: string;
  education: Array<{
    institution: string;
    degree: string;
    fieldOfStudy: string;
    startDate: string;
    endDate: string;
    grade: string;
  }>;
  experience: Array<{
    company: string;
    jobTitle: string;
    employmentType: string;
    startDate: string;
    endDate: string;
    current: boolean;
    responsibilities: string;
  }>;
  technicalSkills: Array<{ name: string; proficiency: string }>;
  softSkills: string[];
  projects: Array<{
    title: string;
    description: string;
    technologies: string[];
    url: string;
  }>;
  certifications: string[];
  languages: string[];
  socialLinks: {
    linkedin: string;
    github: string;
    portfolio: string;
    website: string;
  };
  resumeUrl: string;
  resumePublicId: string;
  resumeFileName: string;
  resumeSizeBytes: number;
  resumeUploadedAt?: string;
  completionPercentage: number;
  updatedAt: string;
}

export interface RecruiterProfileRecord {
  _id: string;
  userId: string;
  companyId: string;
  companyName: string;
  designation: string;
  verificationStatus: VerificationStatus;
  verifiedBy?: string;
  verifiedAt?: string;
  rejectionReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CompanyRecord {
  _id: string;
  name: string;
  slug: string;
  logoUrl: string;
  logoPublicId: string;
  bannerUrl: string;
  bannerPublicId: string;
  industry: string;
  description: string;
  website: string;
  size: string;
  headquarters: string;
  socialLinks: {
    linkedin: string;
    twitter: string;
  };
  contactEmail: string;
  contactPhone: string;
  verified: boolean;
  ownerRecruiterId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface JobRecord {
  _id: string;
  recruiterId: string;
  companyId: string;
  companyName: string;
  title: string;
  slug: string;
  category: string;
  description: string;
  applicationDeadline?: string | null;
  requiredExperience: string;
  employmentType: EmploymentType;
  workMode: WorkMode;
  location: string;
  salaryMin: number;
  salaryMax: number;
  salaryPeriod?: SalaryPeriod;
  currency: string;
  skills: string[];
  educationQualification: string;
  openings: number;
  responsibilities: string[];
  requiredQualifications: string[];
  preferredQualifications: string[];
  benefits: string[];
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  applicationInstructions: string;
  status: JobStatus;
  scheduledFor?: string;
  featured: boolean;
  allowDirectApply: boolean;
  viewsCount: number;
  applicationsCount: number;
  publishedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicationStatusEntry {
  previousStatus: string;
  newStatus: ApplicationStatus;
  updatedBy: string;
  updatedByName: string;
  message: string;
  timestamp: string;
}

export interface ApplicationRecord {
  _id: string;
  candidateId: string;
  jobId: string;
  recruiterId: string;
  companyId: string;
  resumeUrl: string;
  resumePublicId: string;
  coverLetter: string;
  status: ApplicationStatus;
  statusHistory: ApplicationStatusEntry[];
  recruiterNotes: string;
  internalFeedback: string;
  appliedAt: string;
  updatedAt: string;
}

export interface SavedJobRecord {
  _id: string;
  candidateId: string;
  jobId: string;
  createdAt: string;
}

export interface InterviewRecord {
  _id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  recruiterId: string;
  date: string;
  time: string;
  timezone: string;
  type: InterviewType;
  meetingLinkOrLocation: string;
  interviewerName: string;
  instructions: string;
  notes: string;
  status: InterviewStatus;
  candidateConfirmed: boolean;
  reminderSent: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface EmailPreferenceRecord {
  _id: string;
  userId: string;
  dailyJobAlerts: boolean;
  weeklyJobAlerts: boolean;
  newJobNotifications: boolean;
  featuredJobAnnouncements: boolean;
  promotionalEmails: boolean;
  applicationNotifications: boolean;
  interviewNotifications: boolean;
  preferredCategories: string[];
  preferredLocations: string[];
  preferredWorkModes: string[];
  frequency: 'daily' | 'weekly' | 'monthly';
  unsubscribedAt?: string;
  updatedAt: string;
}

export interface EmailCampaignStats {
  sent: number;
  accepted: number;
  delivered: number;
  failed: number;
  bounced: number;
  unsubscribed: number;
  opened: number;
  clicked: number;
}

export interface EmailCampaignRecord {
  _id: string;
  title: string;
  subject: string;
  templateName: string;
  htmlContent: string;
  targetAudience: string;
  scheduledDate?: string;
  status: 'draft' | 'scheduled' | 'sent' | 'failed';
  brevoCampaignId?: number;
  brevoListId?: number;
  lastStatsSyncAt?: string;
  stats: EmailCampaignStats;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface EmailLogRecord {
  _id: string;
  recipientEmail: string;
  recipientUserId?: string;
  type: 'transactional' | 'promotional';
  templateName: string;
  subject: string;
  status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'simulated' | 'failed';
  provider?: 'gmail_smtp' | 'brevo';
  smtpEvent?: string;
  brevoEvent?: string;
  campaignId?: string;
  jobId?: string;
  dedupeKey?: string;
  deliveredAt?: string;
  messageId: string;
  error?: string;
  htmlPreview: string;
  createdAt: string;
}

export interface JobCategoryRecord {
  _id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
  createdAt: string;
}

export interface ContactMessageRecord {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: 'new' | 'resolved';
  createdAt: string;
}

export interface AuditLogRecord {
  _id: string;
  actorId: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  targetType: string;
  targetId: string;
  details: string;
  ipAddress: string;
  createdAt: string;
}

export interface RefreshTokenRecord {
  _id: string;
  userId: string;
  tokenHash: string;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

export interface NewsletterRecord {
  _id: string;
  email: string;
  subscribedAt: string;
}

export interface SocialLinksConfig {
  linkedin: string;
  twitter: string;
  instagram: string;
  facebook: string;
  youtube: string;
  github: string;
}

export interface SchedulerStateConfig {
  lastDailyDigestKey: string;
  lastWeeklyDigestKey: string;
  notifiedJobIds: string[];
  lastRunAt?: string;
}

export interface PlatformSettingsRecord {
  requireRecruiterApproval: boolean;
  autoExpireJobs: boolean;
  maxPdfSizeBytes: number;
  promotionalDigestEnabled: boolean;
  supportEmail: string;
  emailFromEmail?: string;
  emailFromName?: string;
  brevoSenderEmail?: string;
  brevoSenderName?: string;
  clientUrl?: string;
  serverUrl?: string;
  socialLinks?: SocialLinksConfig;
  schedulerState?: SchedulerStateConfig;
}
