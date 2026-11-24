import {
  Award,
  Briefcase,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  Globe,
  GraduationCap,
  IndianRupee,
  Languages,
  Mail,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserCheck,
  X,
  XCircle,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getAccessToken, getApiErrorMessage } from '../../services/api';
import type { Application, ApplicationStatus, Company, Job } from '../../types';
import { formatSalaryRange, formatShortDate } from '../../utils/formatters';

const PIPELINE_STAGES: Array<{
  status: ApplicationStatus;
  label: string;
  description: string;
}> = [
  { status: 'Applied', label: 'Applied', description: 'Application received' },
  { status: 'Shortlisted', label: 'Shortlisted', description: 'Profile approved for next round' },
  { status: 'Interview Scheduled', label: 'Interview', description: 'Interview slot assigned' },
  { status: 'Selected', label: 'Selected', description: 'Offer / selection stage' },
  { status: 'Rejected', label: 'Rejected', description: 'Closed for this role' },
];

function safeExternalUrl(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return null;
}

function getCandidateLocation(app: Application): string {
  return (
    app.candidateProfile?.currentLocation?.trim() ||
    app.candidate?.location?.trim() ||
    app.job?.location?.trim() ||
    'Not specified'
  );
}

function getCompanyName(app: Application): string {
  return app.company?.name || app.job?.companyName || 'Company';
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function RecruiterApplicationsPage() {
  const [searchParams] = useSearchParams();
  const [allApplications, setAllApplications] = useState<Application[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  const [companyId, setCompanyId] = useState(searchParams.get('companyId') || '');
  const [jobId, setJobId] = useState(searchParams.get('jobId') || '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') || '');
  const [q, setQ] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [activeApp, setActiveApp] = useState<Application | null>(null);
  const [statusForm, setStatusForm] = useState({
    status: 'Shortlisted' as ApplicationStatus,
    message: '',
    recruiterNotes: '',
    internalFeedback: '',
  });
  const [savingStatus, setSavingStatus] = useState(false);

  const [scheduleApp, setScheduleApp] = useState<Application | null>(null);
  const [savingInterview, setSavingInterview] = useState(false);
  const [interviewForm, setInterviewForm] = useState({
    date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
    time: '11:00',
    timezone: 'Asia/Kolkata',
    type: 'Online' as 'Online' | 'In-person' | 'Phone',
    meetingLinkOrLocation: '',
    interviewerName: '',
    instructions: '',
    notes: '',
  });

  useEffect(() => {
    const loadMeta = () => {
      Promise.all([api.get('/recruiter/jobs'), api.get('/recruiter/companies')])
        .then(([jobsRes, companiesRes]) => {
          setJobs(jobsRes.data.data || []);
          setCompanies(companiesRes.data.data || []);
        })
        .catch(() => {
          // Non-fatal metadata load
        });
    };
    loadMeta();
    window.addEventListener('jk:companies-updated', loadMeta);
    return () => window.removeEventListener('jk:companies-updated', loadMeta);
  }, []);

  const loadApplications = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyId) params.set('companyId', companyId);
    if (jobId) params.set('jobId', jobId);
    if (q) params.set('q', q);

    try {
      const res = await api.get(`/recruiter/applications?${params.toString()}`);
      const list: Application[] = res.data.data || [];
      setAllApplications(list);
      setActiveApp((prev) => (prev ? list.find((item) => item._id === prev._id) || prev : null));
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [companyId, jobId, q]);

  useEffect(() => {
    const t = setTimeout(loadApplications, 200);
    return () => clearTimeout(t);
  }, [loadApplications]);

  const stageCounts = useMemo(() => {
    const counts: Record<string, number> = {
      All: allApplications.length,
      Applied: 0,
      Shortlisted: 0,
      'Interview Scheduled': 0,
      Selected: 0,
      Rejected: 0,
      Withdrawn: 0,
    };
    for (const app of allApplications) {
      counts[app.status] = (counts[app.status] || 0) + 1;
    }
    return counts;
  }, [allApplications]);

  const applications = useMemo(() => {
    if (!statusFilter) return allApplications;
    return allApplications.filter((app) => app.status === statusFilter);
  }, [allApplications, statusFilter]);

  const filteredJobOptions = useMemo(() => {
    if (!companyId) return jobs;
    return jobs.filter((j) => j.companyId === companyId);
  }, [jobs, companyId]);

  const handleOpenCandidate = (app: Application) => {
    setActiveApp(app);
    setStatusForm({
      status: app.status === 'Withdrawn' ? 'Rejected' : app.status,
      message: '',
      recruiterNotes: app.recruiterNotes || '',
      internalFeedback: app.internalFeedback || '',
    });
  };

  const handleOpenScheduleModal = (app: Application) => {
    setScheduleApp(app);
    if (app.interview) {
      setInterviewForm({
        date: app.interview.date || new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
        time: app.interview.time || '11:00',
        timezone: app.interview.timezone || 'Asia/Kolkata',
        type: app.interview.type || 'Online',
        meetingLinkOrLocation: app.interview.meetingLinkOrLocation || '',
        interviewerName: app.interview.interviewerName || '',
        instructions: app.interview.instructions || '',
        notes: app.interview.notes || '',
      });
    } else {
      setInterviewForm({
        date: new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10),
        time: '11:00',
        timezone: 'Asia/Kolkata',
        type: 'Online',
        meetingLinkOrLocation: '',
        interviewerName: '',
        instructions: '',
        notes: '',
      });
    }
  };

  const handleUpdateApplication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeApp) return;
    setSavingStatus(true);
    try {
      await api.patch(`/recruiter/applications/${activeApp._id}/status`, statusForm);
      toast.success('Application stage updated & candidate notified.');
      await loadApplications();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSavingStatus(false);
    }
  };

  const handleBulkAction = async (status: 'Shortlisted' | 'Rejected') => {
    if (selectedIds.size === 0) return;
    try {
      const res = await api.post('/recruiter/applications/bulk-status', {
        applicationIds: Array.from(selectedIds),
        status,
      });
      toast.success(res.data.message);
      setSelectedIds(new Set());
      loadApplications();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleScheduleInterview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!scheduleApp) return;
    setSavingInterview(true);
    try {
      let res;
      const isReschedule = Boolean(scheduleApp.interview && scheduleApp.interview.status !== 'Cancelled');
      if (isReschedule) {
        res = await api.put(`/interviews/${scheduleApp.interview!._id}`, {
          date: interviewForm.date,
          time: interviewForm.time,
          timezone: interviewForm.timezone,
          type: interviewForm.type,
          meetingLinkOrLocation: interviewForm.meetingLinkOrLocation,
          interviewerName: interviewForm.interviewerName,
          instructions: interviewForm.instructions,
          notes: interviewForm.notes,
        });
      } else {
        res = await api.post('/interviews', {
          applicationId: scheduleApp._id,
          ...interviewForm,
        });
      }
      const { emailStatus, emailError } = res.data || {};
      if (emailStatus === 'failed') {
        toast.warning(
          `Interview ${isReschedule ? 'rescheduled' : 'scheduled'} & candidate notified in-app, but email failed: ${emailError || 'Check Brevo sender configuration.'}`
        );
      } else if (emailStatus === 'simulated') {
        toast.success(
          `Interview ${isReschedule ? 'rescheduled' : 'scheduled'} & candidate notified in-app (email logged in preview mode).`
        );
      } else {
        toast.success(
          isReschedule
            ? 'Interview rescheduled. Notification & email sent to candidate.'
            : 'Interview scheduled. Notification & email invite sent to candidate.'
        );
      }
      setScheduleApp(null);
      await loadApplications();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSavingInterview(false);
    }
  };

  const handleDownloadResume = async (app: Application) => {
    if (!app.resumeUrl) {
      toast.error('No resume uploaded for this candidate.');
      return;
    }
    if (app.resumeUrl.startsWith('http')) {
      const a = document.createElement('a');
      a.href = app.resumeUrl;
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      a.download = `${(app.candidate?.name || 'candidate').replace(/\s+/g, '-')}-resume.pdf`;
      a.click();
      return;
    }
    try {
      const res = await fetch(app.resumeUrl, {
        headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
      });
      if (!res.ok) throw new Error('Unable to access resume PDF');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${(app.candidate?.name || 'candidate').replace(/\s+/g, '-')}-resume.pdf`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (jobId) params.set('jobId', jobId);
      if (companyId) params.set('companyId', companyId);
      if (statusFilter) params.set('status', statusFilter);

      const res = await fetch(`/api/recruiter/applications/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${getAccessToken() || ''}` },
      });
      if (!res.ok) throw new Error('Failed to export application report');
      const text = await res.text();
      const blob = new Blob([text], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'job-karenge-applicants.csv';
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Applicant Pipeline</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Track candidate applications across your companies, inspect resumes, manage stages, and schedule interviews.
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportCsv}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 shrink-0"
        >
          <Download className="w-4 h-4" />
          <span>Export CSV</span>
        </button>
      </div>

      {/* Stage Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: '', label: 'All Applicants', count: stageCounts.All, accent: 'border-slate-200 dark:border-slate-800' },
          { key: 'Applied', label: 'Applied', count: stageCounts.Applied, accent: 'border-slate-200 dark:border-slate-800' },
          { key: 'Shortlisted', label: 'Shortlisted', count: stageCounts.Shortlisted, accent: 'border-blue-200 dark:border-blue-900/50' },
          {
            key: 'Interview Scheduled',
            label: 'Interview',
            count: stageCounts['Interview Scheduled'],
            accent: 'border-indigo-200 dark:border-indigo-900/50',
          },
          { key: 'Selected', label: 'Selected', count: stageCounts.Selected, accent: 'border-emerald-200 dark:border-emerald-900/50' },
          { key: 'Rejected', label: 'Rejected', count: stageCounts.Rejected, accent: 'border-rose-200 dark:border-rose-900/50' },
        ].map((card) => {
          const isActive = statusFilter === card.key;
          return (
            <button
              key={card.label}
              type="button"
              onClick={() => {
                setStatusFilter(card.key);
                setSelectedIds(new Set());
              }}
              className={`text-left rounded-xl border p-3.5 transition-all ${
                isActive
                  ? 'border-[#102A43] dark:border-blue-500 bg-[#102A43] dark:bg-blue-600 text-white shadow-sm'
                  : `${card.accent} bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700`
              }`}
            >
              <p className={`text-xs font-medium ${isActive ? 'text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                {card.label}
              </p>
              <p className={`mt-1 text-2xl font-bold tabular-nums ${isActive ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                {card.count}
              </p>
            </button>
          );
        })}
      </div>

      {/* Filters & Bulk Controls */}
      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 flex flex-col xl:flex-row xl:items-center justify-between gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 flex-1">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name, company, role, location, skill..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>

          <select
            value={companyId}
            onChange={(e) => {
              setCompanyId(e.target.value);
              setJobId('');
            }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="">All Companies</option>
            {companies.map((c) => (
              <option key={c._id} value={c._id}>
                {c.name}
              </option>
            ))}
          </select>

          <select
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="">All Roles</option>
            {filteredJobOptions.map((j) => (
              <option key={j._id} value={j._id}>
                {j.title}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="">All Stages</option>
            {['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected', 'Withdrawn'].map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-medium text-slate-500 tabular-nums">{selectedIds.size} selected</span>
            <button
              type="button"
              onClick={() => handleBulkAction('Shortlisted')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
            >
              Bulk Shortlist
            </button>
            <button
              type="button"
              onClick={() => handleBulkAction('Rejected')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-rose-600 text-white hover:bg-rose-700"
            >
              Bulk Reject
            </button>
          </div>
        )}
      </div>

      {/* Applicants Table */}
      {loading ? (
        <SkeletonList rows={4} />
      ) : applications.length === 0 ? (
        <EmptyState
          title="No applications matching filters"
          description="Applications submitted to your job postings will appear here with candidate profiles, resumes, and interview actions."
        />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500 bg-slate-50/70 dark:bg-slate-800/30">
              <tr>
                <th className="py-3.5 px-4 w-10">
                  <input
                    type="checkbox"
                    aria-label="Select all applications"
                    checked={selectedIds.size === applications.length && applications.length > 0}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedIds(new Set(applications.map((a) => a._id)));
                      else setSelectedIds(new Set());
                    }}
                  />
                </th>
                <th className="py-3.5 px-4 font-semibold">Candidate</th>
                <th className="py-3.5 px-4 font-semibold">Company</th>
                <th className="py-3.5 px-4 font-semibold">Role</th>
                <th className="py-3.5 px-4 font-semibold">Experience</th>
                <th className="py-3.5 px-4 font-semibold">Location</th>
                <th className="py-3.5 px-4 font-semibold">Stage</th>
                <th className="py-3.5 px-4 font-semibold">Applied</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {applications.map((app) => {
                const candidateLocation = getCandidateLocation(app);
                const companyName = getCompanyName(app);
                const expYears = app.candidateProfile?.totalExperienceYears ?? 0;
                const skills = (app.candidateProfile?.technicalSkills || []).map((s) => s.name);

                return (
                  <tr key={app._id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                    <td className="py-3.5 px-4 align-top">
                      <input
                        type="checkbox"
                        aria-label={`Select ${app.candidate?.name || 'applicant'}`}
                        checked={selectedIds.has(app._id)}
                        onChange={(e) => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(app._id);
                          else next.delete(app._id);
                          setSelectedIds(next);
                        }}
                      />
                    </td>

                    {/* Candidate Name + Contact */}
                    <td className="py-3.5 px-4 align-top">
                      <button
                        type="button"
                        onClick={() => handleOpenCandidate(app)}
                        className="text-left group"
                      >
                        <p className="font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400">
                          {app.candidate?.name || 'Candidate'}
                        </p>
                      </button>
                      {(app.candidateProfile?.designation || app.candidateProfile?.headline) && (
                        <p className="text-xs text-slate-600 dark:text-slate-300 truncate max-w-[200px]">
                          {app.candidateProfile.designation || app.candidateProfile.headline}
                        </p>
                      )}
                      <p className="text-xs text-slate-500 mt-0.5 truncate max-w-[220px]">
                        {app.candidate?.email}
                        {app.candidate?.phone ? ` · ${app.candidate.phone}` : ''}
                      </p>
                    </td>

                    {/* Company applied to */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex items-center gap-2.5 min-w-[140px]">
                        {app.company?.logoUrl ? (
                          <img
                            src={app.company.logoUrl}
                            alt={companyName}
                            referrerPolicy="no-referrer"
                            className="w-7 h-7 rounded-md object-cover border border-slate-200 dark:border-slate-700 shrink-0 bg-white"
                          />
                        ) : (
                          <div className="w-7 h-7 rounded-md bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <Building2 className="w-3.5 h-3.5 text-slate-500" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="font-medium text-slate-900 dark:text-slate-100 truncate max-w-[160px]">
                            {companyName}
                          </p>
                          {app.company?.industry && (
                            <p className="text-[11px] text-slate-500 truncate max-w-[160px]">{app.company.industry}</p>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-3.5 px-4 align-top">
                      <p className="font-medium text-slate-800 dark:text-slate-200 max-w-[180px] truncate">
                        {app.job?.title || 'Job Role'}
                      </p>
                      {app.job && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {app.job.workMode} · {app.job.employmentType}
                        </p>
                      )}
                    </td>

                    {/* Experience */}
                    <td className="py-3.5 px-4 align-top text-xs text-slate-600 dark:text-slate-400">
                      <p className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                        {expYears} {expYears === 1 ? 'yr' : 'yrs'}
                      </p>
                      <p className="truncate max-w-[170px] mt-0.5 text-slate-500">
                        {skills.length > 0 ? skills.slice(0, 3).join(', ') : 'View profile'}
                      </p>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-4 align-top text-xs text-slate-600 dark:text-slate-300">
                      <div className="inline-flex items-center gap-1 max-w-[150px]">
                        <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{candidateLocation}</span>
                      </div>
                    </td>

                    {/* Stage */}
                    <td className="py-3.5 px-4 align-top">
                      <StatusIndicator status={app.status} />
                      {app.interview && app.interview.status !== 'Cancelled' && (
                        <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-1 tabular-nums">
                          {app.interview.date} · {app.interview.time}
                        </p>
                      )}
                    </td>

                    {/* Applied Date */}
                    <td className="py-3.5 px-4 align-top text-xs text-slate-500 tabular-nums whitespace-nowrap">
                      {formatShortDate(app.appliedAt)}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleDownloadResume(app)}
                          title="Download Resume PDF"
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenScheduleModal(app)}
                          title={app.interview ? 'Reschedule Interview' : 'Schedule Interview'}
                          className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300"
                        >
                          <Calendar className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenCandidate(app)}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors"
                        >
                          Open
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Open Candidate Profile & Application Detail Modal */}
      {activeApp && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-3 sm:p-5">
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`Candidate application for ${activeApp.candidate?.name || 'Applicant'}`}
            className="w-full max-w-5xl max-h-[92vh] overflow-y-auto rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl"
          >
            {/* Sticky Modal Header */}
            <div className="sticky top-0 z-10 border-b border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur px-6 py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5 min-w-0">
                <div className="w-12 h-12 rounded-xl bg-[#102A43] dark:bg-blue-600 text-white font-bold text-lg flex items-center justify-center shrink-0">
                  {(activeApp.candidate?.name || 'C').slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white truncate">
                      {activeApp.candidate?.name || 'Candidate'}
                    </h2>
                    <StatusIndicator status={activeApp.status} />
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                    {activeApp.candidateProfile?.headline ||
                      activeApp.candidateProfile?.designation ||
                      `Applicant for ${activeApp.job?.title || 'Role'}`}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    {activeApp.candidate?.email && (
                      <a
                        href={`mailto:${activeApp.candidate.email}`}
                        className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{activeApp.candidate.email}</span>
                      </a>
                    )}
                    {activeApp.candidate?.phone ? (
                      <a
                        href={`tel:${activeApp.candidate.phone}`}
                        className="inline-flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{activeApp.candidate.phone}</span>
                      </a>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-slate-400">
                        <Phone className="w-3.5 h-3.5" />
                        <span>Mobile not provided</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{getCandidateLocation(activeApp)}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Applied {formatShortDate(activeApp.appliedAt)}</span>
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {activeApp.resumeUrl && safeExternalUrl(activeApp.resumeUrl) ? (
                  <a
                    href={activeApp.resumeUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    download={`${(activeApp.candidate?.name || 'candidate').replace(/\s+/g, '-')}-resume.pdf`}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Resume</span>
                    {activeApp.candidateProfile?.resumeSizeBytes ? (
                      <span className="text-[11px] text-slate-400 font-normal">
                        ({formatFileSize(activeApp.candidateProfile.resumeSizeBytes)})
                      </span>
                    ) : null}
                  </a>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleDownloadResume(activeApp)}
                    disabled={!activeApp.resumeUrl}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>{activeApp.resumeUrl ? 'Download Resume' : 'No Resume'}</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleOpenScheduleModal(activeApp)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>{activeApp.interview ? 'Reschedule Interview' : 'Schedule Interview'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveApp(null)}
                  aria-label="Close candidate details"
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Status in Cards (Visual Stage Pipeline) */}
              <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Application Stage</h3>
                    <p className="text-xs text-slate-500">
                      Click any stage card below to select it in the update form, or view milestone history.
                    </p>
                  </div>
                  {activeApp.status === 'Withdrawn' && (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 text-xs font-semibold">
                      <XCircle className="w-3.5 h-3.5" /> Withdrawn by Candidate
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
                  {PIPELINE_STAGES.map((stage) => {
                    const isCurrent = activeApp.status === stage.status;
                    const isSelectedInForm = statusForm.status === stage.status;
                    const historyMatch = [...(activeApp.statusHistory || [])]
                      .reverse()
                      .find((h) => h.newStatus === stage.status);

                    const cardColor = isCurrent
                      ? stage.status === 'Rejected'
                        ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40'
                        : stage.status === 'Selected'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40'
                          : 'border-blue-600 bg-blue-50 dark:bg-blue-950/40'
                      : isSelectedInForm
                        ? 'border-slate-400 dark:border-slate-500 bg-white dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900';

                    return (
                      <button
                        key={stage.status}
                        type="button"
                        onClick={() => setStatusForm((prev) => ({ ...prev, status: stage.status }))}
                        className={`text-left rounded-xl border p-3 transition-all hover:border-blue-400 ${cardColor}`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-semibold text-slate-900 dark:text-white">{stage.label}</span>
                          {isCurrent ? (
                            stage.status === 'Rejected' ? (
                              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                            ) : (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )
                          ) : historyMatch ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          ) : null}
                        </div>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">{stage.description}</p>
                        <p className="text-[10px] text-slate-400 mt-1.5 tabular-nums">
                          {isCurrent
                            ? `Current · ${formatShortDate(historyMatch?.timestamp || activeApp.updatedAt)}`
                            : historyMatch
                              ? `Reached ${formatShortDate(historyMatch.timestamp)}`
                              : isSelectedInForm
                                ? 'Selected to save'
                                : 'Click to select'}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Main 2-Column Content */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                {/* Left Column: Candidate Full Profile & Resume Info */}
                <div className="lg:col-span-7 space-y-5">
                  {/* Quick Highlights */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Experience</p>
                      <p className="mt-1 text-base font-bold text-slate-900 dark:text-white tabular-nums">
                        {activeApp.candidateProfile?.totalExperienceYears ?? 0} yrs
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Expected Salary</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {activeApp.candidateProfile?.expectedSalary || 'Not specified'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Applied Company</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-white truncate">
                        {getCompanyName(activeApp)}
                      </p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
                      <p className="text-[11px] text-slate-500">Profile Score</p>
                      <p className="mt-1 text-base font-bold text-slate-900 dark:text-white tabular-nums">
                        {activeApp.candidateProfile?.completionPercentage ?? 0}%
                      </p>
                    </div>
                  </div>

                  {/* Contact & Resume Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                      <UserCheck className="w-4 h-4 text-blue-600" />
                      <span>Candidate Contact &amp; Resume</span>
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-slate-500 block">Full Name</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{activeApp.candidate?.name || '—'}</span>
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-slate-500 block">Email Address</span>
                        {activeApp.candidate?.email ? (
                          <a href={`mailto:${activeApp.candidate.email}`} className="font-semibold text-blue-600 dark:text-blue-400 break-all">
                            {activeApp.candidate.email}
                          </a>
                        ) : (
                          <span className="font-medium">—</span>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-slate-500 block">Mobile Number</span>
                        {activeApp.candidate?.phone ? (
                          <a href={`tel:${activeApp.candidate.phone}`} className="font-semibold text-blue-600 dark:text-blue-400">
                            {activeApp.candidate.phone}
                          </a>
                        ) : (
                          <span className="text-slate-400">Not provided</span>
                        )}
                      </div>
                      <div className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50">
                        <span className="text-slate-500 block">Current Location</span>
                        <span className="font-semibold text-slate-900 dark:text-white">
                          {getCandidateLocation(activeApp)}
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 min-w-0">
                        <FileText className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="truncate font-medium">
                          {activeApp.candidateProfile?.resumeFileName || 'Candidate-Resume.pdf'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {safeExternalUrl(activeApp.resumeUrl) && (
                          <a
                            href={activeApp.resumeUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span>Open PDF</span>
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownloadResume(activeApp)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download Resume</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Career Objective / Summary */}
                  {activeApp.candidateProfile?.objective && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Profile Summary</h3>
                      <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {activeApp.candidateProfile.objective}
                      </p>
                    </div>
                  )}

                  {/* Cover Letter */}
                  {activeApp.coverLetter && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-4">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-1.5">Cover Letter</h3>
                      <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                        {activeApp.coverLetter}
                      </p>
                    </div>
                  )}

                  {/* Skills */}
                  {((activeApp.candidateProfile?.technicalSkills?.length || 0) > 0 ||
                    (activeApp.candidateProfile?.softSkills?.length || 0) > 0) && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-blue-600" />
                        <span>Skills &amp; Proficiency</span>
                      </h3>
                      {(activeApp.candidateProfile?.technicalSkills?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {activeApp.candidateProfile!.technicalSkills.map((skill, idx) => (
                            <span
                              key={`${skill.name}-${idx}`}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-blue-50 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 border border-blue-100 dark:border-blue-900"
                            >
                              {skill.name}
                              {skill.proficiency ? ` · ${skill.proficiency}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                      {(activeApp.candidateProfile?.softSkills?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1.5 pt-1">
                          {activeApp.candidateProfile!.softSkills.map((skill, idx) => (
                            <span
                              key={`${skill}-${idx}`}
                              className="px-2.5 py-1 rounded-md text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Work Experience */}
                  {(activeApp.candidateProfile?.experience?.length || 0) > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Briefcase className="w-4 h-4 text-blue-600" />
                        <span>Work Experience</span>
                      </h3>
                      <div className="space-y-3">
                        {activeApp.candidateProfile!.experience.map((exp, idx) => (
                          <div key={idx} className="border-l-2 border-slate-200 dark:border-slate-700 pl-3">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p className="text-xs font-semibold text-slate-900 dark:text-white">
                                {exp.jobTitle} · {exp.company}
                              </p>
                              <span className="text-[11px] text-slate-500">
                                {exp.startDate} – {exp.current ? 'Present' : exp.endDate || '—'}
                              </span>
                            </div>
                            {exp.employmentType && (
                              <p className="text-[11px] text-slate-500">{exp.employmentType}</p>
                            )}
                            {exp.responsibilities && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 mt-1 whitespace-pre-line">
                                {exp.responsibilities}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Education */}
                  {(activeApp.candidateProfile?.education?.length || 0) > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <GraduationCap className="w-4 h-4 text-blue-600" />
                        <span>Education</span>
                      </h3>
                      <div className="space-y-2.5">
                        {activeApp.candidateProfile!.education.map((edu, idx) => (
                          <div key={idx} className="flex flex-wrap items-start justify-between gap-2 text-xs">
                            <div>
                              <p className="font-semibold text-slate-900 dark:text-white">
                                {edu.degree}
                                {edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''}
                              </p>
                              <p className="text-slate-500">{edu.institution}</p>
                            </div>
                            <div className="text-right text-slate-500">
                              <p>{[edu.startDate, edu.endDate].filter(Boolean).join(' – ') || '—'}</p>
                              {edu.grade && <p className="text-[11px]">Grade: {edu.grade}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Projects, Certifications, Languages & Links */}
                  {((activeApp.candidateProfile?.projects?.length || 0) > 0 ||
                    (activeApp.candidateProfile?.certifications?.length || 0) > 0 ||
                    (activeApp.candidateProfile?.languages?.length || 0) > 0 ||
                    activeApp.candidateProfile?.socialLinks?.linkedin ||
                    activeApp.candidateProfile?.socialLinks?.github ||
                    activeApp.candidateProfile?.socialLinks?.portfolio ||
                    activeApp.candidateProfile?.socialLinks?.website) && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-4">
                      {(activeApp.candidateProfile?.projects?.length || 0) > 0 && (
                        <div className="space-y-2">
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Projects</h3>
                          <div className="space-y-2.5">
                            {activeApp.candidateProfile!.projects.map((proj, idx) => (
                              <div key={idx} className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-xs space-y-1">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="font-semibold text-slate-900 dark:text-white">{proj.title}</p>
                                  {safeExternalUrl(proj.url) && (
                                    <a
                                      href={proj.url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                                    >
                                      <span>Link</span>
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  )}
                                </div>
                                {proj.description && (
                                  <p className="text-slate-600 dark:text-slate-300">{proj.description}</p>
                                )}
                                {proj.technologies?.length > 0 && (
                                  <p className="text-[11px] text-slate-500">
                                    Tech: {proj.technologies.join(', ')}
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        {(activeApp.candidateProfile?.certifications?.length || 0) > 0 && (
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                              <Award className="w-3.5 h-3.5 text-blue-600" />
                              <span>Certifications</span>
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                              {activeApp.candidateProfile!.certifications.join(', ')}
                            </p>
                          </div>
                        )}
                        {(activeApp.candidateProfile?.languages?.length || 0) > 0 && (
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 mb-1">
                              <Languages className="w-3.5 h-3.5 text-blue-600" />
                              <span>Languages</span>
                            </p>
                            <p className="text-slate-600 dark:text-slate-300">
                              {activeApp.candidateProfile!.languages.join(', ')}
                            </p>
                          </div>
                        )}
                      </div>

                      {activeApp.candidateProfile?.socialLinks && (
                        <div className="flex flex-wrap gap-2 pt-1">
                          {(
                            [
                              ['LinkedIn', activeApp.candidateProfile.socialLinks.linkedin],
                              ['GitHub', activeApp.candidateProfile.socialLinks.github],
                              ['Portfolio', activeApp.candidateProfile.socialLinks.portfolio],
                              ['Website', activeApp.candidateProfile.socialLinks.website],
                            ] as const
                          ).map(([label, href]) => {
                            const safe = safeExternalUrl(href);
                            if (!safe) return null;
                            return (
                              <a
                                key={label}
                                href={safe}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                              >
                                <Globe className="w-3.5 h-3.5" />
                                <span>{label}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Right Column: Interview Card, Job Description, Update Stage Form & History */}
                <div className="lg:col-span-5 space-y-5">
                  {/* Scheduled Interview Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <span>Interview Schedule</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleOpenScheduleModal(activeApp)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                      >
                        {activeApp.interview ? 'Reschedule' : 'Schedule Interview'}
                      </button>
                    </div>

                    {activeApp.interview ? (
                      <div className="rounded-lg bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900 p-3 space-y-1.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-900 dark:text-white">
                            {activeApp.interview.date} at {activeApp.interview.time} ({activeApp.interview.timezone})
                          </span>
                          <StatusIndicator status={activeApp.interview.status} />
                        </div>
                        <p className="text-slate-600 dark:text-slate-300">
                          Type: <span className="font-medium">{activeApp.interview.type}</span> · Interviewer:{' '}
                          <span className="font-medium">{activeApp.interview.interviewerName}</span>
                        </p>
                        <p className="text-slate-600 dark:text-slate-300 break-all">
                          Location / Link:{' '}
                          {activeApp.interview.meetingLinkOrLocation?.trim() ? (
                            safeExternalUrl(activeApp.interview.meetingLinkOrLocation) ? (
                              <a
                                href={activeApp.interview.meetingLinkOrLocation}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 underline"
                              >
                                {activeApp.interview.meetingLinkOrLocation}
                              </a>
                            ) : (
                              <span className="font-medium">{activeApp.interview.meetingLinkOrLocation}</span>
                            )
                          ) : (
                            <span className="font-medium text-slate-500 dark:text-slate-400">
                              {activeApp.interview.type === 'In-person'
                                ? 'In-person / Offline (No meeting link)'
                                : 'Not provided'}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500">
                          Candidate Confirmation:{' '}
                          <span className="font-semibold">
                            {activeApp.interview.candidateConfirmed ? 'Confirmed' : 'Pending candidate response'}
                          </span>
                        </p>
                        {activeApp.interview.instructions && (
                          <p className="text-slate-600 dark:text-slate-300 pt-1 border-t border-blue-100 dark:border-blue-900">
                            {activeApp.interview.instructions}
                          </p>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        No interview scheduled yet. Click <span className="font-medium">Schedule Interview</span> to send
                        an email invite and calendar details to {activeApp.candidate?.name || 'the candidate'}.
                      </p>
                    )}
                  </div>

                  {/* Applied Job Description Card */}
                  {activeApp.job && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                            Job Description &amp; Role
                          </h3>
                          <p className="text-xs text-slate-500 mt-0.5">
                            <Link
                              to={`/jobs/${activeApp.job.slug || activeApp.job._id}`}
                              className="font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {activeApp.job.title}
                            </Link>{' '}
                            at{' '}
                            {activeApp.company ? (
                              <Link
                                to={`/companies/${activeApp.company.slug || activeApp.company._id}`}
                                className="font-semibold text-slate-800 dark:text-slate-200 hover:underline"
                              >
                                {getCompanyName(activeApp)}
                              </Link>
                            ) : (
                              <span className="font-semibold">{getCompanyName(activeApp)}</span>
                            )}
                          </p>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                          <MapPin className="w-3 h-3" /> {activeApp.job.location}
                        </span>
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">{activeApp.job.workMode}</span>
                        <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                          {activeApp.job.employmentType}
                        </span>
                        <span className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                          <IndianRupee className="w-3 h-3" />
                          {formatSalaryRange(
                            activeApp.job.salaryMin,
                            activeApp.job.salaryMax,
                            activeApp.job.currency,
                            activeApp.job.salaryPeriod
                          )}
                        </span>
                        {activeApp.job.requiredExperience && (
                          <span className="px-2 py-1 rounded bg-slate-100 dark:bg-slate-800">
                            Exp: {activeApp.job.requiredExperience}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed whitespace-pre-line max-h-48 overflow-y-auto pr-1">
                        {activeApp.job.description}
                      </div>

                      {activeApp.job.skills?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500 mb-1">Required Role Skills</p>
                          <div className="flex flex-wrap gap-1">
                            {activeApp.job.skills.map((s) => (
                              <span
                                key={s}
                                className="px-2 py-0.5 text-[11px] rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                              >
                                {s}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {activeApp.job.responsibilities?.length > 0 && (
                        <div>
                          <p className="text-[11px] font-semibold text-slate-500 mb-1">Key Responsibilities</p>
                          <ul className="list-disc pl-4 text-xs text-slate-600 dark:text-slate-300 space-y-0.5">
                            {activeApp.job.responsibilities.slice(0, 5).map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Stage Update & Recruiter Notes Form */}
                  <form
                    onSubmit={handleUpdateApplication}
                    className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-3.5"
                  >
                    <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                      Update Stage &amp; Evaluation Notes
                    </h3>

                    <div>
                      <label className="block text-xs font-medium mb-1">Application Stage</label>
                      <select
                        value={statusForm.status}
                        onChange={(e) =>
                          setStatusForm({ ...statusForm, status: e.target.value as ApplicationStatus })
                        }
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                      >
                        {['Applied', 'Shortlisted', 'Interview Scheduled', 'Selected', 'Rejected'].map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">
                        Message to Candidate (included in email alert)
                      </label>
                      <textarea
                        rows={2}
                        value={statusForm.message}
                        onChange={(e) => setStatusForm({ ...statusForm, message: e.target.value })}
                        placeholder="Optional update message sent to candidate..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Private Recruiter Notes</label>
                      <textarea
                        rows={2}
                        value={statusForm.recruiterNotes}
                        onChange={(e) => setStatusForm({ ...statusForm, recruiterNotes: e.target.value })}
                        placeholder="Internal notes visible only to your recruiting team..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-medium mb-1">Internal Panel Feedback</label>
                      <textarea
                        rows={2}
                        value={statusForm.internalFeedback}
                        onChange={(e) => setStatusForm({ ...statusForm, internalFeedback: e.target.value })}
                        placeholder="Interview / technical assessment summary..."
                        className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                      />
                    </div>

                    <div className="flex justify-end gap-2.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setActiveApp(null)}
                        className="px-4 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        Close
                      </button>
                      <button
                        type="submit"
                        disabled={savingStatus}
                        className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 disabled:opacity-60"
                      >
                        {savingStatus ? 'Saving...' : 'Save Stage & Notify Candidate'}
                      </button>
                    </div>
                  </form>

                  {/* Status History Timeline */}
                  {(activeApp.statusHistory?.length || 0) > 0 && (
                    <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4 space-y-2.5">
                      <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Stage History</h3>
                      <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                        {[...activeApp.statusHistory].reverse().map((entry, idx) => (
                          <div key={idx} className="text-xs border-l-2 border-blue-200 dark:border-blue-800 pl-3 py-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-slate-900 dark:text-white">
                                {entry.previousStatus ? `${entry.previousStatus} → ${entry.newStatus}` : entry.newStatus}
                              </span>
                              <span className="text-[11px] text-slate-400 tabular-nums">
                                {formatShortDate(entry.timestamp)}
                              </span>
                            </div>
                            {entry.message && <p className="text-slate-600 dark:text-slate-300 mt-0.5">{entry.message}</p>}
                            <p className="text-[11px] text-slate-400">Updated by {entry.updatedByName}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Schedule / Reschedule Interview Modal */}
      {scheduleApp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/65 p-4">
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  {scheduleApp.interview && scheduleApp.interview.status !== 'Cancelled'
                    ? 'Reschedule Interview'
                    : 'Schedule Interview'}{' '}
                  — {scheduleApp.candidate?.name}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {scheduleApp.job?.title} · {getCompanyName(scheduleApp)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setScheduleApp(null)}
                aria-label="Close interview modal"
                className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleScheduleInterview} className="space-y-3.5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={interviewForm.date}
                    onChange={(e) => setInterviewForm({ ...interviewForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={interviewForm.time}
                    onChange={(e) => setInterviewForm({ ...interviewForm, time: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Interview Type</label>
                  <select
                    value={interviewForm.type}
                    onChange={(e) =>
                      setInterviewForm({
                        ...interviewForm,
                        type: e.target.value as 'Online' | 'In-person' | 'Phone',
                      })
                    }
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                  >
                    <option value="Online">Online</option>
                    <option value="In-person">In-person</option>
                    <option value="Phone">Phone</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Timezone</label>
                  <input
                    type="text"
                    required
                    value={interviewForm.timezone}
                    onChange={(e) => setInterviewForm({ ...interviewForm, timezone: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Interviewer Name</label>
                <input
                  type="text"
                  required
                  value={interviewForm.interviewerName}
                  onChange={(e) => setInterviewForm({ ...interviewForm, interviewerName: e.target.value })}
                  placeholder="Hiring Manager / Panel Name"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  {interviewForm.type === 'Online'
                    ? 'Meeting Link *'
                    : interviewForm.type === 'In-person'
                      ? 'Office Location (Optional for In-person / Offline)'
                      : 'Phone / Dial-in Info (Optional)'}
                </label>
                <input
                  type="text"
                  required={interviewForm.type === 'Online'}
                  value={interviewForm.meetingLinkOrLocation}
                  onChange={(e) => setInterviewForm({ ...interviewForm, meetingLinkOrLocation: e.target.value })}
                  placeholder={
                    interviewForm.type === 'Online'
                      ? 'https://meet.google.com/...'
                      : interviewForm.type === 'In-person'
                        ? 'Optional: Office address or room (can leave blank for offline)'
                        : 'Optional: Phone number or dial-in details'
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">Candidate Instructions</label>
                <textarea
                  rows={2}
                  value={interviewForm.instructions}
                  onChange={(e) => setInterviewForm({ ...interviewForm, instructions: e.target.value })}
                  placeholder="Preparation notes, documents to carry, or joining tips..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setScheduleApp(null)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingInterview}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 disabled:opacity-60"
                >
                  {savingInterview
                    ? 'Saving...'
                    : scheduleApp.interview && scheduleApp.interview.status !== 'Cancelled'
                      ? 'Update & Notify Candidate'
                      : 'Schedule & Send Invite'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
