import { ArrowLeft, ArrowRight, Bookmark, Building2, CheckCircle2, FileText, Share2, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { SkeletonList } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage } from '../../services/api';
import type { Job } from '../../types';
import { formatSalaryRange, formatShortDate, isDeadlineExpired } from '../../utils/formatters';

export function JobDetailsPage() {
  const { id } = useParams();
  const { user, candidateProfile, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [applyOpen, setApplyOpen] = useState(false);
  const [coverLetter, setCoverLetter] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [uploadingResume, setUploadingResume] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    api
      .get(`/jobs/${id}`)
      .then((res) => setJob(res.data.data))
      .catch((err) => toast.error(getApiErrorMessage(err, 'Job not found')))
      .finally(() => setLoading(false));
  }, [id]);

  const handleShare = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Job link copied to clipboard.');
    } catch {
      toast.info(url);
    }
  };

  const handleToggleSave = async () => {
    if (!user) return navigate('/login');
    if (!job) return;
    try {
      const res = await api.post(`/candidate/saved-jobs/${job._id}`);
      setJob({ ...job, isSaved: Boolean(res.data.data?.saved) });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleResumeUploadDuringApply = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) {
      toast.error('Please select a valid PDF file for your resume.');
      return;
    }
    const fd = new FormData();
    fd.append('resume', file);
    setUploadingResume(true);
    try {
      const res = await api.post('/candidate/resume', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      toast.success(res.data.message || 'Resume updated for your profile & application.');
    } catch (err) {
      toast.error(getApiErrorMessage(err, 'Failed to upload PDF resume.'));
    } finally {
      setUploadingResume(false);
    }
  };

  const handleApply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!job) return;
    if (!candidateProfile?.resumeUrl) {
      toast.error('Please upload a PDF resume before submitting your application.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post('/applications', {
        jobId: job._id,
        coverLetter,
      });
      toast.success(res.data.message);
      setJob({ ...job, hasApplied: true, applicationsCount: job.applicationsCount + 1 });
      setApplyOpen(false);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10">
        <SkeletonList rows={3} />
      </div>
    );
  }

  if (!job) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16 text-center">
        <h1 className="text-2xl font-bold">Job listing unavailable</h1>
        <Link to="/jobs" className="mt-4 inline-block text-sm font-semibold text-blue-600 hover:underline">
          Back to Browse Jobs
        </Link>
      </div>
    );
  }

  const expired = isDeadlineExpired(job.applicationDeadline) || job.status !== 'published';

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white">
        <ArrowLeft className="w-4 h-4" />
        <span>Back to all jobs</span>
      </Link>

      <div className="mt-6 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
          <div className="flex items-start gap-4">
            <Link
              to={`/companies/${job.companyId}`}
              aria-label={`View ${job.companyName} profile`}
              className="w-14 h-14 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden hover:border-blue-500/60 transition-colors"
            >
              {job.company?.logoUrl ? (
                <img src={job.company.logoUrl} alt={job.companyName} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-6 h-6 text-[#102A43] dark:text-slate-200" />
              )}
            </Link>
            <div>
              <Link
                to={`/companies/${job.companyId}`}
                className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline"
              >
                {job.companyName}
              </Link>
              <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">{job.title}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-sm text-slate-600 dark:text-slate-400">
                <span>{job.location}</span>
                <span aria-hidden="true">·</span>
                <span>{job.workMode}</span>
                <span aria-hidden="true">·</span>
                <span>{job.employmentType}</span>
                <span aria-hidden="true">·</span>
                <span>{job.requiredExperience}</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">{job.openings} openings</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Share2 className="w-4 h-4" />
              <span>Share</span>
            </button>

            {(!user || user.role === 'candidate') && (
              <button
                type="button"
                onClick={handleToggleSave}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-sm font-medium rounded-lg border ${
                  job.isSaved
                    ? 'border-blue-300 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <Bookmark className="w-4 h-4" fill={job.isSaved ? 'currentColor' : 'none'} />
                <span>{job.isSaved ? 'Saved' : 'Save'}</span>
              </button>
            )}

            {job.hasApplied ? (
              <span className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-emerald-600 text-white">
                <CheckCircle2 className="w-4 h-4" />
                <span>Applied</span>
              </span>
            ) : expired ? (
              <span className="px-4 py-2 text-sm font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                Applications Closed
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (!user) return navigate('/login');
                  if (user.role !== 'candidate') {
                    toast.error('Switch to a Candidate account to apply.');
                    return;
                  }
                  setApplyOpen(true);
                }}
                className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors"
              >
                Apply Now
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-200 dark:border-slate-800">
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Compensation</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod)}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Category</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{job.category}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Application Deadline</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
              {job.applicationDeadline ? formatShortDate(job.applicationDeadline) : 'No deadline (Ongoing)'}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500 dark:text-slate-400">Education</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
              {job.educationQualification || 'Bachelor’s or equivalent'}
            </p>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 space-y-8">
            <section>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Role Description</h2>
              <p className="mt-3 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                {job.description}
              </p>
            </section>

            {job.responsibilities.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Key Responsibilities</h2>
                <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {job.responsibilities.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {job.requiredQualifications.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Required Qualifications</h2>
                <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {job.requiredQualifications.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {job.preferredQualifications.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Preferred Qualifications</h2>
                <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {job.preferredQualifications.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}

            {job.benefits.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Benefits &amp; Perks</h2>
                <ul className="mt-3 list-disc pl-5 space-y-2 text-sm text-slate-700 dark:text-slate-300">
                  {job.benefits.map((item, idx) => (
                    <li key={idx}>{item}</li>
                  ))}
                </ul>
              </section>
            )}
          </div>

          <aside className="lg:col-span-4 space-y-6">
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-5 bg-[#F8FAFC] dark:bg-slate-950/40">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Required Skills</h3>
              <p className="mt-2.5 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                {job.skills.length > 0 ? job.skills.join(' · ') : 'Listed in role description'}
              </p>
            </div>

            <Link
              to={`/companies/${job.companyId}`}
              className="block rounded-xl border border-slate-200 dark:border-slate-800 p-5 bg-[#F8FAFC] dark:bg-slate-950/40 hover:border-blue-500/60 hover:shadow-sm transition-all"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">About {job.companyName}</h3>
                <ArrowRight className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                {job.company?.description || 'Verified hiring partner on Job Karenge.'}
              </p>
              {job.company?.headquarters && (
                <p className="mt-3 text-xs text-slate-500">HQ: {job.company.headquarters}</p>
              )}
              {job.contactPerson && (
                <p className="mt-2 text-xs text-slate-500">
                  Hiring contact: {job.contactPerson} {job.contactEmail ? `(${job.contactEmail})` : ''}
                </p>
              )}
              {job.applicationInstructions && (
                <p className="mt-3 text-xs text-slate-600 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
                  {job.applicationInstructions}
                </p>
              )}
              <p className="mt-3 text-xs font-semibold text-blue-600 dark:text-blue-400">
                View company details &amp; open roles
              </p>
            </Link>
          </aside>
        </div>
      </div>

      {applyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl">
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Apply for {job.title}</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{job.companyName} · {job.location}</p>

            <form onSubmit={handleApply} className="mt-5 space-y-4">
              {candidateProfile?.resumeUrl ? (
                <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0 text-xs">
                      <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">Attached Resume</p>
                        <p className="text-slate-600 dark:text-slate-300 truncate">
                          {candidateProfile.resumeFileName || 'Verified Resume.pdf'} (
                          {Math.max(1, Math.round((candidateProfile.resumeSizeBytes || 0) / 1024))} KB)
                        </p>
                      </div>
                    </div>
                    <label
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 ${
                        uploadingResume ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingResume ? 'Updating...' : 'Update Resume (PDF)'}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={uploadingResume}
                        onChange={handleResumeUploadDuringApply}
                        className="sr-only"
                      />
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Uploading a new PDF automatically compresses (&lt; 1 MB) and saves it to your profile and this application.
                  </p>
                </div>
              ) : (
                <div className="p-4 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-sm text-amber-900 dark:text-amber-200 space-y-2.5">
                  <p className="font-semibold">Upload PDF Resume to Apply</p>
                  <p className="text-xs text-amber-800 dark:text-amber-300">
                    Attach your PDF resume (&lt; 1 MB, automatically verified and compressed) right here before submitting.
                  </p>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <label
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] ${
                        uploadingResume ? 'opacity-60 pointer-events-none' : 'cursor-pointer'
                      }`}
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{uploadingResume ? 'Uploading PDF...' : 'Choose PDF Resume'}</span>
                      <input
                        type="file"
                        accept="application/pdf,.pdf"
                        disabled={uploadingResume}
                        onChange={handleResumeUploadDuringApply}
                        className="sr-only"
                      />
                    </label>
                    <Link
                      to="/candidate/profile"
                      className="text-xs font-medium text-blue-700 dark:text-blue-400 hover:underline"
                    >
                      Or manage in full profile
                    </Link>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                  Cover Letter / Note to Hiring Team (Optional)
                </label>
                <textarea
                  rows={4}
                  value={coverLetter}
                  onChange={(e) => setCoverLetter(e.target.value)}
                  placeholder="Briefly highlight relevant projects or availability..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setApplyOpen(false)}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || uploadingResume || !candidateProfile?.resumeUrl}
                  className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
                >
                  {submitting ? 'Submitting...' : 'Submit Application'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
