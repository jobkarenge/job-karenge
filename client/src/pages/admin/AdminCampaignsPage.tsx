import { CheckCircle2, ExternalLink, RefreshCw, Send } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PaginationControls, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import { formatShortDate } from '../../utils/formatters';

export interface EmailDiagnostics {
  provider: 'gmail';
  emailConfigured: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  gmailUserHint: string;
  gmailUserConfigured?: boolean;
  appPasswordHint: string;
  appPasswordValidLength?: boolean;
  fromEmail: string;
  fromName: string;
  fromEmailValid?: boolean;
  fromEmailSource?: 'admin_settings' | 'env' | 'default';
  fromNameSource?: 'admin_settings' | 'env' | 'default';
  clientUrl?: string;
  serverUrl?: string;
  envDefaults?: {
    fromEmail: string;
    fromName: string;
    clientUrl: string;
    serverUrl: string;
  };
  integrationStatus?: {
    mongodbConfigured: boolean;
    cloudinaryConfigured: boolean;
    emailConfigured: boolean;
  };
  cloudinaryDetails?: {
    configured: boolean;
    cloudName?: string;
    source?: 'env_vars' | 'cloudinary_url' | 'none';
    missingVars?: string[];
  };
  serverRuntime?: {
    nodeEnv: string;
    port: number;
  };
  smtpVerification?: {
    ok: boolean;
    host: string;
    port: number;
    secure: boolean;
    gmailUser?: string;
    fromEmail: string;
    error?: string;
  };
}

interface CampaignRow {
  _id: string;
  title: string;
  subject: string;
  targetAudience: string;
  scheduledDate?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  lastStatsSyncAt?: string;
  stats: {
    sent: number;
    accepted?: number;
    delivered: number;
    failed: number;
    bounced: number;
    unsubscribed?: number;
    opened?: number;
    clicked?: number;
  };
  createdAt: string;
}

interface EmailLogRow {
  _id: string;
  recipientEmail: string;
  type: string;
  templateName: string;
  subject: string;
  status: string;
  provider?: string;
  smtpEvent?: string;
  brevoEvent?: string;
  messageId?: string;
  error?: string;
  createdAt: string;
  deliveredAt?: string;
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_candidates: 'All Subscribed Candidates',
  daily_subscribers: 'Daily Job Digest Subscribers',
  weekly_subscribers: 'Weekly Job Digest Subscribers',
  featured_subscribers: 'Featured Job Alert Subscribers',
};

const PAGE_SIZE = 20;

