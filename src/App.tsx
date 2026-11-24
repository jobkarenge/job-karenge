import React from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';
import { AuthProvider } from './context/AuthContext';
import { NotificationProvider } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { DashboardLayout } from './layouts/DashboardLayout';
import { PublicLayout } from './layouts/PublicLayout';
import {
  AdminSetupPage,
  ForgotPasswordPage,
  ResetPasswordPage,
  VerifyEmailPage,
} from './pages/auth/AccountRecoveryPages';
import { LoginPage } from './pages/auth/LoginPage';
import { RegisterPage } from './pages/auth/RegisterPage';
import { AdminCampaignsPage, AdminGovernancePage } from './pages/admin/AdminCampaignsAndLogsPage';
import { AdminCompaniesAndJobsPage } from './pages/admin/AdminCompaniesAndJobsPage';
import { AdminOverview } from './pages/admin/AdminOverview';
import { AdminUsersAndRecruitersPage } from './pages/admin/AdminUsersAndRecruitersPage';
import { CandidateApplicationsPage } from './pages/candidate/CandidateApplicationsPage';
import { CandidateOverview } from './pages/candidate/CandidateOverview';
import { CandidateProfilePage } from './pages/candidate/CandidateProfilePage';
import {
  AccountSettingsPage,
  CandidateEmailPreferencesPage,
  CandidateInterviewsPage,
  CandidateSavedJobsPage,
  NotificationsPage,
} from './pages/candidate/CandidateWorkspacePages';
import { BrowseJobsPage } from './pages/public/BrowseJobsPage';
import { CompaniesPage } from './pages/public/CompaniesPage';
import { HomePage } from './pages/public/HomePage';
import { JobDetailsPage } from './pages/public/JobDetailsPage';
import {
  AboutPage,
  ContactPage,
  FaqPage,
  PrivacyPage,
  TermsPage,
  UnsubscribePage,
} from './pages/public/StaticPages';
import { RecruiterApplicationsPage } from './pages/recruiter/RecruiterApplicationsPage';
import { RecruiterCompanyPage } from './pages/recruiter/RecruiterCompanyPage';
import { RecruiterCreateJobPage } from './pages/recruiter/RecruiterCreateJobPage';
import { RecruiterInterviewsPage } from './pages/recruiter/RecruiterInterviewsPage';
import { RecruiterManageJobsPage } from './pages/recruiter/RecruiterManageJobsPage';
import { RecruiterOverview } from './pages/recruiter/RecruiterOverview';
import { ProtectedRoute } from './routes/ProtectedRoute';

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
            </BrowserRouter>
          </NotificationProvider>
        </AuthProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  );
}
