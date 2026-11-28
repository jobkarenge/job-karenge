import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { PublicLayout } from './layouts/PublicLayout';
import { HomePage } from './pages/public/HomePage';
import { ProtectedRoute } from './routes/ProtectedRoute';

function lazyNamed<T extends Record<string, React.ComponentType<any>>>(
  loader: () => Promise<T>,
  exportName: keyof T
) {
  return lazy(async () => {
    const mod = await loader();
    return { default: mod[exportName] };
  });
}

const DashboardLayout = lazyNamed(() => import('./layouts/DashboardLayout'), 'DashboardLayout');

// Public & Auth routes (split out from landing bundle)
const BrowseJobsPage = lazyNamed(() => import('./pages/public/BrowseJobsPage'), 'BrowseJobsPage');
const JobDetailsPage = lazyNamed(() => import('./pages/public/JobDetailsPage'), 'JobDetailsPage');
const CompaniesPage = lazyNamed(() => import('./pages/public/CompaniesPage'), 'CompaniesPage');
const AboutPage = lazyNamed(() => import('./pages/public/StaticPages'), 'AboutPage');
const ContactPage = lazyNamed(() => import('./pages/public/StaticPages'), 'ContactPage');
const FaqPage = lazyNamed(() => import('./pages/public/StaticPages'), 'FaqPage');
const PrivacyPage = lazyNamed(() => import('./pages/public/StaticPages'), 'PrivacyPage');
const TermsPage = lazyNamed(() => import('./pages/public/StaticPages'), 'TermsPage');
const UnsubscribePage = lazyNamed(() => import('./pages/public/StaticPages'), 'UnsubscribePage');
const LoginPage = lazyNamed(() => import('./pages/auth/LoginPage'), 'LoginPage');
const RegisterPage = lazyNamed(() => import('./pages/auth/RegisterPage'), 'RegisterPage');
const VerifyEmailPage = lazyNamed(() => import('./pages/auth/AccountRecoveryPages'), 'VerifyEmailPage');
const ForgotPasswordPage = lazyNamed(() => import('./pages/auth/AccountRecoveryPages'), 'ForgotPasswordPage');
const ResetPasswordPage = lazyNamed(() => import('./pages/auth/AccountRecoveryPages'), 'ResetPasswordPage');
const AdminSetupPage = lazyNamed(() => import('./pages/auth/AccountRecoveryPages'), 'AdminSetupPage');

// Candidate dashboard (lazy chunk — isolates Recharts & forms)
const CandidateOverview = lazyNamed(() => import('./pages/candidate/CandidateOverview'), 'CandidateOverview');
const CandidateProfilePage = lazyNamed(() => import('./pages/candidate/CandidateProfilePage'), 'CandidateProfilePage');
const CandidateApplicationsPage = lazyNamed(() => import('./pages/candidate/CandidateApplicationsPage'), 'CandidateApplicationsPage');
const CandidateSavedJobsPage = lazyNamed(() => import('./pages/candidate/CandidateWorkspacePages'), 'CandidateSavedJobsPage');
const CandidateInterviewsPage = lazyNamed(() => import('./pages/candidate/CandidateWorkspacePages'), 'CandidateInterviewsPage');
const CandidateEmailPreferencesPage = lazyNamed(() => import('./pages/candidate/CandidateWorkspacePages'), 'CandidateEmailPreferencesPage');
const NotificationsPage = lazyNamed(() => import('./pages/candidate/CandidateWorkspacePages'), 'NotificationsPage');
const AccountSettingsPage = lazyNamed(() => import('./pages/candidate/CandidateWorkspacePages'), 'AccountSettingsPage');

// Recruiter dashboard (lazy chunk — isolates Recharts & heavy hiring tables)
const RecruiterOverview = lazyNamed(() => import('./pages/recruiter/RecruiterOverview'), 'RecruiterOverview');
const RecruiterCompanyPage = lazyNamed(() => import('./pages/recruiter/RecruiterCompanyPage'), 'RecruiterCompanyPage');
const RecruiterManageJobsPage = lazyNamed(() => import('./pages/recruiter/RecruiterManageJobsPage'), 'RecruiterManageJobsPage');
const RecruiterCreateJobPage = lazyNamed(() => import('./pages/recruiter/RecruiterCreateJobPage'), 'RecruiterCreateJobPage');
const RecruiterApplicationsPage = lazyNamed(() => import('./pages/recruiter/RecruiterApplicationsPage'), 'RecruiterApplicationsPage');
const RecruiterInterviewsPage = lazyNamed(() => import('./pages/recruiter/RecruiterInterviewsPage'), 'RecruiterInterviewsPage');

