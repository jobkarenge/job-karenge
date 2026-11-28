import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api } from '../../services/api';

const DashboardBarChart = lazy(() => import('../../components/charts/DashboardBarChart'));

interface AdminDashboardData {
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
  integrationStatus: {
    mongodbConfigured: boolean;
    cloudinaryConfigured: boolean;
    emailConfigured: boolean;
  };
}

export function AdminOverview() {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/admin/dashboard')
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonList rows={4} />;
  if (!data) return null;

  const kpis = [
    { label: 'Total Users', value: data.stats.totalUsers, to: '/admin/users?tab=users' },
    { label: 'Candidates', value: data.stats.candidates, to: '/admin/users?tab=users&role=candidate' },
    { label: 'Recruiters', value: data.stats.recruiters, to: '/admin/users?tab=users&role=recruiter' },
    { label: 'Pending Verifications', value: data.stats.pendingRecruiters, to: '/admin/users?tab=recruiters' },
    { label: 'Companies', value: data.stats.companies, to: '/admin/companies-jobs' },
    { label: 'Published Jobs', value: data.stats.publishedJobs, to: '/admin/companies-jobs' },
    { label: 'Applications', value: data.stats.totalApplications, to: '/admin/companies-jobs' },
    { label: 'Open Support Msgs', value: data.stats.unreadMessages, to: '/admin/governance' },
  ];

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Platform Administration</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Monitor recruitment activity, recruiter verifications, email campaigns, and service integrations.
        </p>
      </div>

      {/* Integration Status Strip */}
      <Link
        to="/admin/governance"
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 grid grid-cols-1 md:grid-cols-3 gap-4 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all"
      >
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">MongoDB Atlas</span>
          <StatusIndicator status={data.integrationStatus.mongodbConfigured ? 'Active' : 'Pending'} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Cloudinary Storage</span>
          <StatusIndicator status={data.integrationStatus.cloudinaryConfigured ? 'Active' : 'Pending'} />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Gmail SMTP Email</span>
          <StatusIndicator status={data.integrationStatus.emailConfigured ? 'Active' : 'Pending'} />
        </div>
      </Link>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <Link
            key={k.label}
            to={k.to}
            className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{k.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{k.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Jobs by Category</h2>
            <Link to="/admin/companies-jobs" className="text-xs font-medium text-blue-600 hover:underline">
              Manage categories
            </Link>
          </div>
          <div className="mt-4 h-64">
            <Suspense fallback={<div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
              <DashboardBarChart
                data={data.categoryBreakdown}
                xKey="name"
                barKey="jobs"
                barColor="#102A43"
                xFontSize={10}
              />
            </Suspense>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Platform Application Funnel</h2>
            <Link to="/admin/campaigns" className="text-xs font-medium text-blue-600 hover:underline">
              Email campaigns
            </Link>
          </div>
          <div className="mt-4 h-64">
            <Suspense fallback={<div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
              <DashboardBarChart
                data={data.applicationStatusBreakdown}
                xKey="status"
                barKey="count"
                barColor="#2563EB"
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
