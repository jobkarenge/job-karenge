import { Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Company, Job } from '../../types';

interface CategoryRow {
  _id: string;
  name: string;
  description: string;
}

export function AdminCompaniesAndJobsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [categories, setCategories] = useState<CategoryRow[]>([]);
  const [newCat, setNewCat] = useState({ name: '', description: '' });
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/admin/companies'), api.get('/admin/jobs'), api.get('/admin/categories')])
      .then(([cRes, jRes, catRes]) => {
        setCompanies(cRes.data.data || []);
        setJobs(jRes.data.data || []);
        setCategories(catRes.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const toggleCompanyVerify = async (c: Company) => {
    await api.patch(`/admin/companies/${c._id}/verify`, { verified: !c.verified });
    toast.success('Company verification updated.');
    load();
  };

  const toggleFeatureJob = async (j: Job) => {
    await api.patch(`/admin/jobs/${j._id}/feature`, { featured: !j.featured });
    toast.success('Featured status updated.');
    load();
  };

  const deleteJob = async (id: string) => {
    await api.delete(`/jobs/${id}`);
    toast.success('Job deleted.');
    load();
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/admin/categories', newCat);
      setNewCat({ name: '', description: '' });
      toast.success('Category added.');
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Companies, Jobs &amp; Categories</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Verify employer organizations, feature key roles, and maintain job categories.
        </p>
      </div>

      {/* Categories */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="text-base font-semibold">Manage Job Categories</h2>
        <form onSubmit={handleAddCategory} className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            required
            placeholder="Category name"
            value={newCat.name}
            onChange={(e) => setNewCat({ ...newCat, name: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
          <input
            type="text"
            placeholder="Short description"
            value={newCat.description}
            onChange={(e) => setNewCat({ ...newCat, description: e.target.value })}
            className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
          <button type="submit" className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white">
            Add Category
          </button>
        </form>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-2">
          {categories.map((cat) => (
            <div key={cat._id} className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold">{cat.name}</p>
                <p className="text-xs text-slate-500 mt-0.5">{cat.description}</p>
              </div>
              <button
                type="button"
                onClick={async () => {
                  await api.delete(`/admin/categories/${cat._id}`);
                  load();
                }}
                className="text-slate-400 hover:text-rose-600"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* Companies */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold">Registered Companies</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            <tr>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Industry</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {companies.map((c) => (
              <tr key={c._id}>
                <td className="py-3 px-4 font-semibold">{c.name}</td>
                <td className="py-3 px-4 text-xs text-slate-500">{c.industry} · {c.headquarters}</td>
                <td className="py-3 px-4">
                  <StatusIndicator status={c.verified ? 'Verified' : 'Pending'} />
                </td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    onClick={() => toggleCompanyVerify(c)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    {c.verified ? 'Revoke Verification' : 'Verify Company'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Jobs */}
      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold">All Platform Jobs</h2>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            <tr>
              <th className="py-3 px-4">Job Title</th>
              <th className="py-3 px-4">Company</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {jobs.map((j) => (
              <tr key={j._id}>
                <td className="py-3 px-4 font-semibold">{j.title}</td>
                <td className="py-3 px-4 text-xs text-slate-500">{j.companyName}</td>
                <td className="py-3 px-4">
                  <StatusIndicator status={j.status} />
                </td>
                <td className="py-3 px-4 text-right space-x-2">
                  <button
                    type="button"
                    onClick={() => toggleFeatureJob(j)}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    {j.featured ? 'Unfeature' : 'Feature'}
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteJob(j._id)}
                    className="px-3 py-1 text-xs font-medium rounded-lg border border-rose-200 text-rose-600"
                  >
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
