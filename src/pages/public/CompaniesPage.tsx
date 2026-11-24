import { ArrowLeft, ArrowRight, Building2, ExternalLink, Globe, Mail, MapPin, Phone, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Company, Job } from '../../types';
import { formatSalaryRange } from '../../utils/formatters';

export function CompaniesPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const selectedId = id || searchParams.get('selected');

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<{ company: Company; jobs: Job[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    api
      .get('/jobs/companies')
      .then((res) => setCompanies(res.data.data || []))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    api
      .get(`/jobs/companies/${selectedId}`)
      .then((res) => {
        if (active) setSelectedDetail(res.data.data);
      })
      .catch((err) => {
        if (active) {
          setSelectedDetail(null);
          toast.error(getApiErrorMessage(err, 'Company details not found.'));
        }
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedId]);

  const closeDetail = () => {
    if (id) {
      navigate('/companies');
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      {selectedId ? (
        <div className="space-y-6">
          <button
            type="button"
            onClick={closeDetail}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to all companies</span>
          </button>

          {detailLoading ? (
            <SkeletonList rows={3} />
          ) : selectedDetail ? (
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
              {selectedDetail.company.bannerUrl && (
                <div className="h-44 sm:h-52 w-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                  <img
                    src={selectedDetail.company.bannerUrl}
                    alt={`${selectedDetail.company.name} banner`}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover"
                  />
                </div>
              )}

              <div className="p-6 sm:p-8">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                  <div className="flex items-start gap-4">
                    <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                      {selectedDetail.company.logoUrl ? (
                        <img
                          src={selectedDetail.company.logoUrl}
                          alt={selectedDetail.company.name}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <Building2 className="w-7 h-7 text-[#102A43] dark:text-slate-200" />
                      )}
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                          {selectedDetail.company.name}
                        </h1>
                        {selectedDetail.company.verified && <StatusIndicator status="Verified" />}
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-slate-600 dark:text-slate-400">
                        {selectedDetail.company.industry && <span>{selectedDetail.company.industry}</span>}
                        {selectedDetail.company.headquarters && (
                          <span className="inline-flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5" />
                            {selectedDetail.company.headquarters}
                          </span>
                        )}
                        {selectedDetail.company.size && (
                          <span className="inline-flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" />
                            {selectedDetail.company.size}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                    {selectedDetail.company.website && (
                      <a
                        href={selectedDetail.company.website}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <Globe className="w-3.5 h-3.5" />
                        <span>Website</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {selectedDetail.company.socialLinks?.linkedin && (
                      <a
                        href={selectedDetail.company.socialLinks.linkedin}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>LinkedIn</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                    {selectedDetail.company.socialLinks?.twitter && (
                      <a
                        href={selectedDetail.company.socialLinks.twitter}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800"
                      >
                        <span>X / Twitter</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>

                {(selectedDetail.company.contactEmail || selectedDetail.company.contactPhone) && (
                  <div className="mt-6 py-3.5 px-4 rounded-lg border border-slate-200 dark:border-slate-800 bg-[#F8FAFC] dark:bg-slate-950/40 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600 dark:text-slate-300">
                    {selectedDetail.company.contactEmail && (
                      <a
                        href={`mailto:${selectedDetail.company.contactEmail}`}
                        className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Mail className="w-3.5 h-3.5" />
                        <span>{selectedDetail.company.contactEmail}</span>
                      </a>
                    )}
                    {selectedDetail.company.contactPhone && (
                      <a
                        href={`tel:${selectedDetail.company.contactPhone}`}
                        className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400"
                      >
                        <Phone className="w-3.5 h-3.5" />
                        <span>{selectedDetail.company.contactPhone}</span>
                      </a>
                    )}
                  </div>
                )}

                <div className="mt-6">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">About {selectedDetail.company.name}</h2>
                  <p className="mt-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-line">
                    {selectedDetail.company.description || 'Verified employer hiring on Job Karenge.'}
                  </p>
                </div>

                <div className="mt-8 pt-6 border-t border-slate-200 dark:border-slate-800">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    Open Roles ({selectedDetail.jobs.length})
                  </h2>
                  {selectedDetail.jobs.length === 0 ? (
                    <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
                      No active job openings listed by {selectedDetail.company.name} right now.
                    </p>
                  ) : (
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      {selectedDetail.jobs.map((job) => (
                        <Link
                          key={job._id}
                          to={`/jobs/${job._id}`}
                          className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 hover:border-blue-500/60 hover:shadow-sm transition-all flex flex-col justify-between gap-3"
                        >
                          <div>
                            <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">{job.title}</p>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                              {job.location} · {job.workMode} · {job.employmentType} · {job.requiredExperience}
                            </p>
                          </div>
                          <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 dark:border-slate-800">
                            <span className="font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                              {formatSalaryRange(job.salaryMin, job.salaryMax, job.currency, job.salaryPeriod)}
                            </span>
                            <span className="font-semibold text-blue-600 dark:text-blue-400 inline-flex items-center gap-1">
                              View Role <ArrowRight className="w-3.5 h-3.5" />
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              title="Company not found"
              description="This employer profile may have been removed or is no longer available."
              actionLabel="View All Companies"
              onAction={() => navigate('/companies')}
            />
          )}
        </div>
      ) : (
        <>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Verified Companies</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Click any company card to explore their organization details and active job openings.
          </p>

          <div className="mt-8">
            {loading ? (
              <SkeletonList rows={3} />
            ) : companies.length === 0 ? (
              <EmptyState
                title="No companies listed yet"
                description="Companies appear here as soon as recruiters register and set up their organization profile."
                actionLabel="Register as Recruiter"
                onAction={() => navigate('/register?role=recruiter')}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {companies.map((c) => (
                  <Link
                    key={c._id}
                    to={`/companies/${c._id}`}
                    className="group rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between hover:border-blue-500/60 hover:shadow-sm transition-all"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center overflow-hidden">
                          {c.logoUrl ? (
                            <img src={c.logoUrl} alt={c.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                          ) : (
                            <Building2 className="w-5 h-5" />
                          )}
                        </div>
                        {c.verified && <StatusIndicator status="Verified" />}
                      </div>
                      <h2 className="mt-4 text-lg font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {c.name}
                      </h2>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{c.industry}</p>
                      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400 line-clamp-3">{c.description}</p>
                    </div>

                    <div className="mt-5 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                        <MapPin className="w-3.5 h-3.5" />
                        {c.headquarters}
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400 tabular-nums">
                        {c.openJobsCount || 0} open roles
                        <ArrowRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
