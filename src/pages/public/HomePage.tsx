import { ArrowRight, Building2, CheckCircle2, MapPin, Search } from 'lucide-react';
import { motion } from 'motion/react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, SkeletonList } from '../../components/common/UIPrimitives';
import { JobCard } from '../../components/jobs/JobCard';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage, resolveApiAssetUrl } from '../../services/api';
import type { Company, Job } from '../../types';

interface CategoryItem {
  _id: string;
  name: string;
  slug: string;
  description: string;
  openCount: number;
}

export function HomePage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [query, setQuery] = useState('');
  const [location, setLocation] = useState('');
  const [category, setCategory] = useState('');
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [subscribing, setSubscribing] = useState(false);

  const [stats, setStats] = useState({ activeJobs: 0, verifiedCompanies: 0, totalApplications: 0, registeredCandidates: 0 });
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [featuredJobs, setFeaturedJobs] = useState<Job[]>([]);
  const [latestJobs, setLatestJobs] = useState<Job[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get('/jobs/stats'),
      api.get('/jobs/categories'),
      api.get('/jobs/featured'),
      api.get('/jobs?limit=6&sort=latest'),
      api.get('/jobs/companies'),
    ])
      .then(([statsRes, catRes, featRes, latestRes, compRes]) => {
        if (!active) return;
        setStats(statsRes.data.data);
        setCategories(catRes.data.data || []);
        setFeaturedJobs(featRes.data.data || []);
        setLatestJobs(latestRes.data.data?.items || []);
        setCompanies(compRes.data.data || []);
      })
      .catch((err) => {
        if (active) {
          toast.error(getApiErrorMessage(err, 'Unable to load latest job listings.'));
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (user?.role === 'candidate') {
      api
        .get('/candidate/saved-jobs')
        .then((res) => {
          const ids = new Set<string>((res.data.data || []).map((item: { jobId: string }) => item.jobId));
          setSavedIds(ids);
        })
        .catch(() => {});
    }
  }, [user]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set('q', query.trim());
    if (location.trim()) params.set('location', location.trim());
    if (category) params.set('category', category);
    navigate(`/jobs?${params.toString()}`);
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

  const handleNewsletter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim()) return;
    setSubscribing(true);
    try {
      const res = await api.post('/newsletter', { email: newsletterEmail.trim() });
      toast.success(res.data.message);
      setNewsletterEmail('');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubscribing(false);
    }
  };

  return (
    <div>
      {/* 1. Hero Section */}
      <section className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
              className="lg:col-span-7 flex flex-col justify-center"
            >
              <p className="text-sm font-semibold text-blue-600 dark:text-blue-400">
                Verified Employers · Real-Time Application Tracking
              </p>
              <h1 className="mt-3 text-4xl sm:text-5xl font-bold tracking-tight text-[#102A43] dark:text-white leading-[1.12]">
                Find Your Dream Job. Build Your Future.
              </h1>
              <p className="mt-4 text-base sm:text-lg text-slate-600 dark:text-slate-300 max-w-2xl leading-relaxed">
                Discover curated engineering, design, product, and operations roles from verified companies across India and remote teams. Track every application stage from submission to offer.
              </p>

              <form
                onSubmit={handleSearch}
                className="mt-8 p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-[#F8FAFC] dark:bg-slate-900 grid grid-cols-1 sm:grid-cols-12 gap-2"
              >
                <div className="sm:col-span-5 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <Search className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Title, skill, or company"
                    aria-label="Search by job title, company, or skill"
                    className="w-full text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                  />
                </div>

                <div className="sm:col-span-3 flex items-center gap-2 px-3 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <MapPin className="w-4 h-4 text-slate-400 shrink-0" />
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="Location"
                    aria-label="Filter by location"
                    className="w-full text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100 placeholder:text-slate-400"
                  />
                </div>

                <div className="sm:col-span-2 flex items-center px-2.5 py-2.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    aria-label="Select job category"
                    className="w-full text-sm bg-transparent focus:outline-none text-slate-900 dark:text-slate-100"
                  >
                    <option value="">All Roles</option>
                    {categories.map((c) => (
                      <option key={c._id} value={c.name}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  className="sm:col-span-2 px-4 py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors whitespace-nowrap"
                >
                  Search
                </button>
              </form>
            </motion.div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800">
                <img
                  src="/src/assets/images/hero_career_workspace_1795259228518.jpg"
                  alt="Engineering and product teams collaborating in a sunlit modern office"
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              </div>
            </div>
          </div>

          {/* Live Career Statistics */}
          <div className="mt-10 pt-8 border-t border-slate-200 dark:border-slate-800 grid grid-cols-2 lg:grid-cols-4 gap-6">
            <div>
              <p className="text-3xl font-bold text-[#102A43] dark:text-white tabular-nums">{stats.activeJobs}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Active Open Positions</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#102A43] dark:text-white tabular-nums">{stats.verifiedCompanies}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Verified Hiring Companies</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#102A43] dark:text-white tabular-nums">{stats.totalApplications}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Tracked Applications</p>
            </div>
            <div>
              <p className="text-3xl font-bold text-[#102A43] dark:text-white tabular-nums">{stats.registeredCandidates}</p>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Registered Candidates</p>
            </div>
          </div>
        </div>
      </section>

      {/* 2. Popular Job Categories */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Popular Job Categories</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Explore live roles grouped by functional specialization.
            </p>
          </div>
          <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <span>View all openings</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-7 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {categories.slice(0, 8).map((cat) => (
            <Link
              key={cat._id}
              to={`/jobs?category=${encodeURIComponent(cat.name)}`}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-500/60 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{cat.name}</h3>
                <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 tabular-nums">{cat.openCount}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{cat.description}</p>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. Featured & Latest Jobs */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Featured &amp; Latest Opportunities</h2>
              <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                Direct applications with transparent status updates from hiring managers.
              </p>
            </div>
            <Link to="/jobs" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
              <span>Browse all jobs</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>

          <div className="mt-8">
            {loading ? (
              <SkeletonList rows={3} />
            ) : (featuredJobs.length > 0 ? featuredJobs : latestJobs).length === 0 ? (
              <EmptyState
                title="No open roles posted yet"
                description="Verified employers can register and publish live openings in minutes."
                actionLabel="Post a Job as Recruiter"
                onAction={() => navigate('/register?role=recruiter')}
              />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {(featuredJobs.length > 0 ? featuredJobs : latestJobs).slice(0, 6).map((job) => (
                  <JobCard
                    key={job._id}
                    job={job}
                    isSaved={savedIds.has(job._id)}
                    onToggleSave={handleToggleSave}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* 4. Top Verified Companies */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">Top Verified Companies</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Every employer is reviewed before publishing roles on Job Karenge.
            </p>
          </div>
          <Link to="/companies" className="inline-flex items-center gap-1.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            <span>All companies</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="mt-7">
          {companies.length === 0 ? (
            <EmptyState
              title="No hiring companies listed yet"
              description="Companies appear here automatically when employers register and verify their organization."
              actionLabel="Register Your Company"
              onAction={() => navigate('/register?role=recruiter')}
            />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
              {companies.slice(0, 5).map((comp) => (
                <Link
                  key={comp._id}
                  to={`/companies/${comp._id}`}
                  className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 hover:border-blue-500/60 hover:shadow-sm transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-[#102A43] dark:text-slate-200 overflow-hidden">
                      {comp.logoUrl ? (
                        <img src={resolveApiAssetUrl(comp.logoUrl)} alt={comp.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                      ) : (
                        <Building2 className="w-5 h-5" />
                      )}
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-slate-900 dark:text-slate-100">{comp.name}</h3>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{comp.industry}</p>
                  </div>
                  <p className="mt-4 text-xs font-medium text-blue-600 dark:text-blue-400 tabular-nums">
                    {comp.openJobsCount || 0} open roles · {comp.headquarters.split(',')[0]}
                  </p>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* 5. How Job Karenge Works & Why Choose Us (Editorial Split) */}
      <section className="border-y border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0F172A]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14 space-y-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
              <img
                src="/src/assets/images/candidate_career_growth_1795259227133.jpg"
                alt="Software engineer building a career profile"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover min-h-[260px]"
              />
            </div>
            <div className="lg:col-span-7 flex flex-col justify-center">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                How Job Karenge Works for Candidates
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                Move beyond black-hole application forms. Build one structured profile, upload a verified compressed PDF resume, and follow every decision in real time.
              </p>
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">01. Complete Structured Profile</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Add experience, projects, education, and a validated under-1MB PDF resume ready for instant recruiter review.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">02. Apply &amp; Track Live Stages</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    See exact transitions from Applied to Shortlisted, Interview Scheduled, and Selected with email alerts.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">03. Confirm Scheduled Interviews</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Receive meeting links, interviewer details, and automated reminders before every conversation.
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">04. Tailored Role Digests</h3>
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    Control daily or weekly category and location alerts with one-click preference updates.
                  </p>
                </div>
              </div>
              <div className="mt-7">
                <Link
                  to="/register"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] transition-colors"
                >
                  <span>Create Candidate Account</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-stretch">
            <div className="lg:col-span-7 flex flex-col justify-center order-2 lg:order-1">
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-white">
                Built for Serious Hiring Teams &amp; Recruiters
              </h2>
              <p className="mt-3 text-sm sm:text-base text-slate-600 dark:text-slate-300">
                Publish roles with automatic deadline expiration, review compressed candidate resumes securely, schedule interviews, and export applicant pipelines to CSV.
              </p>
              <ul className="mt-5 space-y-2.5 text-sm text-slate-700 dark:text-slate-300">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Multi-section job composer with Draft, Immediate Publish, and Scheduled Release</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Bulk shortlist or reject workflows with automatic candidate email notifications</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>Recruiter analytics covering funnel conversion, views, and role performance</span>
                </li>
              </ul>
              <div className="mt-7">
                <Link
                  to="/register?role=recruiter"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >
                  <span>Register as Recruiter</span>
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </div>
            </div>
            <div className="lg:col-span-5 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 order-1 lg:order-2">
              <img
                src="/src/assets/images/recruiter_hiring_team_1795259227054.jpg"
                alt="Hiring managers reviewing candidate applications"
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover min-h-[260px]"
              />
            </div>
          </div>
        </div>
      </section>

      {/* 6. Newsletter CTA */}
      <section className="border-t border-slate-200 dark:border-slate-800 bg-[#102A43] text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div>
            <h2 className="text-2xl font-bold">Weekly Curated Opportunities</h2>
            <p className="mt-1 text-sm text-slate-300">
              Receive verified engineering, design, and leadership roles matched to your domain. Unsubscribe anytime.
            </p>
          </div>
          <form onSubmit={handleNewsletter} className="w-full lg:w-auto flex flex-col sm:flex-row gap-2.5">
            <input
              type="email"
              required
              value={newsletterEmail}
              onChange={(e) => setNewsletterEmail(e.target.value)}
              placeholder="you@company.com"
              aria-label="Newsletter email address"
              className="px-4 py-2.5 rounded-lg bg-white/10 border border-white/20 text-sm text-white placeholder:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-400 min-w-[260px]"
            />
            <button
              type="submit"
              disabled={subscribing}
              className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-sm font-semibold text-white transition-colors whitespace-nowrap disabled:opacity-60"
            >
              {subscribing ? 'Subscribing...' : 'Subscribe'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
