import { Building2, ExternalLink, Plus, Upload } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage, resolveApiAssetUrl } from '../../services/api';
import type { Company, RecruiterProfile } from '../../types';

const emptyNewCompany = {
  companyName: '',
  industry: 'Technology & Services',
  website: '',
  size: '50-200 employees',
  headquarters: '',
  contactEmail: '',
  contactPhone: '',
  description: '',
};

export function RecruiterCompanyPage() {
  const { refreshUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingCompany, setSavingCompany] = useState(false);
  const [savingPersonal, setSavingPersonal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);

  const [recProfile, setRecProfile] = useState<RecruiterProfile | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedId, setSelectedId] = useState<string>('');
  const [recName, setRecName] = useState('');
  const [newCompany, setNewCompany] = useState(emptyNewCompany);

  const load = (preferCompanyId?: string) => {
    api
      .get('/recruiter/profile')
      .then((res) => {
        const data = res.data.data;
        const list: Company[] = data.companies || (data.company ? [data.company] : []);
        setRecName(data.user?.name || '');
        setRecProfile(data.recruiterProfile);
        setCompanies(list);
        setSelectedId((currentSelected) => {
          return (
            (preferCompanyId && list.find((c) => c._id === preferCompanyId)?._id) ||
            (currentSelected && list.find((c) => c._id === currentSelected)?._id) ||
            data.company?._id ||
            list[0]?._id ||
            ''
          );
        });
        if (data.user?.email) {
          setNewCompany((prev) =>
            prev.contactEmail
              ? prev
              : {
                  ...prev,
                  contactEmail: data.user.email || '',
                  contactPhone: data.user.phone || '',
                  headquarters: data.user.location || '',
                }
          );
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const handleSync = () => load();
    window.addEventListener('jk:companies-updated', handleSync);
    return () => window.removeEventListener('jk:companies-updated', handleSync);
  }, []);

  const selectedCompany = companies.find((c) => c._id === selectedId) || companies[0] || null;

  const updateSelectedCompanyField = (patch: Partial<Company>) => {
    if (!selectedCompany) return;
    setCompanies((prev) =>
      prev.map((c) => (c._id === selectedCompany._id ? { ...c, ...patch } : c))
    );
  };

  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recProfile) return;
    setSavingPersonal(true);
    try {
      await api.put('/recruiter/profile', {
        name: recName,
        designation: recProfile.designation,
      });
      await refreshUser();
      toast.success('Recruiter details updated.');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCompany) return;
    setSavingCompany(true);
    try {
      const res = await api.put(`/recruiter/companies/${selectedCompany._id}`, {
        companyName: selectedCompany.name,
        industry: selectedCompany.industry,
        description: selectedCompany.description,
        website: selectedCompany.website,
        size: selectedCompany.size,
        headquarters: selectedCompany.headquarters,
        contactEmail: selectedCompany.contactEmail,
        contactPhone: selectedCompany.contactPhone,
        socialLinks: selectedCompany.socialLinks,
      });
      const updated = res.data.data as Company;
      setCompanies((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      window.dispatchEvent(new CustomEvent('jk:companies-updated', { detail: { companyId: updated._id } }));
      await refreshUser();
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSavingCompany(false);
    }
  };

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api.post('/recruiter/companies', newCompany);
      const created = res.data.data as Company;
      toast.success(res.data.message);
      setShowCreateForm(false);
      setNewCompany({
        ...emptyNewCompany,
        contactEmail: newCompany.contactEmail,
        contactPhone: newCompany.contactPhone,
      });
      setCompanies((prev) => [created, ...prev.filter((c) => c._id !== created._id)]);
      setSelectedId(created._id);
      window.dispatchEvent(new CustomEvent('jk:companies-updated', { detail: { companyId: created._id } }));
      await refreshUser();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleAssetUpload = async (type: 'logo' | 'banner', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !selectedCompany) return;
    const fd = new FormData();
    fd.append('image', file);
    try {
      const res = await api.post(`/recruiter/companies/${selectedCompany._id}/${type}`, fd);
      const updated = res.data.data as Company;
      setCompanies((prev) => prev.map((c) => (c._id === updated._id ? updated : c)));
      window.dispatchEvent(new CustomEvent('jk:companies-updated', { detail: { companyId: updated._id } }));
      await refreshUser();
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (loading || !recProfile) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Companies &amp; Recruiter Profile</h1>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <span>Recruiter Account Status:</span>
            <StatusIndicator status={recProfile.verificationStatus} />
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateForm((v) => !v)}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] transition-colors shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>{showCreateForm ? 'Close New Company Form' : 'Add New Company'}</span>
        </button>
      </div>

      {/* Add New Company Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreateCompany}
          className="rounded-xl border border-blue-200 dark:border-blue-800 bg-white dark:bg-slate-900 p-6 space-y-4"
        >
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Create Additional Company</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Add another company or client organization you are hiring for. After creation, you can upload its logo, banner, and publish jobs under it.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Company Name *</label>
              <input
                type="text"
                required
                minLength={2}
                value={newCompany.companyName}
                onChange={(e) => setNewCompany({ ...newCompany, companyName: e.target.value })}
                placeholder="e.g. Horizon FinTech Pvt Ltd"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Industry</label>
              <input
                type="text"
                value={newCompany.industry}
                onChange={(e) => setNewCompany({ ...newCompany, industry: e.target.value })}
                placeholder="e.g. FinTech, Healthcare, SaaS"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Headquarters *</label>
              <input
                type="text"
                required
                value={newCompany.headquarters}
                onChange={(e) => setNewCompany({ ...newCompany, headquarters: e.target.value })}
                placeholder="e.g. Mumbai, Maharashtra"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Company Size</label>
              <select
                value={newCompany.size}
                onChange={(e) => setNewCompany({ ...newCompany, size: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
              >
                <option value="1-50 employees">1-50 employees</option>
                <option value="50-200 employees">50-200 employees</option>
                <option value="200-500 employees">200-500 employees</option>
                <option value="500-1,000 employees">500-1,000 employees</option>
                <option value="1,000+ employees">1,000+ employees</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Website</label>
              <input
                type="url"
                value={newCompany.website}
                onChange={(e) => setNewCompany({ ...newCompany, website: e.target.value })}
                placeholder="https://company.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Contact Email</label>
              <input
                type="email"
                value={newCompany.contactEmail}
                onChange={(e) => setNewCompany({ ...newCompany, contactEmail: e.target.value })}
                placeholder="hiring@company.com"
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Company Description</label>
            <textarea
              rows={3}
              value={newCompany.description}
              onChange={(e) => setNewCompany({ ...newCompany, description: e.target.value })}
              placeholder="Briefly describe the company, products, and hiring culture..."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateForm(false)}
              className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={creating}
              className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
            >
              {creating ? 'Creating...' : 'Create Company'}
            </button>
          </div>
        </form>
      )}

      {/* Recruiter Personal Details */}
      <form
        onSubmit={handleSavePersonal}
        className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900 dark:text-white">Your Recruiter Details</h2>
          <button
            type="submit"
            disabled={savingPersonal}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-60"
          >
            {savingPersonal ? 'Saving...' : 'Save Recruiter Details'}
          </button>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium mb-1">Your Name</label>
            <input
              type="text"
              value={recName}
              onChange={(e) => setRecName(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Your Designation</label>
            <input
              type="text"
              value={recProfile.designation}
              onChange={(e) => setRecProfile({ ...recProfile, designation: e.target.value })}
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
        </div>
      </form>

      {/* Company Switcher Strip */}
      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          Your Companies ({companies.length}) — Select a company to manage
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {companies.map((c) => {
            const active = selectedCompany?._id === c._id;
            return (
              <button
                key={c._id}
                type="button"
                onClick={() => setSelectedId(c._id)}
                className={`text-left rounded-xl border p-4 transition-all flex items-center gap-3 ${
                  active
                    ? 'border-blue-600 bg-blue-50/50 dark:bg-blue-950/30 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-blue-400'
                }`}
              >
                <div className="w-10 h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                  {c.logoUrl ? (
                    <img src={resolveApiAssetUrl(c.logoUrl)} alt={c.name} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                  ) : (
                    <Building2 className="w-5 h-5 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{c.name}</p>
                  <div className="mt-0.5 flex items-center gap-2">
                    <StatusIndicator status={c.verified ? 'Verified' : 'Pending'} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {selectedCompany && (
        <>
          {/* Logo & Banner Upload for Selected Company */}
          <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            <div className="h-36 bg-slate-100 dark:bg-slate-800 relative">
              {selectedCompany.bannerUrl && (
                <img
                  src={resolveApiAssetUrl(selectedCompany.bannerUrl)}
                  alt={`${selectedCompany.name} banner`}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              )}
              <label className="absolute right-4 bottom-3 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white/95 text-slate-900 shadow cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload Banner</span>
                <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleAssetUpload('banner', e)} className="hidden" />
              </label>
            </div>

            <div className="p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center overflow-hidden shrink-0">
                  {selectedCompany.logoUrl ? (
                    <img
                      src={resolveApiAssetUrl(selectedCompany.logoUrl)}
                      alt={selectedCompany.name}
                      referrerPolicy="no-referrer"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <Building2 className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-base font-semibold text-slate-900 dark:text-white">{selectedCompany.name}</h2>
                    <StatusIndicator status={selectedCompany.verified ? 'Verified' : 'Pending'} />
                  </div>
                  <label className="mt-1 inline-block text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                    Upload optimized company logo (JPEG, PNG, WebP)
                    <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleAssetUpload('logo', e)} className="hidden" />
                  </label>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  to={`/companies/${selectedCompany._id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                >
                  <span>Public Page</span>
                  <ExternalLink className="w-3 h-3" />
                </Link>
                <Link
                  to={`/recruiter/jobs/new?companyId=${selectedCompany._id}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Job for {selectedCompany.name}</span>
                </Link>
              </div>
            </div>
          </section>

          <form onSubmit={handleSaveCompany} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium mb-1">Company Name *</label>
                <input
                  type="text"
                  required
                  value={selectedCompany.name}
                  onChange={(e) => updateSelectedCompanyField({ name: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Industry</label>
                <input
                  type="text"
                  value={selectedCompany.industry}
                  onChange={(e) => updateSelectedCompanyField({ industry: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Website</label>
                <input
                  type="url"
                  value={selectedCompany.website}
                  onChange={(e) => updateSelectedCompanyField({ website: e.target.value })}
                  placeholder="https://company.com"
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Company Size</label>
                <select
                  value={selectedCompany.size}
                  onChange={(e) => updateSelectedCompanyField({ size: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="1-50 employees">1-50 employees</option>
                  <option value="50-200 employees">50-200 employees</option>
                  <option value="200-500 employees">200-500 employees</option>
                  <option value="500-1,000 employees">500-1,000 employees</option>
                  <option value="1,000+ employees">1,000+ employees</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Headquarters</label>
                <input
                  type="text"
                  value={selectedCompany.headquarters}
                  onChange={(e) => updateSelectedCompanyField({ headquarters: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Email</label>
                <input
                  type="email"
                  value={selectedCompany.contactEmail}
                  onChange={(e) => updateSelectedCompanyField({ contactEmail: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={selectedCompany.contactPhone || ''}
                  onChange={(e) => updateSelectedCompanyField({ contactPhone: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">LinkedIn URL</label>
                <input
                  type="url"
                  value={selectedCompany.socialLinks?.linkedin || ''}
                  onChange={(e) =>
                    updateSelectedCompanyField({
                      socialLinks: { ...selectedCompany.socialLinks, linkedin: e.target.value },
                    })
                  }
                  placeholder="https://linkedin.com/company/..."
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium mb-1">Company Description</label>
              <textarea
                rows={4}
                value={selectedCompany.description}
                onChange={(e) => updateSelectedCompanyField({ description: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>

            <button
              type="submit"
              disabled={savingCompany}
              className="px-6 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
            >
              {savingCompany ? 'Saving...' : `Save ${selectedCompany.name}`}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
