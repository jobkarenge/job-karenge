import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { JobCard } from '../../components/jobs/JobCard';
import { api } from '../../services/api';
import type { Application, Interview, Job } from '../../types';
import { formatShortDate } from '../../utils/formatters';

interface CandidateDashboardData {
  stats: {
    totalApplications: number;
    underReview: number;
    shortlisted: number;
    interviewScheduled: number;
    selected: number;
    rejected: number;
    savedJobs: number;
  };
  completionPercentage: number;
  recentApplications: Application[];
  upcomingInterviews: Interview[];
  recommendedJobs: Job[];
}

export function CandidateOverview() {
  const navigate = useNavigate();
  const [data, setData] = useState<CandidateDashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get('/candidate/dashboard')
      .then((res) => setData(res.data.data))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <SkeletonList rows={4} />;
  if (!data) return null;

  const chartData = [
    { stage: 'Applied', count: data.stats.underReview },
    { stage: 'Shortlisted', count: data.stats.shortlisted },
    { stage: 'Interview', count: data.stats.interviewScheduled },
    { stage: 'Selected', count: data.stats.selected },
    { stage: 'Rejected', count: data.stats.rejected },
  ];

  const kpis = [
    { label: 'Total Applications', value: data.stats.totalApplications, to: '/candidate/applications' },
    { label: 'Under Review', value: data.stats.underReview, to: '/candidate/applications?status=Applied' },
    { label: 'Shortlisted', value: data.stats.shortlisted, to: '/candidate/applications?status=Shortlisted' },
    { label: 'Scheduled Interviews', value: data.stats.interviewScheduled, to: '/candidate/interviews' },
    { label: 'Selected', value: data.stats.selected, to: '/candidate/applications?status=Selected' },
    { label: 'Rejected', value: data.stats.rejected, to: '/candidate/applications?status=Rejected' },
  ];

  return (
    <div className="space-y-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Candidate Overview</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track active applications, upcoming interviews, and recommended roles.
          </p>
        </div>
        <Link
          to="/candidate/profile"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] transition-colors whitespace-nowrap"
        >
          Profile {data.completionPercentage}% Complete
        </Link>
      </div>

      {/* Profile Completion Bar */}
      <Link
        to="/candidate/profile"
        className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all"
      >
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium text-slate-800 dark:text-slate-200">Profile &amp; Resume Readiness</span>
          <span className="font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{data.completionPercentage}%</span>
        </div>
        <div className="mt-2.5 h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className="h-full bg-blue-600 transition-all duration-300"
            style={{ width: `${data.completionPercentage}%` }}
          />
        </div>
      </Link>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        {kpis.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="block rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 hover:border-blue-400 dark:hover:border-blue-600 hover:shadow-sm transition-all"
          >
            <p className="text-xs text-slate-500 dark:text-slate-400">{item.label}</p>
            <p className="mt-2 text-2xl font-bold text-slate-900 dark:text-white tabular-nums">{item.value}</p>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Application Funnel</h2>
            <Link to="/candidate/applications" className="text-xs font-medium text-blue-600 hover:underline">
              View applications
            </Link>
          </div>
          <div className="mt-4 h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="stage" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="#2563EB" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Upcoming Interviews</h2>
            <Link to="/candidate/interviews" className="text-xs font-medium text-blue-600 hover:underline">
              View all
            </Link>
          </div>
          {data.upcomingInterviews.length === 0 ? (
            <p className="mt-6 text-sm text-slate-500">No upcoming interviews scheduled yet.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {data.upcomingInterviews.map((item) => (
                <Link
                  key={item._id}
                  to="/candidate/interviews"
                  className="block p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:border-blue-400 dark:hover:border-blue-600 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.job?.title || 'Interview'}</p>
                  <p className="mt-1 text-xs text-slate-500 tabular-nums">
                    {item.date} · {item.time} ({item.type})
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Applications */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Recently Applied Jobs</h2>
          <Link to="/candidate/applications" className="text-xs font-medium text-blue-600 hover:underline">
            Track all
          </Link>
        </div>
        {data.recentApplications.length === 0 ? (
          <div className="p-6">
            <EmptyState
              title="No applications yet"
              description="Browse live roles and submit your first application with your verified PDF resume."
              actionLabel="Browse Jobs"
              onAction={() => navigate('/jobs')}
            />
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.recentApplications.map((app) => (
              <div key={app._id} className="px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <Link to={`/jobs/${app.jobId}`} className="text-sm font-semibold text-slate-900 dark:text-white hover:text-blue-600">
                    {app.job?.title || 'Role'}
                  </Link>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {app.job?.companyName} · Applied {formatShortDate(app.appliedAt)}
                  </p>
                </div>
                <StatusIndicator status={app.status} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recommended Jobs */}
      {data.recommendedJobs.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Recommended for Your Profile</h2>
          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-5">
            {data.recommendedJobs.map((job) => (
              <JobCard key={job._id} job={job} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
