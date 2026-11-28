import { CheckCircle2, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmptyState, PasswordInput, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { JobCard } from '../../components/jobs/JobCard';
import { useNotifications } from '../../context/NotificationContext';
import { api, fetchCategories, getApiErrorMessage, invalidateSavedJobsCache } from '../../services/api';
import type { EmailPreference, Interview, Job } from '../../types';
import { formatRelativeDate } from '../../utils/formatters';

export function CandidateSavedJobsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<Array<{ _id: string; jobId: string; job: Job }>>([]);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    api
      .get('/candidate/saved-jobs')
      .then((res) => setItems(res.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleToggleSave = async (jobId: string) => {
    await api.post(`/candidate/saved-jobs/${jobId}`);
    invalidateSavedJobsCache();
    setItems((prev) => prev.filter((item) => item.jobId !== jobId));
    toast.success('Removed from saved jobs.');
  };

  if (loading) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Saved Jobs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Bookmarked roles with live deadline tracking.
        </p>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title="No saved jobs"
          description="Bookmark openings while browsing to compare compensation and deadlines here."
          actionLabel="Browse Jobs"
          onAction={() => navigate('/jobs')}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {items.map((item) => (
            <JobCard key={item._id} job={item.job} isSaved onToggleSave={handleToggleSave} />
          ))}
        </div>
      )}
    </div>
  );
}

