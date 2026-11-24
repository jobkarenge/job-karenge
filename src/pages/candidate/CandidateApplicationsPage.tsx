import { Check, Calendar } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Application } from '../../types';
import { formatShortDate } from '../../utils/formatters';

const PIPELINE_STEPS = ['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected'] as const;

export function CandidateApplicationsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [withdrawId, setWithdrawId] = useState<string | null>(null);
  const statusFilter = searchParams.get('status') || '';

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    api
      .get('/applications/my-applications')
      .then((res) => setApplications(res.data.data || []))
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => {
    load(true);
    const onNotif = () => load(false);
    window.addEventListener('jk:notification-received', onNotif);
    return () => window.removeEventListener('jk:notification-received', onNotif);
  }, []);

  const handleWithdraw = async () => {
    if (!withdrawId) return;
    try {
      const res = await api.patch(`/applications/${withdrawId}/withdraw`);
      toast.success(res.data.message);
      setWithdrawId(null);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const filteredApplications = statusFilter
    ? applications.filter((a) => a.status === statusFilter)
    : applications;

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">My Applications &amp; Live Tracking</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Follow every stage transition from application submission through final selection.
          </p>
        </div>
        {applications.length > 0 && (
          <select
            value={statusFilter}
            onChange={(e) => setSearchParams(e.target.value ? { status: e.target.value } : {})}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="">All Statuses</option>
            <option value="Applied">Applied</option>
            <option value="Shortlisted">Shortlisted</option>
            <option value="Interview Scheduled">Interview Scheduled</option>
            <option value="Selected">Selected</option>
            <option value="Rejected">Rejected</option>
            <option value="Withdrawn">Withdrawn</option>
          </select>
        )}
      </div>

      {filteredApplications.length === 0 ? (
        <EmptyState
          title={applications.length === 0 ? 'No applications submitted yet' : `No applications in "${statusFilter}"`}
          description={
            applications.length === 0
              ? 'Explore open positions across verified employers and submit your first application.'
              : 'Switch back to all statuses or explore more open roles.'
          }
          actionLabel={applications.length === 0 ? 'Browse Open Jobs' : 'Show All Applications'}
          onAction={() => (applications.length === 0 ? navigate('/jobs') : setSearchParams({}))}
        />
      ) : (
        <div className="space-y-5">
          {filteredApplications.map((app) => {
            const isTerminalNegative = app.status === 'Rejected' || app.status === 'Withdrawn';
            const activeIndex = PIPELINE_STEPS.indexOf(app.status as (typeof PIPELINE_STEPS)[number]);
            const canWithdraw = !['Selected', 'Rejected', 'Withdrawn'].includes(app.status);

            return (
              <div
                key={app._id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                  <div>
                    <Link
                      to={`/jobs/${app.jobId}`}
                      className="text-lg font-semibold text-slate-900 dark:text-white hover:text-blue-600"
                    >
                      {app.job?.title || 'Role'}
                    </Link>
                    <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
                      {app.companyId ? (
                        <Link to={`/companies/${app.companyId}`} className="font-medium hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                          {app.job?.companyName}
                        </Link>
                      ) : (
                        app.job?.companyName
                      )}{' '}
                      · {app.job?.location} · Applied {formatShortDate(app.appliedAt)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <StatusIndicator status={app.status} />
                    {canWithdraw && (
                      <button
                        type="button"
                        onClick={() => setWithdrawId(app._id)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                      >
                        Withdraw
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Timeline */}
                {isTerminalNegative ? (
                  <div className="p-4 rounded-lg border border-rose-200 dark:border-rose-900 bg-rose-50/70 dark:bg-rose-950/20 text-sm text-rose-800 dark:text-rose-200">
                    <strong>Terminal State: {app.status}</strong> — Updated on {formatShortDate(app.updatedAt)}.
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                    {PIPELINE_STEPS.map((step, idx) => {
                      const reached = activeIndex >= idx;
                      return (
                        <div key={step} className="space-y-2">
                          <div className="flex items-center gap-2">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                                reached
                                  ? 'bg-[#102A43] dark:bg-blue-600 text-white'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                              }`}
                            >
                              {reached ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                            </div>
                            <span
                              className={`text-xs font-medium ${
                                reached ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400'
                              }`}
                            >
                              {step}
                            </span>
                          </div>
                          <div
                            className={`h-1 rounded-full ${
                              reached ? 'bg-[#102A43] dark:bg-blue-600' : 'bg-slate-100 dark:bg-slate-800'
                            }`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}

                {app.interview && app.interview.status !== 'Cancelled' && (
                  <div className="p-4 rounded-lg border border-blue-200 dark:border-blue-900 bg-blue-50/60 dark:bg-blue-950/20 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <Calendar className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                      <div className="text-xs space-y-0.5">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">
                          {app.interview.type} Interview Scheduled · {app.interview.date} at {app.interview.time} ({app.interview.timezone})
                        </p>
                        <p className="text-slate-600 dark:text-slate-300">
                          Interviewer: {app.interview.interviewerName}
                          {app.interview.meetingLinkOrLocation?.trim()
                            ? ` · ${app.interview.meetingLinkOrLocation}`
                            : app.interview.type === 'In-person'
                              ? ' · In-person / Offline'
                              : ''}
                        </p>
                      </div>
                    </div>
                    <Link
                      to="/candidate/interviews"
                      className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
                    >
                      Manage Interview
                    </Link>
                  </div>
                )}

                {/* Audit History */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <p className="text-xs font-semibold text-slate-500 mb-2">Application Timeline</p>
                  <div className="space-y-1.5">
                    {app.statusHistory.map((h, i) => (
                      <div key={i} className="text-xs text-slate-600 dark:text-slate-400 flex flex-wrap items-center gap-2">
                        <span className="font-medium text-slate-900 dark:text-slate-200">{h.newStatus}</span>
                        <span>·</span>
                        <span>{h.message}</span>
                        <span>·</span>
                        <span className="tabular-nums text-slate-400">{formatShortDate(h.timestamp)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(withdrawId)}
        title="Withdraw Application"
        message="Are you sure you want to withdraw this application? This action notifies the recruiter and cannot be undone."
        confirmLabel="Withdraw Application"
        danger
        onConfirm={handleWithdraw}
        onCancel={() => setWithdrawId(null)}
      />
    </div>
  );
}
