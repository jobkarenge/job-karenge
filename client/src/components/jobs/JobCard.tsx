import { ArrowUpRight, Bookmark, Building2 } from 'lucide-react';
import React from 'react';
import { Link } from 'react-router-dom';
import { optimizeCloudinaryImageUrl } from '../../services/api';
import type { Job } from '../../types';
import { formatRelativeDate, formatSalaryRange, formatShortDate } from '../../utils/formatters';

interface JobCardProps {
  job: Job;
  isSaved?: boolean;
  onToggleSave?: (jobId: string) => void;
}

export function JobCard({ job, isSaved, onToggleSave }: JobCardProps) {
  return (
    <article className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 transition-colors hover:border-blue-500/50 dark:hover:border-blue-500/50 flex flex-col justify-between">
      <div>
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              to={`/companies/${job.companyId}`}
              aria-label={`View ${job.companyName} details`}
              className="shrink-0"
            >
              {job.company?.logoUrl ? (
                <img
                  src={optimizeCloudinaryImageUrl(job.company.logoUrl, { width: 88, height: 88, crop: 'fill' })}
                  alt={job.companyName}
                  width={44}
                  height={44}
                  loading="lazy"
                  decoding="async"
                  referrerPolicy="no-referrer"
                  className="w-11 h-11 rounded-lg object-cover border border-slate-200 dark:border-slate-800 bg-white hover:border-blue-500/60 transition-colors"
                />
              ) : (
                <div className="w-11 h-11 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[#102A43] dark:text-slate-200 hover:border-blue-500/60 transition-colors">
                  <Building2 className="w-5 h-5" />
                </div>
              )}
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-600 dark:text-slate-400 truncate">
                <Link
                  to={`/companies/${job.companyId}`}
                  className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                >
                  {job.companyName}
                </Link>
                {job.featured ? ' · Featured' : ''}
              </p>
              <Link
                to={`/jobs/${job._id}`}
                className="mt-0.5 block text-base font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate"
              >
                {job.title}
              </Link>
            </div>
          </div>

          {onToggleSave && (
            <button
              type="button"
              onClick={() => onToggleSave(job._id)}
              aria-label={isSaved ? 'Remove saved job' : 'Save job'}
              className={`p-2 rounded-lg border transition-colors shrink-0 ${
                isSaved
                  ? 'border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400'
                  : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <Bookmark className="w-4 h-4" fill={isSaved ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
          <span>{job.location}</span>
          <span aria-hidden="true">·</span>
          <span>{job.workMode}</span>
          <span aria-hidden="true">·</span>
          <span>{job.employmentType}</span>
          <span aria-hidden="true">·</span>
          <span>{job.requiredExperience}</span>
        </div>

        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 line-clamp-2 leading-relaxed">
          {job.description}
        </p>

        {job.skills.length > 0 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400 truncate">
            {job.skills.slice(0, 5).join(' · ')}
          </p>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 tabular-nums">
            {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Posted {formatRelativeDate(job.publishedAt || job.createdAt)} ·{' '}
            {job.applicationDeadline ? `Apply by ${formatShortDate(job.applicationDeadline)}` : 'Ongoing hiring'}
          </p>
        </div>

        <Link
          to={`/jobs/${job._id}`}
          className="inline-flex items-center gap-1 px-3.5 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors whitespace-nowrap shrink-0"
        >
          <span>View Role</span>
          <ArrowUpRight className="w-3.5 h-3.5" />
        </Link>
      </div>
    </article>
  );
}
