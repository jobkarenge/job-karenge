import { Copy, Edit2, Eye, Trash2, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Job } from '../../types';
import { formatShortDate } from '../../utils/formatters';

export function RecruiterManageJobsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const activeStatus = searchParams.get('status') || 'all';

  const load = () => {
    setLoading(true);
    api
      .get('/recruiter/jobs')
      .then((res) => setJobs(res.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleStatusChange = async (id: string, status: string) => {
    try {
      const res = await api.patch(`/jobs/${id}/status`, { status });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await api.post(`/jobs/${id}/duplicate`);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await api.delete(`/jobs/${deleteId}`);
      toast.success('Job deleted.');
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const filteredJobs = jobs.filter((job) => {
    if (activeStatus === 'all') return true;
    if (activeStatus === 'closed') return job.status === 'closed' || job.status === 'expired';
    return job.status === activeStatus;
  });

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Manage Jobs</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Publish, edit, duplicate, close, or review applicants across your listings.
          </p>
        </div>
        <Link
          to="/recruiter/jobs/new"
          className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white whitespace-nowrap"
        >
          Create Job
        </Link>
      </div>

      {jobs.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {[
            { key: 'all', label: 'All' },
            { key: 'published', label: 'Active' },
            { key: 'draft', label: 'Drafts' },
            { key: 'scheduled', label: 'Scheduled' },
            { key: 'closed', label: 'Closed / Expired' },
          ].map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSearchParams(tab.key === 'all' ? {} : { status: tab.key })}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                activeStatus === tab.key
                  ? 'bg-[#102A43] dark:bg-blue-600 text-white border-transparent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {filteredJobs.length === 0 ? (
        <EmptyState
          title={jobs.length === 0 ? 'No job postings yet' : 'No jobs match this status filter'}
          description={
            jobs.length === 0
              ? 'Create your first job listing to start receiving applications.'
              : 'Try viewing all job statuses or create a new job posting.'
          }
          actionLabel={jobs.length === 0 ? 'Create Job' : 'View All Jobs'}
          onAction={() => (jobs.length === 0 ? navigate('/recruiter/jobs/new') : setSearchParams({}))}
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Role</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Applicants</th>
                <th className="py-3.5 px-4 font-semibold text-right">Views</th>
                <th className="py-3.5 px-4 font-semibold">Deadline</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredJobs.map((job) => (
                <tr key={job._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                  <td className="py-3.5 px-4">
                    <p className="font-semibold text-slate-900 dark:text-white">{job.title}</p>
                    <p className="text-xs text-slate-500">
                      {job.companyName} · {job.location} · {job.workMode}
                    </p>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusIndicator status={job.status} />
                  </td>
                  <td className="py-3.5 px-4 text-right tabular-nums">{job.applicationsCount}</td>
                  <td className="py-3.5 px-4 text-right tabular-nums">{job.viewsCount}</td>
                  <td className="py-3.5 px-4 text-xs text-slate-500 tabular-nums">
                    {job.applicationDeadline ? formatShortDate(job.applicationDeadline) : 'No deadline'}
                  </td>
                  <td className="py-3.5 px-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <Link
                        to={`/recruiter/applications?jobId=${job._id}`}
                        title="View applicants"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <Users className="w-4 h-4" />
                      </Link>
                      <Link
                        to={`/jobs/${job._id}`}
                        title="Preview"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link
                        to={`/recruiter/jobs/${job._id}/edit`}
                        title="Edit"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Link>
                      <button
                        type="button"
                        onClick={() => handleDuplicate(job._id)}
                        title="Duplicate"
                        className="p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      {job.status === 'published' ? (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(job._id, 'closed')}
                          className="px-2 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700"
                        >
                          Close
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleStatusChange(job._id, 'published')}
                          className="px-2 py-1 text-xs font-medium rounded border border-blue-200 text-blue-600"
                        >
                          Publish
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setDeleteId(job._id)}
                        title="Delete"
                        className="p-1.5 rounded hover:bg-rose-50 dark:hover:bg-rose-950/30 text-rose-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteId)}
        title="Delete Job Listing"
        message="Are you sure you want to permanently remove this job listing?"
        confirmLabel="Delete Job"
        danger
        onConfirm={handleDelete}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
