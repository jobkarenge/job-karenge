export type UserRole = 'candidate' | 'recruiter' | 'admin';

export interface User {
  _id: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  emailVerified: boolean;
  accountStatus: 'active' | 'pending' | 'suspended';
  profileImage: string;
  location: string;
  createdAt: string;
}

export interface CandidateProfile {
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
  resumeFileName: string;
  resumeSizeBytes: number;
  resumeUploadedAt?: string;
  completionPercentage: number;
}

export interface RecruiterProfile {
  _id: string;
  userId: string;
  companyId: string;
  companyName: string;
  designation: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  rejectionReason?: string;
}

export interface Company {
  _id: string;
  name: string;
  slug: string;
  logoUrl: string;
  bannerUrl: string;
  industry: string;
  description: string;
  website: string;
  size: string;
  headquarters: string;
  socialLinks: { linkedin: string; twitter: string };
  contactEmail: string;
  contactPhone: string;
  verified: boolean;
  openJobsCount?: number;
}

export interface Job {
  _id: string;
  recruiterId: string;
  companyId: string;
  companyName: string;
  company?: Company | null;
  title: string;
  slug: string;
  category: string;
  description: string;
  applicationDeadline?: string | null;
  requiredExperience: string;
  employmentType: 'Full-time' | 'Part-time' | 'Contract' | 'Internship' | 'Freelance';
  workMode: 'Remote' | 'Hybrid' | 'On-site';
  location: string;
  salaryMin: number;
  salaryMax: number;
  salaryPeriod?: 'Annual' | 'Monthly';
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
  status: 'draft' | 'published' | 'scheduled' | 'closed' | 'expired';
  scheduledFor?: string;
  featured: boolean;
  allowDirectApply: boolean;
  viewsCount: number;
  applicationsCount: number;
  publishedAt?: string;
  createdAt: string;
  hasApplied?: boolean;
  isSaved?: boolean;
}

export type ApplicationStatus =
  | 'Applied'
  | 'Shortlisted'
  | 'Interview Scheduled'
  | 'Selected'
  | 'Rejected'
  | 'Withdrawn';

export interface Application {
  _id: string;
  candidateId: string;
  jobId: string;
  recruiterId: string;
  companyId: string;
  resumeUrl: string;
  coverLetter: string;
  status: ApplicationStatus;
  statusHistory: Array<{
    previousStatus: string;
    newStatus: ApplicationStatus;
    updatedBy: string;
    updatedByName: string;
    message: string;
    timestamp: string;
  }>;
  recruiterNotes: string;
  internalFeedback: string;
  appliedAt: string;
  updatedAt: string;
  job?: Job | null;
  company?: Company | null;
  candidate?: User | null;
  candidateProfile?: CandidateProfile | null;
  interview?: Interview | null;
}

export interface Interview {
  _id: string;
  applicationId: string;
  jobId: string;
  candidateId: string;
  recruiterId: string;
  date: string;
  time: string;
  timezone: string;
  type: 'Online' | 'In-person' | 'Phone';
  meetingLinkOrLocation: string;
  interviewerName: string;
  instructions: string;
  notes: string;
  status: 'Scheduled' | 'Rescheduled' | 'Cancelled' | 'Completed';
  candidateConfirmed: boolean;
  job?: Job | null;
  company?: Company | null;
  candidate?: User | null;
  recruiter?: User | null;
}

export interface AppNotification {
  _id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  link: string;
  read: boolean;
  createdAt: string;
}

export interface EmailPreference {
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
  brevoSyncedAt?: string;
}
