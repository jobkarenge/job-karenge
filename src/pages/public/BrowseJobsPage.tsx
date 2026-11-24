import { Filter, Search, X } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, SkeletonList } from '../../components/common/UIPrimitives';
import { JobCard } from '../../components/jobs/JobCard';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage } from '../../services/api';
import type { Job } from '../../types';

export function BrowseJobsPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [category, setCategory] = useState(searchParams.get('category') || '');
  const [location, setLocation] = useState(searchParams.get('location') || '');
  const [workMode, setWorkMode] = useState(searchParams.get('workMode') || '');
  const [employmentType, setEmploymentType] = useState(searchParams.get('employmentType') || '');
  const [experience, setExperience] = useState(searchParams.get('experience') || '');
  const [skills, setSkills] = useState(searchParams.get('skills') || '');
  const [salaryMin, setSalaryMin] = useState(searchParams.get('salaryMin') || '');
  const [postedDays, setPostedDays] = useState(searchParams.get('postedDays') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'latest');
  const [page, setPage] = useState(Number(searchParams.get('page') || 1));

  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  useEffect(() => {
    api.get('/jobs/categories').then((res) => {
      setCategories((res.data.data || []).map((c: { name: string }) => c.name));
    });
  }, []);

  useEffect(() => {
    if (user?.role === 'candidate') {
      api
        .get('/candidate/saved-jobs')
        .then((res) => setSavedIds(new Set((res.data.data || []).map((s: { jobId: string }) => s.jobId))))
        .catch(() => {});
    }
  }, [user]);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (category) params.set('category', category);
    if (location) params.set('location', location);
    if (workMode) params.set('workMode', workMode);
    if (employmentType) params.set('employmentType', employmentType);
    if (experience) params.set('experience', experience);
    if (skills) params.set('skills', skills);
    if (salaryMin) params.set('salaryMin', salaryMin);
    if (postedDays) params.set('postedDays', postedDays);
    if (sort) params.set('sort', sort);
    params.set('page', String(page));
    params.set('limit', '9');

    setSearchParams(params, { replace: true });
    try {
      const res = await api.get(`/jobs?${params.toString()}`);
      setJobs(res.data.data?.items || []);
      setTotal(res.data.data?.pagination?.total || 0);
      setTotalPages(res.data.data?.pagination?.totalPages || 1);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [q, category, location, workMode, employmentType, experience, skills, salaryMin, postedDays, sort, page, setSearchParams]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchJobs();
    }, 220);
    return () => clearTimeout(timer);
  }, [fetchJobs]);

  const clearFilters = () => {
    setQ('');
    setCategory('');
    setLocation('');
    setWorkMode('');
    setEmploymentType('');
    setExperience('');
    setSkills('');
    setSalaryMin('');
    setPostedDays('');
    setSort('latest');
    setPage(1);
  };

  const handleToggleSave = async (jobId: string) => {
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'candidate') {
      toast.error('Only candidate accounts can bookmark jobs.');
      return;
    }
    try {
      const res = await api.post(`/candidate/saved-jobs/${jobId}`);
      const saved = Boolean(res.data.data?.saved);
      setSavedIds((prev) => {
        const next = new Set(prev);
        if (saved) next.add(jobId);
        else next.delete(jobId);
        return next;
      });
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const activeFilters: Array<{ label: string; clear: () => void }> = [];
  if (q) activeFilters.push({ label: `Search: ${q}`, clear: () => setQ('') });
  if (category) activeFilters.push({ label: `Category: ${category}`, clear: () => setCategory('') });
  if (location) activeFilters.push({ label: `Location: ${location}`, clear: () => setLocation('') });
  if (workMode) activeFilters.push({ label: `Work Mode: ${workMode}`, clear: () => setWorkMode('') });
  if (employmentType) activeFilters.push({ label: `Type: ${employmentType}`, clear: () => setEmploymentType('') });
  if (experience) activeFilters.push({ label: `Experience: ${experience}`, clear: () => setExperience('') });
  if (skills) activeFilters.push({ label: `Skills: ${skills}`, clear: () => setSkills('') });
  if (salaryMin) activeFilters.push({ label: `Min Salary: ₹${(Number(salaryMin) / 100000).toFixed(0)}L`, clear: () => setSalaryMin('') });
  if (postedDays) activeFilters.push({ label: `Posted: Last ${postedDays}d`, clear: () => setPostedDays('') });

  const filterForm = (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Filter Openings</h2>
        {activeFilters.length > 0 && (
          <button type="button" onClick={clearFilters} className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Category</label>
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setPage(1);
          }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="">All Categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Location</label>
        <input
          type="text"
          value={location}
          onChange={(e) => {
            setLocation(e.target.value);
            setPage(1);
          }}
          placeholder="e.g. Bengaluru, Mumbai, Remote"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Work Mode</label>
        <div className="grid grid-cols-3 gap-1.5">
          {['Remote', 'Hybrid', 'On-site'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => {
                setWorkMode(workMode === mode ? '' : mode);
                setPage(1);
              }}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                workMode === mode
                  ? 'bg-[#102A43] dark:bg-blue-600 text-white border-transparent'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
              }`}
            >
              {mode}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Employment Type</label>
        <select
          value={employmentType}
          onChange={(e) => {
            setEmploymentType(e.target.value);
            setPage(1);
          }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="">Any Type</option>
          {['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'].map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Skills (comma separated)</label>
        <input
          type="text"
          value={skills}
          onChange={(e) => {
            setSkills(e.target.value);
            setPage(1);
          }}
          placeholder="React, TypeScript, AWS"
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        />
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Minimum Salary (INR/yr)</label>
        <select
          value={salaryMin}
          onChange={(e) => {
            setSalaryMin(e.target.value);
            setPage(1);
          }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="">Any Salary</option>
          <option value="800000">₹8L+ / yr</option>
          <option value="1500000">₹15L+ / yr</option>
          <option value="2200000">₹22L+ / yr</option>
          <option value="3000000">₹30L+ / yr</option>
        </select>
      </div>

      <div>
        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Date Posted</label>
        <select
          value={postedDays}
          onChange={(e) => {
            setPostedDays(e.target.value);
            setPage(1);
          }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
        >
          <option value="">Anytime</option>
          <option value="1">Last 24 hours</option>
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
        </select>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Browse Open Jobs</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400 tabular-nums">
            Showing {jobs.length} of {total} active opportunities
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative flex-1 md:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
              placeholder="Search title, company, skill..."
              className="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
            />
          </div>

          <select
            value={sort}
            onChange={(e) => {
              setSort(e.target.value);
              setPage(1);
            }}
            aria-label="Sort jobs"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="latest">Latest jobs</option>
            <option value="relevant">Most relevant</option>
            <option value="salary_desc">Salary: High to Low</option>
            <option value="salary_asc">Salary: Low to High</option>
            <option value="oldest">Oldest jobs</option>
          </select>

          <button
            type="button"
            onClick={() => setMobileFiltersOpen((v) => !v)}
            className="lg:hidden inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <Filter className="w-4 h-4" />
            <span>Filters</span>
          </button>
        </div>
      </div>

      {activeFilters.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {activeFilters.map((f) => (
            <button
              key={f.label}
              type="button"
              onClick={f.clear}
              className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:border-rose-400"
            >
              <span>{f.label}</span>
              <X className="w-3 h-3" />
            </button>
          ))}
        </div>
      )}

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className={`${mobileFiltersOpen ? 'block' : 'hidden'} lg:block lg:col-span-3`}>
          <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 sticky top-24">
            {filterForm}
          </div>
        </aside>

        <div className="lg:col-span-9">
          {loading ? (
            <SkeletonList rows={5} />
          ) : jobs.length === 0 ? (
            <EmptyState
              title="No matching jobs found"
              description="Try widening your location, salary threshold, or clearing active filters."
              actionLabel="Reset All Filters"
              onAction={clearFilters}
            />
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                {jobs.map((job) => (
                  <JobCard
                    key={job._id}
                    job={job}
                    isSaved={savedIds.has(job._id)}
                    onToggleSave={handleToggleSave}
                  />
                ))}
              </div>

              {totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                    className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-slate-600 dark:text-slate-400 px-3 tabular-nums">
                    Page {page} of {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={page >= totalPages}
                    onClick={() => setPage((p) => p + 1)}
                    className="px-3.5 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