export function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [diag, setDiag] = useState<EmailDiagnostics | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [verifyingSmtp, setVerifyingSmtp] = useState(false);
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);
  const [lastTestError, setLastTestError] = useState('');
  const [campaignPage, setCampaignPage] = useState(1);
  const [logPage, setLogPage] = useState(1);
  const [form, setForm] = useState({
    title: '',
    subject: '',
    targetAudience: 'all_candidates',
    scheduledDate: '',
  });
  const [loading, setLoading] = useState(true);

  const loadAll = (verifySmtp = false) => {
    setLoading(true);
    Promise.all([
      api.get('/admin/email-campaigns'),
      api.get('/admin/email-logs'),
      api.get(`/admin/email-diagnostics${verifySmtp ? '?verify=true' : ''}`),
    ])
      .then(([cRes, lRes, dRes]) => {
        setCampaigns(cRes.data.data || []);
        setLogs(lRes.data.data || []);
        setDiag(dRes.data.data || null);
      })
      .finally(() => setLoading(false));
  };

  const refreshLogsOnly = async () => {
    const lRes = await api.get('/admin/email-logs');
    setLogs(lRes.data.data || []);
  };

  const refreshCampaignsAndLogs = async () => {
    const [cRes, lRes] = await Promise.all([
      api.get('/admin/email-campaigns'),
      api.get('/admin/email-logs'),
    ]);
    setCampaigns(cRes.data.data || []);
    setLogs(lRes.data.data || []);
  };

  useEffect(() => {
    loadAll(false);
  }, []);

  const handleTestEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestingEmail(true);
    setLastTestError('');
    try {
      const res = await api.post('/admin/test-email', testTo.trim() ? { to: testTo.trim() } : {});
      const status = res.data?.data?.status;
      if (status === 'failed') {
        setLastTestError(res.data?.data?.error || res.data.message);
        toast.error(res.data.message);
      } else if (status === 'simulated') {
        setLastTestError(res.data.message);
        toast.warning(res.data.message);
      } else {
        toast.success(res.data.message);
      }
      await refreshLogsOnly();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setLastTestError(msg);
      toast.error(msg);
    } finally {
      setTestingEmail(false);
    }
  };

  const handleVerifySmtp = async () => {
    setVerifyingSmtp(true);
    try {
      const res = await api.get('/admin/email-diagnostics?verify=true');
      const d: EmailDiagnostics | null = res.data?.data || null;
      setDiag(d);
      if (d?.smtpVerification?.ok) {
        toast.success(
          `Gmail SMTP connection verified (${d.smtpVerification.host}:${d.smtpVerification.port}).`
        );
      } else {
        toast.error(d?.smtpVerification?.error || 'Could not verify Gmail SMTP connection.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setVerifyingSmtp(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload: Record<string, string> = {
        title: form.title,
        subject: form.subject,
        targetAudience: form.targetAudience,
      };
      if (form.scheduledDate) {
        payload.scheduledDate = new Date(form.scheduledDate).toISOString();
      }
      const res = await api.post('/admin/email-campaigns', payload);
      setForm({ title: '', subject: '', targetAudience: 'all_candidates', scheduledDate: '' });
      toast.success(
        payload.scheduledDate
          ? 'Promotional email campaign scheduled.'
          : 'Promotional email campaign draft created.'
      );
      if (res.data?.data) {
        setCampaigns((prev) => [res.data.data, ...prev]);
        setCampaignPage(1);
      } else {
        const cRes = await api.get('/admin/email-campaigns');
        setCampaigns(cRes.data.data || []);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await api.post(`/admin/email-campaigns/${id}/send`);
      toast.success(res.data.message);
      await refreshCampaignsAndLogs();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleSyncStats = async (id: string) => {
    setSyncingCampaignId(id);
    try {
      const res = await api.post(`/admin/email-campaigns/${id}/sync-stats`);
      toast.success(res.data.message);
      if (res.data?.data) {
        setCampaigns((prev) => prev.map((c) => (c._id === id ? res.data.data : c)));
      } else {
        const cRes = await api.get('/admin/email-campaigns');
        setCampaigns(cRes.data.data || []);
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSyncingCampaignId(null);
    }
  };

  if (loading) return <SkeletonList rows={4} />;

  const campaignTotalPages = Math.max(1, Math.ceil(campaigns.length / PAGE_SIZE));
  const safeCampaignPage = Math.min(campaignPage, campaignTotalPages);
  const pagedCampaigns = campaigns.slice((safeCampaignPage - 1) * PAGE_SIZE, safeCampaignPage * PAGE_SIZE);

  const logTotalPages = Math.max(1, Math.ceil(logs.length / PAGE_SIZE));
  const safeLogPage = Math.min(logPage, logTotalPages);
  const pagedLogs = logs.slice((safeLogPage - 1) * PAGE_SIZE, safeLogPage * PAGE_SIZE);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Email Campaigns &amp; Delivery Logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Schedule promotional digests, dispatch branded Job Karenge emails via Gmail SMTP, and monitor delivery logs.
        </p>
      </div>

      {diag && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Active Gmail SMTP Configuration
                </p>
                <StatusIndicator status={diag.emailConfigured ? 'Active' : 'Pending'} />
                <Link
                  to="/admin/governance"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Edit Sender &amp; Env Settings <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                Server: <span className="font-mono font-medium">{diag.smtpHost}:{diag.smtpPort}</span> ({diag.smtpSecure ? 'SSL/TLS' : 'STARTTLS'}) · Gmail User:{' '}
                <span className="font-mono font-medium">{diag.gmailUserHint}</span> · App Password:{' '}
                <span className="font-mono font-medium">{diag.appPasswordHint}</span>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Sender:{' '}
                <span className="font-mono font-medium">
                  {diag.fromName} &lt;{diag.fromEmail}&gt;
                </span>{' '}
                <span className="text-slate-400">
                  ({diag.fromEmailSource === 'admin_settings' ? 'from Admin Settings' : diag.fromEmailSource === 'env' ? 'from Env Secret' : 'default'})
                </span>
              </p>
              {diag.emailConfigured && diag.appPasswordValidLength === false && (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  Warning: Google App Passwords are 16 characters. Verify GMAIL_APP_PASSWORD in server environment variables.
                </p>
              )}
              {diag.smtpVerification && (
                <p className={diag.smtpVerification.ok ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 dark:text-rose-400 font-medium'}>
                  {diag.smtpVerification.ok
                    ? `Live Gmail SMTP Verified: ${diag.smtpVerification.host}:${diag.smtpVerification.port} (Authenticated as ${diag.gmailUserHint})`
                    : `Live Gmail SMTP Check Failed: ${diag.smtpVerification.error}`}
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleVerifySmtp}
                disabled={verifyingSmtp || !diag.emailConfigured}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {verifyingSmtp ? 'Verifying...' : 'Verify SMTP Connection'}
              </button>
            </div>
          </div>

          <form onSubmit={handleTestEmail} className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center gap-2">
            <input
              type="email"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
              placeholder="Test recipient (blank = your email)"
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent w-64"
            />
            <button
              type="submit"
              disabled={testingEmail}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white disabled:opacity-60"
            >
              {testingEmail ? 'Sending...' : 'Send Test Email'}
            </button>
          </form>

          {lastTestError && (
            <div className="rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 px-3.5 py-2.5 text-xs text-rose-700 dark:text-rose-300">
              {lastTestError}
            </div>
          )}
        </section>
      )}

      <form onSubmit={handleCreate} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-4">
        <h2 className="text-base font-semibold">New Promotional Email Campaign</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <input
            type="text"
            required
            placeholder="Campaign Name (e.g. Weekly Engineering Digest)"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
          <input
            type="text"
            required
            placeholder="Email Subject Line"
            value={form.subject}
            onChange={(e) => setForm({ ...form, subject: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
          <select
            value={form.targetAudience}
            onChange={(e) => setForm({ ...form, targetAudience: e.target.value })}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900"
          >
            <option value="all_candidates">All Subscribed Candidates</option>
            <option value="daily_subscribers">Daily Job Digest Subscribers</option>
            <option value="weekly_subscribers">Weekly Job Digest Subscribers</option>
            <option value="featured_subscribers">Featured Job Alert Subscribers</option>
          </select>
          <input
            type="datetime-local"
            value={form.scheduledDate}
            onChange={(e) => setForm({ ...form, scheduledDate: e.target.value })}
            title="Optional scheduled date & time"
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
          />
        </div>
        <button type="submit" className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white">
          {form.scheduledDate ? 'Schedule Campaign' : 'Create Draft Campaign'}
        </button>
      </form>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-semibold">Email Campaigns</h2>
            <p className="text-xs text-slate-500">
              Counts reflect Gmail SMTP dispatches and tracked delivery logs across subscribed candidates.
            </p>
          </div>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="py-3 px-4">Campaign &amp; Subject</th>
              <th className="py-3 px-4">Audience</th>
              <th className="py-3 px-4">Scheduled</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Sent</th>
              <th className="py-3 px-4 text-right">Delivered</th>
              <th className="py-3 px-4 text-right">Failed</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedCampaigns.map((c) => (
              <tr key={c._id}>
                <td className="py-3 px-4">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white">{c.title}</p>
                  <p className="text-xs text-slate-500">{c.subject}</p>
                </td>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-300">
                  {AUDIENCE_LABELS[c.targetAudience] || c.targetAudience}
                </td>
                <td className="py-3 px-4 tabular-nums text-slate-500">
                  {c.scheduledDate ? formatShortDate(c.scheduledDate) : formatShortDate(c.createdAt)}
                </td>
                <td className="py-3 px-4">
                  <StatusIndicator status={c.status} />
                </td>
                <td className="py-3 px-4 text-right tabular-nums font-medium">{c.stats.sent ?? 0}</td>
                <td className="py-3 px-4 text-right tabular-nums text-emerald-700 dark:text-emerald-400">
                  {c.stats.delivered ?? 0}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-rose-700 dark:text-rose-400">
                  {c.stats.failed ?? 0}
                </td>
                <td className="py-3 px-4 text-right">
                  <div className="inline-flex items-center justify-end gap-2">
                    {c.status !== 'sent' && (
                      <button
                        type="button"
                        onClick={() => handleSend(c._id)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white whitespace-nowrap"
                      >
                        <Send className="w-3 h-3" /> Dispatch
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleSyncStats(c._id)}
                      disabled={syncingCampaignId === c._id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 whitespace-nowrap disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${syncingCampaignId === c._id ? 'animate-spin' : ''}`} />
                      Refresh Stats
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-sm text-slate-500">
                  No campaigns created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <PaginationControls
          page={safeCampaignPage}
          totalPages={campaignTotalPages}
          totalItems={campaigns.length}
          pageSize={PAGE_SIZE}
          onPageChange={setCampaignPage}
        />
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Recent Email Delivery Logs</h2>
            <p className="text-xs text-slate-500">
              Successful Gmail SMTP dispatches record <span className="font-mono">sent</span>; rejections or missing credentials record <span className="font-mono">failed</span> or <span className="font-mono">simulated</span>.
            </p>
          </div>
          <button
            type="button"
            onClick={refreshLogsOnly}
            className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800"
          >
            Refresh Logs
          </button>
        </div>
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-xs text-slate-500">
            <tr>
              <th className="py-3 px-4">Recipient</th>
              <th className="py-3 px-4">Template &amp; Subject</th>
              <th className="py-3 px-4">Provider / Event</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {pagedLogs.map((l) => (
              <tr key={l._id}>
                <td className="py-3 px-4 text-xs">{l.recipientEmail}</td>
                <td className="py-3 px-4">
                  <p className="text-xs font-medium">{l.subject}</p>
                  <p className="text-[11px] text-slate-500">{l.type} · {l.templateName}</p>
                </td>
                <td className="py-3 px-4 text-[11px] font-mono text-slate-500">
                  {l.provider || 'gmail_smtp'}
                  {l.smtpEvent || l.brevoEvent ? ` · ${l.smtpEvent || l.brevoEvent}` : ''}
                </td>
                <td className="py-3 px-4">
                  <StatusIndicator status={l.status} />
                  {l.error && (
                    <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400 max-w-xs break-words">
                      {l.error}
                    </p>
                  )}
                </td>
                <td className="py-3 px-4 text-xs text-slate-500 tabular-nums">
                  {formatShortDate(l.deliveredAt || l.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls
          page={safeLogPage}
          totalPages={logTotalPages}
          totalItems={logs.length}
          pageSize={PAGE_SIZE}
          onPageChange={setLogPage}
        />
      </section>
    </div>
  );
}