export function CandidateInterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);

  const load = (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    api
      .get('/interviews')
      .then((res) => setInterviews(res.data.data || []))
      .finally(() => {
        if (showSpinner) setLoading(false);
      });
  };

  useEffect(() => {
    load(true);
    const onNotif = () => load(false);
    window.addEventListener('jk:notification-received', onNotif);
    return () => window.removeEventListener('jk:notification-received', onNotif);
  }, []);

  const handleConfirm = async (id: string) => {
    try {
      const res = await api.patch(`/interviews/${id}/confirm`);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (loading) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Interview Schedule</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Confirm attendance and review meeting instructions for scheduled interviews.
        </p>
      </div>

      {interviews.length === 0 ? (
        <EmptyState
          title="No interviews scheduled"
          description="When a hiring team invites you to an interview, details and meeting links appear here."
        />
      ) : (
        <div className="space-y-4">
          {interviews.map((item) => (
            <div
              key={item._id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {item.job?.title || 'Interview'}
                  </h2>
                  <StatusIndicator status={item.status} />
                </div>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {item.job?.companyName} · {item.type} · Interviewer: {item.interviewerName}
                </p>
                <p className="text-xs text-slate-500 tabular-nums">
                  {item.date} at {item.time} ({item.timezone})
                  {item.meetingLinkOrLocation?.trim()
                    ? ` · ${item.meetingLinkOrLocation}`
                    : item.type === 'In-person'
                      ? ' · In-person / Offline'
                      : ''}
                </p>
                {item.instructions && (
                  <p className="text-xs text-slate-600 dark:text-slate-400 pt-1">Instructions: {item.instructions}</p>
                )}
              </div>

              <div className="shrink-0">
                {item.status === 'Cancelled' ? null : item.candidateConfirmed ? (
                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-600">
                    <CheckCircle2 className="w-4 h-4" /> Attendance Confirmed
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConfirm(item._id)}
                    className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e]"
                  >
                    Confirm Attendance
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function NotificationsPage() {
  const { notifications, markRead, markAllRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Notifications</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Real-time updates on applications and interviews.</p>
        </div>
        {notifications.length > 0 && (
          <button
            type="button"
            onClick={markAllRead}
            className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Mark all as read
          </button>
        )}
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="All caught up" description="You have no notifications at the moment." />
      ) : (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 divide-y divide-slate-100 dark:divide-slate-800">
          {notifications.map((n) => (
            <div key={n._id} className="p-5 flex items-start justify-between gap-4">
              <div
                onClick={() => {
                  if (!n.read) markRead(n._id);
                  if (n.link) navigate(n.link);
                }}
                className="cursor-pointer flex-1"
              >
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">{n.title}</h2>
                  {!n.read && <span className="text-[11px] font-semibold text-blue-600">Unread</span>}
                </div>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{n.message}</p>
                <p className="mt-1 text-xs text-slate-400">{formatRelativeDate(n.createdAt)}</p>
              </div>
              <button
                type="button"
                onClick={() => deleteNotification(n._id)}
                className="p-1.5 text-slate-400 hover:text-rose-600"
                aria-label="Delete notification"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CandidateEmailPreferencesPage() {
  const [pref, setPref] = useState<EmailPreference | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [locInput, setLocInput] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/email/preferences'), fetchCategories()]).then(([pRes, cats]) => {
      setPref(pRes.data.data);
      setCategories(cats.map((c) => c.name));
    });
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pref) return;
    setSaving(true);
    try {
      const res = await api.put('/email/preferences', pref);
      setPref(res.data.data);
      toast.success(res.data.message);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (!pref) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Email &amp; Job Alert Preferences</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Customize personalized digests. Essential application and interview updates remain active for your active roles.
        </p>
      </div>

      <form onSubmit={handleSave} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Subscriptions &amp; Alerts</h2>
          </div>
          {[
            { key: 'promotionalEmails', label: 'Promotional career updates and newsletters' },
            { key: 'dailyJobAlerts', label: 'Daily job alert summary' },
            { key: 'weeklyJobAlerts', label: 'Weekly curated role roundup' },
            { key: 'newJobNotifications', label: 'New job alert notifications matching your preferences' },
            { key: 'featuredJobAnnouncements', label: 'Featured job announcements from verified employers' },
            { key: 'applicationNotifications', label: 'Essential application status update emails (always recommended)' },
            { key: 'interviewNotifications', label: 'Essential interview schedule & reminder emails (always recommended)' },
          ].map((item) => (
            <label key={item.key} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={Boolean(pref[item.key as keyof EmailPreference])}
                onChange={(e) => setPref({ ...pref, [item.key]: e.target.checked })}
                className="rounded"
              />
              <span>{item.label}</span>
            </label>
          ))}
        </div>

        <div>
          <label className="block text-xs font-medium mb-1.5">Digest Frequency</label>
          <select
            value={pref.frequency}
            onChange={(e) => setPref({ ...pref, frequency: e.target.value as EmailPreference['frequency'] })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Preferred Categories</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {categories.map((cat) => {
              const checked = pref.preferredCategories.includes(cat);
              return (
                <label key={cat} className="flex items-center gap-2 text-xs p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = e.target.checked
                        ? [...pref.preferredCategories, cat]
                        : pref.preferredCategories.filter((c) => c !== cat);
                      setPref({ ...pref, preferredCategories: next });
                    }}
                  />
                  <span>{cat}</span>
                </label>
              );
            })}
          </div>
        </div>

        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-white mb-2">Preferred Locations</h2>
          <div className="flex gap-2">
            <input
              type="text"
              value={locInput}
              onChange={(e) => setLocInput(e.target.value)}
              placeholder="Add city or Remote"
              className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
            <button
              type="button"
              onClick={() => {
                if (!locInput.trim()) return;
                setPref({ ...pref, preferredLocations: [...pref.preferredLocations, locInput.trim()] });
                setLocInput('');
              }}
              className="px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700"
            >
              Add
            </button>
          </div>
          {pref.preferredLocations.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              {pref.preferredLocations.join(' · ')}{' '}
              <button
                type="button"
                onClick={() => setPref({ ...pref, preferredLocations: [] })}
                className="ml-2 text-rose-600 hover:underline"
              >
                Clear
              </button>
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save Email Preferences'}
        </button>
      </form>
    </div>
  );
}

export function AccountSettingsPage() {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.newPassword !== form.confirmPassword) {
      toast.error('New passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const res = await api.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      toast.success(res.data.message);
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Account Security &amp; Password</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Update your password periodically to protect your account.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1">Current Password</label>
          <PasswordInput
            required
            value={form.currentPassword}
            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">New Password (min 8 chars)</label>
          <PasswordInput
            required
            minLength={8}
            value={form.newPassword}
            onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1">Confirm New Password</label>
          <PasswordInput
            required
            minLength={8}
            value={form.confirmPassword}
            onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] disabled:opacity-60"
        >
          {saving ? 'Updating...' : 'Change Password'}
        </button>
      </form>
    </div>
  );
}
