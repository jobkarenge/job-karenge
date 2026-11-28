import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { PaginationControls, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Company, RecruiterProfile, User } from '../../types';

interface AdminUserRow extends User {
  recruiterProfile?: RecruiterProfile | null;
}

interface RecruiterRow extends RecruiterProfile {
  user?: User | null;
  company?: Company | null;
}

export function AdminUsersAndRecruitersPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab: 'recruiters' | 'users' = searchParams.get('tab') === 'users' ? 'users' : 'recruiters';
  const roleFilter = searchParams.get('role') || '';
  const statusFilter = searchParams.get('status') || '';
  const [recruiters, setRecruiters] = useState<RecruiterRow[]>([]);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recruiterPage, setRecruiterPage] = useState(1);
  const [userPage, setUserPage] = useState(1);
  const PAGE_SIZE = 20;

  const load = () => {
    setLoading(true);
    Promise.all([api.get('/admin/recruiters'), api.get('/admin/users')])
      .then(([rRes, uRes]) => {
        setRecruiters(rRes.data.data || []);
        setUsers(uRes.data.data || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleVerifyRecruiter = async (userId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await api.patch(`/admin/recruiters/${userId}/verification`, { status });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleUserStatus = async (userId: string, accountStatus: 'active' | 'suspended') => {
    try {
      const res = await api.patch(`/admin/users/${userId}/status`, { accountStatus });
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  useEffect(() => {
    setRecruiterPage(1);
    setUserPage(1);
  }, [tab, roleFilter, statusFilter]);

  const pendingRecruiters = recruiters.filter((r) => r.verificationStatus === 'pending');
  const visibleRecruiters = statusFilter
    ? recruiters.filter((r) => r.verificationStatus === statusFilter)
    : pendingRecruiters;
  const visibleUsers = roleFilter ? users.filter((u) => u.role === roleFilter) : users;

  const recruiterTotalPages = Math.max(1, Math.ceil(visibleRecruiters.length / PAGE_SIZE));
  const safeRecruiterPage = Math.min(recruiterPage, recruiterTotalPages);
  const pagedRecruiters = visibleRecruiters.slice((safeRecruiterPage - 1) * PAGE_SIZE, safeRecruiterPage * PAGE_SIZE);

  const userTotalPages = Math.max(1, Math.ceil(visibleUsers.length / PAGE_SIZE));
  const safeUserPage = Math.min(userPage, userTotalPages);
  const pagedUsers = visibleUsers.slice((safeUserPage - 1) * PAGE_SIZE, safeUserPage * PAGE_SIZE);

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Users &amp; Recruiter Verification</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Review pending recruiter verifications in the queue and manage all verified accounts under All Users.
          </p>
        </div>

        <div className="inline-flex p-1 rounded-lg bg-slate-100 dark:bg-slate-800">
          <button
            type="button"
            onClick={() => {
              setSearchParams({ tab: 'recruiters' });
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'recruiters' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            Recruiter Queue ({pendingRecruiters.length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSearchParams({ tab: 'users' });
            }}
            className={`px-3.5 py-1.5 text-xs font-semibold rounded-md ${
              tab === 'users' ? 'bg-white dark:bg-slate-900 shadow-sm' : 'text-slate-500'
            }`}
          >
            All Users ({visibleUsers.length})
          </button>
        </div>
      </div>

      {(roleFilter || statusFilter) && (
        <div className="flex items-center justify-between rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-2.5 text-xs">
          <span className="text-slate-600 dark:text-slate-300">
            Filtered by: <strong className="capitalize">{roleFilter || statusFilter}</strong>
          </span>
          <button
            type="button"
            onClick={() => setSearchParams({ tab })}
            className="font-semibold text-blue-600 hover:underline"
          >
            Clear filter
          </button>
        </div>
      )}

      {tab === 'recruiters' ? (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3.5 px-4 font-semibold">Recruiter</th>
                <th className="py-3.5 px-4 font-semibold">Company &amp; Designation</th>
                <th className="py-3.5 px-4 font-semibold">Status</th>
                <th className="py-3.5 px-4 font-semibold text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedRecruiters.map((r) => (
                <tr key={r._id}>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold">{r.user?.name || 'Recruiter'}</p>
                    <p className="text-xs text-slate-500">{r.user?.email}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="font-medium">{r.companyName}</p>
                    <p className="text-xs text-slate-500">{r.designation}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusIndicator status={r.verificationStatus} />
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    {r.verificationStatus !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => handleVerifyRecruiter(r.userId, 'approved')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white"
                      >
                        Approve
                      </button>
                    )}
                    {r.verificationStatus !== 'rejected' && (
                      <button
                        type="button"
                        onClick={() => handleVerifyRecruiter(r.userId, 'rejected')}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-rose-200 text-rose-600"
                      >
                        Reject
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visibleRecruiters.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-sm text-slate-500">
                    No pending recruiters in the verification queue. Verified recruiters are listed under All Users.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <PaginationControls
            page={safeRecruiterPage}
            totalPages={recruiterTotalPages}
            totalItems={visibleRecruiters.length}
            pageSize={PAGE_SIZE}
            onPageChange={setRecruiterPage}
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              <tr>
                <th className="py-3.5 px-4 font-semibold">User</th>
                <th className="py-3.5 px-4 font-semibold">Role &amp; Organization</th>
                <th className="py-3.5 px-4 font-semibold">Account Status</th>
                <th className="py-3.5 px-4 font-semibold">Verification</th>
                <th className="py-3.5 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {pagedUsers.map((u) => (
                <tr key={u._id}>
                  <td className="py-3.5 px-4">
                    <p className="font-semibold">{u.name}</p>
                    <p className="text-xs text-slate-500">{u.email}</p>
                  </td>
                  <td className="py-3.5 px-4">
                    <p className="capitalize text-xs font-semibold">{u.role}</p>
                    {u.recruiterProfile && (
                      <p className="text-xs text-slate-500">{u.recruiterProfile.companyName}</p>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusIndicator status={u.accountStatus} />
                  </td>
                  <td className="py-3.5 px-4">
                    {u.role === 'recruiter' && u.recruiterProfile ? (
                      <StatusIndicator status={u.recruiterProfile.verificationStatus} />
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                  <td className="py-3.5 px-4 text-right space-x-2">
                    {u.role === 'recruiter' && u.recruiterProfile && (
                      <button
                        type="button"
                        onClick={() =>
                          handleVerifyRecruiter(
                            u._id,
                            u.recruiterProfile!.verificationStatus === 'approved' ? 'rejected' : 'approved'
                          )
                        }
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        {u.recruiterProfile.verificationStatus === 'approved' ? 'Revoke' : 'Approve'}
                      </button>
                    )}
                    {u.role !== 'admin' && (
                      <button
                        type="button"
                        onClick={() => handleUserStatus(u._id, u.accountStatus === 'suspended' ? 'active' : 'suspended')}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700"
                      >
                        {u.accountStatus === 'suspended' ? 'Reactivate' : 'Suspend'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                    No users match this filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <PaginationControls
            page={safeUserPage}
            totalPages={userTotalPages}
            totalItems={visibleUsers.length}
            pageSize={PAGE_SIZE}
            onPageChange={setUserPage}
          />
        </div>
      )}
    </div>
  );
}
