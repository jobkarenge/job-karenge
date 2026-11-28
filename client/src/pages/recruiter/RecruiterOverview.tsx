import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api } from '../../services/api';

const DashboardBarChart = lazy(() => import('../../components/charts/DashboardBarChart'));

interface RecruiterDashboardData {
  verificationStatus: 'pending' | 'approved' | 'rejected';
  stats: {
    totalJobs: number;
    activeJobs: number;
    draftJobs: number;
    expiredJobs: number;
    totalApplications: number;
    newApplications: number;
    shortlisted: number;
    interviewsScheduled: number;
    selected: number;
  };
  statusDistribution: Array<{ name: string; count: number }>;
  applicationsByJob: Array<{ jobTitle: string; applications: number; views: number }>;
}

export function RecruiterOverview() {
  const [data, setData] = useState<RecruiterDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/recruiter/dashboard')
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonList rows={4} />;
  if (!data) return null;

  const kpis = [
    { label: 'Published Jobs', value: data.stats.totalJobs, to: '/recruiter/jobs' },
    { label: 'Active Jobs', value: data.stats.activeJobs, to: '/recruiter/jobs?status=published' },
    { label: 'Draft Jobs', value: data.stats.draftJobs, to: '/recruiter/jobs?status=draft' },
    { label: 'Expired / Closed', value: data.stats.expiredJobs, to: '/recruiter/jobs?status=closed' },
    { label: 'Total Applications', value: data.stats.totalApplications, to: '/recruiter/applications' },
    { label: 'New Applications', value: data.stats.newApplications, to: '/recruiter/applications?status=Applied' },
    { label: 'Shortlisted', value: data.stats.shortlisted, to: '/recruiter/applications?status=Shortlisted' },
    { label: 'Interviews Scheduled', value: data.stats.interviewsScheduled, to: '/recruiter/interviews' },
    { label: 'Selected Candidates', value: data.stats.selected, to: '/recruiter/applications?status=Selected' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Recruiter Overview</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Verification Status:</span>
            <StatusIndicator status={data.verificationStatus} />
          </div>
        </div>
        <Link
          to="/recruiter/jobs/new"
          className="px-4 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] whitespace-nowrap"
        >
          Post New Job
        </Link>
      </div>

      {data.verificationStatus !== 'approved' && (
        <Link
          to="/recruiter/company"
          className="block rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 p-5 text-sm text-amber-900 dark:text-amber-200 hover:border-amber-400 transition-colors"
        >
          <p className="font-semibold">
            {data.verificationStatus === 'pending'
              ? 'Recruiter Verification Pending'
              : 'Recruiter Verification Requires Attention'}
          </p>
          <p className="mt-1 text-xs">
            An administrator must approve your recruiter account before you can publish live jobs. Complete your Company Profile while verification is in review.
          </p>
        </Link>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
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
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Candidate Status Distribution</h2>
            <Link to="/recruiter/applications" className="text-xs font-medium text-blue-600 hover:underline">
              Open pipeline
            </Link>
          </div>
          <div className="mt-4 h-64">
            <Suspense fallback={<div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
              <DashboardBarChart data={data.statusDistribution} xKey="name" barKey="count" barColor="#2563EB" />
            </Suspense>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Applications by Job</h2>
            <Link to="/recruiter/jobs" className="text-xs font-medium text-blue-600 hover:underline">
              Manage jobs
            </Link>
          </div>
          <div className="mt-4 h-64">
            <Suspense fallback={<div className="h-full w-full rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />}>
              <DashboardBarChart
                data={data.applicationsByJob}
                xKey="jobTitle"
                barKey="applications"
                barColor="#102A43"
                xFontSize={11}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </div>
  );
}