// Super Admin dashboard (lazy chunk)
const AdminOverview = lazyNamed(() => import('./pages/admin/AdminOverview'), 'AdminOverview');
const AdminUsersAndRecruitersPage = lazyNamed(() => import('./pages/admin/AdminUsersAndRecruitersPage'), 'AdminUsersAndRecruitersPage');
const AdminCompaniesAndJobsPage = lazyNamed(() => import('./pages/admin/AdminCompaniesAndJobsPage'), 'AdminCompaniesAndJobsPage');
const AdminCampaignsPage = lazyNamed(() => import('./pages/admin/AdminCampaignsPage'), 'AdminCampaignsPage');
const AdminGovernancePage = lazyNamed(() => import('./pages/admin/AdminGovernancePage'), 'AdminGovernancePage');

function RouteSuspenseFallback() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-4 min-h-[60vh]" aria-busy="true" aria-label="Loading page">
      <div className="h-8 w-64 rounded-lg bg-slate-200 dark:bg-slate-800 animate-pulse" />
      <div className="h-4 w-96 max-w-full rounded bg-slate-100 dark:bg-slate-800/70 animate-pulse" />
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        <div className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <div className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse" />
        <div className="h-44 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 animate-pulse hidden lg:block" />
      </div>
    </div>
  );
}

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || 'Unexpected application error' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-[#F8FAFC] dark:bg-[#0B1120] text-slate-900 dark:text-slate-100">
          <div className="max-w-md w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
            <h1 className="text-xl font-bold">Something went wrong</h1>
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.assign('/')}
              className="mt-5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] text-white"
            >
              Return Home
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <NotificationProvider>
            <BrowserRouter>
              <Toaster position="top-right" richColors />
              <Suspense fallback={<RouteSuspenseFallback />}>
                <Routes>
                  {/* Public Routes */}
                  <Route element={<PublicLayout />}>
                    <Route path="/" element={<HomePage />} />
                    <Route path="/jobs" element={<BrowseJobsPage />} />
                    <Route path="/jobs/:id" element={<JobDetailsPage />} />
                    <Route path="/companies" element={<CompaniesPage />} />
                    <Route path="/companies/:id" element={<CompaniesPage />} />
                    <Route path="/about" element={<AboutPage />} />
                    <Route path="/contact" element={<ContactPage />} />
                    <Route path="/faqs" element={<FaqPage />} />
                    <Route path="/privacy" element={<PrivacyPage />} />
                    <Route path="/terms" element={<TermsPage />} />
                    <Route path="/unsubscribe" element={<UnsubscribePage />} />
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/verify-email" element={<VerifyEmailPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/reset-password" element={<ResetPasswordPage />} />
                    <Route path="/admin/setup" element={<AdminSetupPage />} />
                  </Route>

                  {/* Candidate Dashboard */}
                  <Route element={<ProtectedRoute allowedRoles={['candidate']} />}>
                    <Route path="/candidate" element={<DashboardLayout role="candidate" />}>
                      <Route index element={<CandidateOverview />} />
                      <Route path="profile" element={<CandidateProfilePage />} />
                      <Route path="saved" element={<CandidateSavedJobsPage />} />
                      <Route path="applications" element={<CandidateApplicationsPage />} />
                      <Route path="interviews" element={<CandidateInterviewsPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="email-preferences" element={<CandidateEmailPreferencesPage />} />
                      <Route path="settings" element={<AccountSettingsPage />} />
                    </Route>
                  </Route>

                  {/* Recruiter Dashboard */}
                  <Route element={<ProtectedRoute allowedRoles={['recruiter']} />}>
                    <Route path="/recruiter" element={<DashboardLayout role="recruiter" />}>
                      <Route index element={<RecruiterOverview />} />
                      <Route path="company" element={<RecruiterCompanyPage />} />
                      <Route path="jobs" element={<RecruiterManageJobsPage />} />
                      <Route path="jobs/new" element={<RecruiterCreateJobPage />} />
                      <Route path="jobs/:id/edit" element={<RecruiterCreateJobPage />} />
                      <Route path="applications" element={<RecruiterApplicationsPage />} />
                      <Route path="interviews" element={<RecruiterInterviewsPage />} />
                      <Route path="notifications" element={<NotificationsPage />} />
                      <Route path="settings" element={<AccountSettingsPage />} />
                    </Route>
                  </Route>

                  {/* Super Admin Dashboard */}
                  <Route element={<ProtectedRoute allowedRoles={['admin']} />}>
                    <Route path="/admin" element={<DashboardLayout role="admin" />}>
                      <Route index element={<AdminOverview />} />
                      <Route path="users" element={<AdminUsersAndRecruitersPage />} />
                      <Route path="companies-jobs" element={<AdminCompaniesAndJobsPage />} />
                      <Route path="campaigns" element={<AdminCampaignsPage />} />
                      <Route path="governance" element={<AdminGovernancePage />} />
                    </Route>
                  </Route>

                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
