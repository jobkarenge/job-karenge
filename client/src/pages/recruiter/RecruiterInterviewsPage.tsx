import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog, EmptyState, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import type { Interview } from '../../types';

export function RecruiterInterviewsPage() {
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Interview | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelId, setCancelId] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    api
      .get('/interviews')
      .then((res) => setInterviews(res.data.data || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleReschedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || saving) return;
    setSaving(true);
    try {
      const res = await api.put(`/interviews/${editing._id}`, {
        date: editing.date,
        time: editing.time,
        type: editing.type,
        meetingLinkOrLocation: editing.meetingLinkOrLocation,
        interviewerName: editing.interviewerName,
        instructions: editing.instructions,
        status: 'Rescheduled',
      });
      const { emailStatus, emailError } = res.data || {};
      if (emailStatus === 'failed') {
        toast.warning(
          `Interview rescheduled & candidate notified in-app, but email failed: ${emailError || 'Check Gmail SMTP sender configuration.'}`
        );
      } else if (emailStatus === 'queued') {
        toast.success('Interview rescheduled & candidate notified in-app. Email notification queued.');
      } else if (emailStatus === 'simulated') {
        toast.success('Interview rescheduled & candidate notified in-app (email logged in preview mode).');
      } else {
        toast.success('Interview rescheduled & candidate notified.');
      }
      setEditing(null);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = async () => {
    if (!cancelId) return;
    try {
      const res = await api.delete(`/interviews/${cancelId}`);
      const { emailStatus, emailError } = res.data || {};
      if (emailStatus === 'failed') {
        toast.warning(
          `Interview cancelled & candidate notified in-app, but email failed: ${emailError || 'Check Gmail SMTP configuration.'}`
        );
      } else {
        toast.success('Interview cancelled & candidate notified.');
      }
      setCancelId(null);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  if (loading) return <SkeletonList rows={3} />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Interview Management</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Reschedule slots, track candidate confirmations, or cancel interviews with automated email notices.
        </p>
      </div>

      {interviews.length === 0 ? (
        <EmptyState
          title="No interviews scheduled yet"
          description="Schedule interviews directly from any applicant row in the Applications pipeline."
        />
      ) : (
        <div className="space-y-4">
          {interviews.map((item) => (
            <div
              key={item._id}
              className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col md:flex-row md:items-center justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                    {item.candidate?.name} — {item.job?.title}
                  </h2>
                  <StatusIndicator status={item.status} />
                </div>
                <p className="text-xs text-slate-500 tabular-nums">
                  {item.date} at {item.time} ({item.timezone}) · {item.type} · Interviewer: {item.interviewerName}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {item.meetingLinkOrLocation?.trim()
                    ? item.meetingLinkOrLocation
                    : item.type === 'In-person'
                      ? 'In-person / Offline (No meeting link)'
                      : 'No link/location specified'}
                </p>
                <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {item.candidateConfirmed ? 'Candidate confirmed attendance' : 'Awaiting candidate confirmation'}
                </p>
              </div>

              {item.status !== 'Cancelled' && (
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditing(item)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
                  >
                    Reschedule / Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setCancelId(item._id)}
                    className="px-3.5 py-2 text-xs font-semibold rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
            <h2 className="text-lg font-bold">Reschedule Interview</h2>
            <form onSubmit={handleReschedule} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={editing.date}
                    onChange={(e) => setEditing({ ...editing, date: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">Time</label>
                  <input
                    type="time"
                    required
                    value={editing.time}
                    onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                    className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Interview Type</label>
                <select
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({ ...editing, type: e.target.value as 'Online' | 'In-person' | 'Phone' })
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                >
                  <option value="Online">Online</option>
                  <option value="In-person">In-person</option>
                  <option value="Phone">Phone</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">
                  {editing.type === 'Online'
                    ? 'Meeting Link *'
                    : editing.type === 'In-person'
                      ? 'Office Location (Optional for In-person / Offline)'
                      : 'Phone / Dial-in Info (Optional)'}
                </label>
                <input
                  type="text"
                  required={editing.type === 'Online'}
                  value={editing.meetingLinkOrLocation || ''}
                  onChange={(e) => setEditing({ ...editing, meetingLinkOrLocation: e.target.value })}
                  placeholder={
                    editing.type === 'Online'
                      ? 'https://meet.google.com/...'
                      : 'Optional: Office address or notes (can leave blank)'
                  }
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Interviewer Name</label>
                <input
                  type="text"
                  required
                  value={editing.interviewerName}
                  onChange={(e) => setEditing({ ...editing, interviewerName: e.target.value })}
                  className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setEditing(null)}
                  className="px-4 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-60"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white disabled:opacity-60"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(cancelId)}
        title="Cancel Interview"
        message="Are you sure you want to cancel this scheduled interview? An automated cancellation email will be sent to the candidate."
        confirmLabel="Cancel Interview"
        danger
        onConfirm={handleCancel}
        onCancel={() => setCancelId(null)}
      />
    </div>
  );
}
