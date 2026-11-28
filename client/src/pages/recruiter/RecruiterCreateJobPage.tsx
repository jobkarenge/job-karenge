import { RefreshCw } from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '../../context/AuthContext';
import { api, fetchCategories, getApiErrorMessage, invalidateCategoriesCache } from '../../services/api';
import type { Company } from '../../types';

export function RecruiterCreateJobPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const initialCompanyId = searchParams.get('companyId') || '';
  const isEditing = Boolean(id);
  const { company, user } = useAuth();
  const navigate = useNavigate();

  const [myCompanies, setMyCompanies] = useState<Company[]>([]);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [categories, setCategories] = useState<string[]>([]);
  const [addingCategory, setAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [creatingCategory, setCreatingCategory] = useState(false);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    companyId: initialCompanyId || company?._id || '',
    title: '',
    category: 'Software Engineering',
    description: '',
    applicationDeadline: new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
    noDeadline: false,
    requiredExperience: '',
    employmentType: 'Full-time',
    workMode: 'Hybrid',
    location: '',
    salaryMin: '' as string | number,
    salaryMax: '' as string | number,
    salaryPeriod: 'Annual' as 'Annual' | 'Monthly',
    currency: 'INR',
    skillsText: '',
    educationQualification: '',
    openings: 1,
    responsibilitiesText: '',
    requiredQualificationsText: '',
    preferredQualificationsText: '',
    benefitsText: '',
    contactPerson: user?.name || '',
    contactEmail: user?.email || '',
    contactPhone: user?.phone || '',
    applicationInstructions: '',
    status: 'published',
    scheduledFor: '',
    featured: false,
    allowDirectApply: true,
  });

  const loadCompanies = useCallback(
    async (showErrorToast = false) => {
      setLoadingCompanies(true);
      try {
        const res = await api.get('/recruiter/companies');
        const list: Company[] = res.data.data || [];
        setMyCompanies(list);
        setForm((prev) => {
          const stillExists = prev.companyId && list.some((c) => c._id === prev.companyId);
          const nextCompanyId =
            (stillExists ? prev.companyId : '') ||
            (initialCompanyId && list.some((c) => c._id === initialCompanyId) ? initialCompanyId : '') ||
            company?._id ||
            list[0]?._id ||
            '';
          return { ...prev, companyId: nextCompanyId };
        });
      } catch (err) {
        if (showErrorToast) {
          toast.error(getApiErrorMessage(err));
        }
      } finally {
        setLoadingCompanies(false);
      }
    },
    [company?._id, initialCompanyId]
  );

  useEffect(() => {
    fetchCategories()
      .then((cats) => {
        const names = cats.map((c) => c.name);
        if (names.length > 0) setCategories(names);
      })
      .catch(() => {});
    loadCompanies(true);
  }, [loadCompanies]);

  useEffect(() => {
    const handleSync = () => {
      loadCompanies(false);
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        loadCompanies(false);
      }
    };
    window.addEventListener('jk:companies-updated', handleSync);
    window.addEventListener('focus', handleSync);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('jk:companies-updated', handleSync);
      window.removeEventListener('focus', handleSync);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [loadCompanies]);

  useEffect(() => {
    if (!id) return;
    api.get(`/jobs/${id}`).then((res) => {
      const j = res.data.data;
      if (j.category) {
        setCategories((prev) => (prev.includes(j.category) ? prev : [...prev, j.category]));
      }
      setForm({
        companyId: j.companyId || company?._id || '',
        title: j.title || '',
        category: j.category || 'Software Engineering',
        description: j.description || '',
        applicationDeadline: j.applicationDeadline ? j.applicationDeadline.slice(0, 10) : '',
        noDeadline: !j.applicationDeadline,
        requiredExperience: j.requiredExperience || '',
        employmentType: j.employmentType || 'Full-time',
        workMode: j.workMode || 'Hybrid',
        location: j.location || '',
        salaryMin: j.salaryMin || 0,
        salaryMax: j.salaryMax || 0,
        salaryPeriod: j.salaryPeriod === 'Monthly' ? 'Monthly' : 'Annual',
        currency: j.currency || 'INR',
        skillsText: (j.skills || []).join(', '),
        educationQualification: j.educationQualification || '',
        openings: j.openings || 1,
        responsibilitiesText: (j.responsibilities || []).join('\n'),
        requiredQualificationsText: (j.requiredQualifications || []).join('\n'),
        preferredQualificationsText: (j.preferredQualifications || []).join('\n'),
        benefitsText: (j.benefits || []).join('\n'),
        contactPerson: j.contactPerson || '',
        contactEmail: j.contactEmail || '',
        contactPhone: j.contactPhone || '',
        applicationInstructions: j.applicationInstructions || '',
        status: j.status === 'expired' ? 'closed' : j.status || 'published',
        scheduledFor: j.scheduledFor ? j.scheduledFor.slice(0, 16) : '',
        featured: Boolean(j.featured),
        allowDirectApply: j.allowDirectApply !== false,
      });
    });
  }, [id]);

  const toLines = (text: string) =>
    text
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

  const handleCreateCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (trimmed.length < 2) {
      toast.error('Please enter a category name (at least 2 characters).');
      return;
    }
    setCreatingCategory(true);
    try {
      const res = await api.post('/jobs/categories', { name: trimmed });
      invalidateCategoriesCache();
      const createdName: string = res.data?.data?.name || trimmed;
      setCategories((prev) => (prev.some((c) => c.toLowerCase() === createdName.toLowerCase()) ? prev : [...prev, createdName]));
      setForm((prev) => ({ ...prev, category: createdName }));
      setNewCategoryName('');
      setAddingCategory(false);
      toast.success(`Category "${createdName}" added.`);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCreatingCategory(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const effectiveCategory = addingCategory && newCategoryName.trim() ? newCategoryName.trim() : form.category;
    if (!effectiveCategory) {
      toast.error('Please select or add a job category.');
      return;
    }
    if (!form.noDeadline && !form.applicationDeadline) {
      toast.error('Please select an application deadline or check "No deadline".');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        companyId: form.companyId || undefined,
        title: form.title,
        category: effectiveCategory,
        description: form.description,
        applicationDeadline:
          form.noDeadline || !form.applicationDeadline
            ? null
            : new Date(`${form.applicationDeadline}T23:59:59Z`).toISOString(),
        requiredExperience: form.requiredExperience,
        employmentType: form.employmentType,
        workMode: form.workMode,
        location: form.location,
        salaryMin: Number(form.salaryMin) || 0,
        salaryMax: Number(form.salaryMax) || 0,
        salaryPeriod: form.salaryPeriod,
        currency: form.currency,
        skills: form.skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        educationQualification: form.educationQualification,
        openings: Number(form.openings),
        responsibilities: toLines(form.responsibilitiesText),
        requiredQualifications: toLines(form.requiredQualificationsText),
        preferredQualifications: toLines(form.preferredQualificationsText),
        benefits: toLines(form.benefitsText),
        contactPerson: form.contactPerson,
        contactEmail: form.contactEmail,
        contactPhone: form.contactPhone,
        applicationInstructions: form.applicationInstructions,
        status: form.status,
        scheduledFor: form.status === 'scheduled' && form.scheduledFor ? new Date(form.scheduledFor).toISOString() : undefined,
        featured: form.featured,
        allowDirectApply: form.allowDirectApply,
      };

      if (isEditing) {
        await api.put(`/jobs/${id}`, payload);
        toast.success('Job updated successfully.');
      } else {
        await api.post('/jobs', payload);
        toast.success(form.status === 'draft' ? 'Job saved as draft.' : 'Job created successfully.');
      }
      navigate('/recruiter/jobs');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const selectedCompanyObj = myCompanies.find((c) => c._id === form.companyId) || company;

  return (
    <div className="max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          {isEditing ? 'Edit Job Posting' : 'Create Job Posting'}
        </h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Publishing under company: <strong>{selectedCompanyObj?.name || 'Your Company'}</strong>
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">01. Core Role Details</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium">
                  Hiring Company *{' '}
                  <span className="text-slate-500 font-normal">
                    ({myCompanies.length || (company ? 1 : 0)} available)
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => loadCompanies(true)}
                    disabled={loadingCompanies}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-blue-600 disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingCompanies ? 'animate-spin' : ''}`} />
                    <span>Sync companies</span>
                  </button>
                  <Link
                    to="/recruiter/company"
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Add / manage companies
                  </Link>
                </div>
              </div>
              <select
                required
                value={form.companyId}
                onChange={(e) => setForm({ ...form, companyId: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {(myCompanies.length > 0 ? myCompanies : company ? [company] : []).map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.name} {c.verified ? '' : '(Pending Verification)'}
                  </option>
                ))}
              </select>
              {selectedCompanyObj && !selectedCompanyObj.verified && (
                <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  This company is awaiting verification. Admin approval is required before jobs under it can be published.
                </p>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium mb-1">Job Title *</label>
              <input
                type="text"
                required
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Senior Backend Engineer (Node.js)"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-medium">Job Category *</label>
                {!addingCategory && (
                  <button
                    type="button"
                    onClick={() => setAddingCategory(true)}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    + Add new category
                  </button>
                )}
              </div>
              <select
                value={addingCategory ? '__custom__' : form.category}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setAddingCategory(true);
                  } else {
                    setAddingCategory(false);
                    setForm({ ...form, category: e.target.value });
                  }
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {(categories.length > 0 ? categories : ['Software Engineering', 'Product & Design', 'Data & Analytics']).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value="__custom__">+ Add new category...</option>
              </select>

              {addingCategory && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleCreateCategory();
                      }
                    }}
                    placeholder="Enter new category name"
                    className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                  <button
                    type="button"
                    onClick={handleCreateCategory}
                    disabled={creatingCategory}
                    className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
                  >
                    {creatingCategory ? 'Adding...' : 'Add'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAddingCategory(false);
                      setNewCategoryName('');
                    }}
                    className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label className="block text-xs font-medium">
                  Application Deadline {form.noDeadline ? '(Optional)' : '*'}
                </label>
                <label className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={form.noDeadline}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setForm((prev) => ({
                        ...prev,
                        noDeadline: checked,
                        applicationDeadline: checked
                          ? ''
                          : prev.applicationDeadline || new Date(Date.now() + 21 * 86400_000).toISOString().slice(0, 10),
                      }));
                    }}
                  />
                  <span>No deadline</span>
                </label>
              </div>
              {form.noDeadline ? (
                <div className="w-full px-3 py-2 text-sm rounded-lg border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-300">
                  Ongoing hiring — open until closed manually
                </div>
              ) : (
                <input
                  type="date"
                  required={!form.noDeadline}
                  value={form.applicationDeadline}
                  onChange={(e) => setForm({ ...form, applicationDeadline: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              )}
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Employment Type *</label>
              <select
                value={form.employmentType}
                onChange={(e) => setForm({ ...form, employmentType: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Work Mode *</label>
              <select
                value={form.workMode}
                onChange={(e) => setForm({ ...form, workMode: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                {['Remote', 'Hybrid', 'On-site'].map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Job Location *</label>
              <input
                type="text"
                required
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="e.g. Bengaluru, Karnataka or Remote"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Required Experience *</label>
              <input
                type="text"
                required
                value={form.requiredExperience}
                onChange={(e) => setForm({ ...form, requiredExperience: e.target.value })}
                placeholder="e.g. 3-5 years"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Salary Period</label>
              <select
                value={form.salaryPeriod}
                onChange={(e) => setForm({ ...form, salaryPeriod: e.target.value as 'Annual' | 'Monthly' })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="Annual">Annual (Per Year)</option>
                <option value="Monthly">Monthly (Per Month)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Currency</label>
              <select
                value={form.currency}
                onChange={(e) => setForm({ ...form, currency: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="INR">INR (₹)</option>
                <option value="USD">USD ($)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Salary Min ({form.salaryPeriod})</label>
              <input
                type="number"
                min={0}
                value={form.salaryMin}
                onChange={(e) => setForm({ ...form, salaryMin: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder={form.salaryPeriod === 'Monthly' ? 'e.g. 25000' : 'e.g. 1200000'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Salary Max ({form.salaryPeriod})</label>
              <input
                type="number"
                min={0}
                value={form.salaryMax}
                onChange={(e) => setForm({ ...form, salaryMax: e.target.value === '' ? '' : Number(e.target.value) })}
                placeholder={form.salaryPeriod === 'Monthly' ? 'e.g. 60000' : 'e.g. 2200000'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Number of Openings</label>
              <input
                type="number"
                min={1}
                value={form.openings}
                onChange={(e) => setForm({ ...form, openings: Number(e.target.value) })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Job Description * (min 20 characters)</label>
            <textarea
              rows={5}
              required
              minLength={20}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">02. Skills, Responsibilities &amp; Qualifications</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Required Skills (comma separated)</label>
              <input
                type="text"
                value={form.skillsText}
                onChange={(e) => setForm({ ...form, skillsText: e.target.value })}
                placeholder="e.g. TypeScript, React, Node.js"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Educational Qualification</label>
              <input
                type="text"
                value={form.educationQualification}
                onChange={(e) => setForm({ ...form, educationQualification: e.target.value })}
                placeholder="e.g. Bachelor's degree in Computer Science or equivalent"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Responsibilities (one per line)</label>
              <textarea
                rows={4}
                value={form.responsibilitiesText}
                onChange={(e) => setForm({ ...form, responsibilitiesText: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Required Qualifications (one per line)</label>
              <textarea
                rows={4}
                value={form.requiredQualificationsText}
                onChange={(e) => setForm({ ...form, requiredQualificationsText: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Preferred Qualifications (one per line)</label>
              <textarea
                rows={3}
                value={form.preferredQualificationsText}
                onChange={(e) => setForm({ ...form, preferredQualificationsText: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Benefits &amp; Perks (one per line)</label>
              <textarea
                rows={3}
                value={form.benefitsText}
                onChange={(e) => setForm({ ...form, benefitsText: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">03. Contact &amp; Publication Settings</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Contact Person</label>
              <input
                type="text"
                value={form.contactPerson}
                onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact Email</label>
              <input
                type="email"
                value={form.contactEmail}
                onChange={(e) => setForm({ ...form, contactEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact Phone</label>
              <input
                type="text"
                value={form.contactPhone}
                onChange={(e) => setForm({ ...form, contactPhone: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium mb-1">Application Instructions</label>
            <input
              type="text"
              value={form.applicationInstructions}
              onChange={(e) => setForm({ ...form, applicationInstructions: e.target.value })}
              placeholder="e.g. Please apply with an up-to-date PDF resume."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
            <div>
              <label className="block text-xs font-medium mb-1">Publication Mode</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="published">Publish Immediately</option>
                <option value="draft">Save as Draft</option>
                <option value="scheduled">Schedule Publication</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            {form.status === 'scheduled' && (
              <div>
                <label className="block text-xs font-medium mb-1">Scheduled Publish Date &amp; Time</label>
                <input
                  type="datetime-local"
                  required
                  value={form.scheduledFor}
                  onChange={(e) => setForm({ ...form, scheduledFor: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-6 pt-2 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.featured}
                onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              />
              <span>Mark as Featured Job</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.allowDirectApply}
                onChange={(e) => setForm({ ...form, allowDirectApply: e.target.checked })}
              />
              <span>Allow direct applications through Job Karenge</span>
            </label>
          </div>
        </section>

        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate('/recruiter/jobs')}
            className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
          >
            {saving ? 'Saving...' : isEditing ? 'Update Job Posting' : 'Save Job Posting'}
          </button>
        </div>
      </form>
    </div>
  );
}
