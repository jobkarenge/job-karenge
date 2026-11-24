import { CheckCircle2, ExternalLink, RefreshCw, Send, Users } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import { formatShortDate } from '../../utils/formatters';

interface CampaignRow {
  _id: string;
  title: string;
  subject: string;
  targetAudience: string;
  scheduledDate?: string;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
  brevoCampaignId?: number;
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
  brevoEvent?: string;
  messageId?: string;
  error?: string;
  createdAt: string;
  deliveredAt?: string;
}

interface EmailDiagnostics {
  provider: 'brevo';
  brevoConfigured: boolean;
  apiKeyHint: string;
  apiKeyStartsWithXkeysib?: boolean;
  apiKeyFormatValid?: boolean;
  brevoBaseUrl?: string;
  webhookSecretConfigured?: boolean;
  webhookEndpointUrl?: string;
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
    brevoBaseUrl?: string;
    clientUrl: string;
    serverUrl: string;
  };
  integrationStatus?: {
    mongodbConfigured: boolean;
    cloudinaryConfigured: boolean;
    brevoConfigured: boolean;
  };
  serverRuntime?: {
    nodeEnv: string;
    port: number;
  };
  accountVerification?: {
    ok: boolean;
    email?: string;
    planType?: string;
    credits?: number;
    smtpEnabled?: boolean;
    senderVerified?: boolean;
    error?: string;
  };
}

const AUDIENCE_LABELS: Record<string, string> = {
  all_candidates: 'All Subscribed Candidates',
  daily_subscribers: 'Daily Job Digest Subscribers',
  weekly_subscribers: 'Weekly Job Digest Subscribers',
  featured_subscribers: 'Featured Job Alert Subscribers',
};

export function AdminCampaignsPage() {
  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [logs, setLogs] = useState<EmailLogRow[]>([]);
  const [diag, setDiag] = useState<EmailDiagnostics | null>(null);
  const [testTo, setTestTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [syncingContacts, setSyncingContacts] = useState(false);
  const [verifyingAccount, setVerifyingAccount] = useState(false);
  const [syncingCampaignId, setSyncingCampaignId] = useState<string | null>(null);
  const [lastTestError, setLastTestError] = useState('');
  const [form, setForm] = useState({
    title: '',
    subject: '',
    targetAudience: 'all_candidates',
    scheduledDate: '',
  });
  const [loading, setLoading] = useState(true);

  const load = (verifyAccount = false) => {
    setLoading(true);
    Promise.all([
      api.get('/admin/email-campaigns'),
      api.get('/admin/email-logs'),
      api.get(`/admin/email-diagnostics${verifyAccount ? '?verify=true' : ''}`),
    ])
      .then(([cRes, lRes, dRes]) => {
        setCampaigns(cRes.data.data || []);
        setLogs(lRes.data.data || []);
        setDiag(dRes.data.data || null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(false);
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
      load();
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setLastTestError(msg);
      toast.error(msg);
    } finally {
      setTestingEmail(false);
    }
  };

  const handleVerifyBrevo = async () => {
    setVerifyingAccount(true);
    try {
      const res = await api.get('/admin/email-diagnostics?verify=true');
      const d: EmailDiagnostics | null = res.data?.data || null;
      setDiag(d);
      if (d?.accountVerification?.ok) {
        if (d.accountVerification.smtpEnabled === false) {
          toast.warning(
            'Brevo API key works, but Transactional SMTP is NOT activated yet on this Brevo account. Request activation from contact@brevo.com.'
          );
        } else {
          toast.success(
            `Brevo account verified (${d.accountVerification.email || 'active'}${
              d.accountVerification.planType ? ` · ${d.accountVerification.planType}` : ''
            }).`
          );
        }
      } else {
        toast.error(d?.accountVerification?.error || 'Could not verify Brevo account.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setVerifyingAccount(false);
    }
  };

  const handleSyncContacts = async () => {
    setSyncingContacts(true);
    try {
      const res = await api.post('/admin/email-sync-contacts');
      if (res.data?.success) {
        toast.success(res.data.message);
      } else {
        toast.error(res.data?.message || 'Contact sync failed.');
      }
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSyncingContacts(false);
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
      await api.post('/admin/email-campaigns', payload);
      setForm({ title: '', subject: '', targetAudience: 'all_candidates', scheduledDate: '' });
      toast.success(
        payload.scheduledDate
          ? 'Promotional email campaign scheduled.'
          : 'Promotional email campaign draft created.'
      );
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleSend = async (id: string) => {
    try {
      const res = await api.post(`/admin/email-campaigns/${id}/send`);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    }
  };

  const handleSyncStats = async (id: string) => {
    setSyncingCampaignId(id);
    try {
      const res = await api.post(`/admin/email-campaigns/${id}/sync-stats`);
      toast.success(res.data.message);
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSyncingCampaignId(null);
    }
  };

  if (loading) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Brevo Email Campaigns &amp; Delivery Logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Schedule promotional digests, synchronize candidate subscribers with Brevo contacts, and monitor real delivery &amp; webhook events.
        </p>
      </div>

      {diag && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1 text-xs">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-slate-900 dark:text-white">
                  Active Brevo Configuration
                </p>
                <StatusIndicator status={diag.brevoConfigured ? 'Active' : 'Pending'} />
                <Link
                  to="/admin/governance"
                  className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Edit Sender &amp; Env Settings <ExternalLink className="w-3 h-3" />
                </Link>
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                API Key: <span className="font-mono font-medium">{diag.apiKeyHint}</span> · Endpoint:{' '}
                <span className="font-mono">{diag.brevoBaseUrl || 'https://api.brevo.com/v3'}</span> · Sender:{' '}
                <span className="font-mono font-medium">
                  {diag.fromName} &lt;{diag.fromEmail}&gt;
                </span>{' '}
                <span className="text-slate-400">
                  ({diag.fromEmailSource === 'admin_settings' ? 'from Admin Settings' : diag.fromEmailSource === 'env' ? 'from Env Secret' : 'default'})
                </span>
              </p>
              <p className="text-slate-500 dark:text-slate-400">
                Webhook URL: <span className="font-mono">{diag.webhookEndpointUrl}</span>{' '}
                ({diag.webhookSecretConfigured ? 'secret protected' : 'no secret set'})
              </p>
              {diag.brevoConfigured && diag.apiKeyFormatValid === false && (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  Warning: Loaded key does not match Brevo&apos;s <span className="font-mono">xkeysib-...</span> v3 API key format.
                </p>
              )}
              {diag.accountVerification && (
                <div className="space-y-1">
                  <p className={diag.accountVerification.ok ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-rose-700 dark:text-rose-400 font-medium'}>
                    {diag.accountVerification.ok
                      ? `Live Brevo Account Verified: ${diag.accountVerification.email || 'Active'}${
                          diag.accountVerification.planType ? ` · Plan: ${diag.accountVerification.planType}` : ''
                        }${typeof diag.accountVerification.credits === 'number' ? ` · Credits: ${diag.accountVerification.credits}` : ''}`
                      : `Live Brevo Check Failed: ${diag.accountVerification.error}`}
                  </p>
                  {diag.accountVerification.ok && diag.accountVerification.smtpEnabled === false && (
                    <p className="text-rose-700 dark:text-rose-400 font-medium">
                      Transactional SMTP Disabled: Brevo has not activated SMTP sending on this account yet (403 permission_denied). Activate Transactional in Brevo or email contact@brevo.com.
                    </p>
                  )}
                  {diag.accountVerification.ok && diag.accountVerification.senderVerified === false && (
                    <p className="text-amber-700 dark:text-amber-400 font-medium">
                      Sender Notice: &quot;{diag.fromEmail}&quot; was not found among verified active senders in Brevo.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={handleVerifyBrevo}
                disabled={verifyingAccount || !diag.brevoConfigured}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                {verifyingAccount ? 'Verifying...' : 'Verify Account'}
              </button>
              <button
                type="button"
                onClick={handleSyncContacts}
                disabled={syncingContacts}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
              >
                <Users className="w-3.5 h-3.5" />
                {syncingContacts ? 'Syncing...' : 'Sync Contacts to Brevo'}
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
              Counts reflect real Brevo API acceptances, campaign stats syncs, and webhook delivery/engagement events.
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
              <th className="py-3 px-4 text-right">Bounced</th>
              <th className="py-3 px-4 text-right">Unsubscribed</th>
              <th className="py-3 px-4 text-right">Opens / Clicks</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {campaigns.map((c) => (
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
                  {c.stats.bounced ?? 0}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-amber-700 dark:text-amber-400">
                  {c.stats.unsubscribed ?? 0}
                </td>
                <td className="py-3 px-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                  {c.stats.opened ?? 0} / {c.stats.clicked ?? 0}
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
                      Sync Stats
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {campaigns.length === 0 && (
              <tr>
                <td colSpan={10} className="py-8 text-center text-sm text-slate-500">
                  No campaigns created yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Recent Email Delivery Logs</h2>
            <p className="text-xs text-slate-500">
              API acceptance transitions logs to <span className="font-mono">queued</span>; real <span className="font-mono">delivered</span> or <span className="font-mono">bounced</span> status updates arrive from Brevo webhooks.
            </p>
          </div>
          <button
            type="button"
            onClick={() => load()}
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
            {logs.slice(0, 25).map((l) => (
              <tr key={l._id}>
                <td className="py-3 px-4 text-xs">{l.recipientEmail}</td>
                <td className="py-3 px-4">
                  <p className="text-xs font-medium">{l.subject}</p>
                  <p className="text-[11px] text-slate-500">{l.type} · {l.templateName}</p>
                </td>
                <td className="py-3 px-4 text-[11px] font-mono text-slate-500">
                  {l.provider || 'brevo'}
                  {l.brevoEvent ? ` · ${l.brevoEvent}` : ''}
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
      </section>
    </div>
  );
}

export function AdminGovernancePage() {
  const [messages, setMessages] = useState<Array<{ _id: string; name: string; email: string; subject: string; message: string; status: string }>>([]);
  const [auditLogs, setAuditLogs] = useState<Array<{ _id: string; actorEmail: string; action: string; details: string; createdAt: string }>>([]);
  const [settings, setSettings] = useState<{
    requireRecruiterApproval: boolean;
    autoExpireJobs: boolean;
    promotionalDigestEnabled: boolean;
    supportEmail: string;
    maxPdfSizeBytes: number;
    brevoSenderEmail: string;
    brevoSenderName: string;
    clientUrl: string;
    serverUrl: string;
    socialLinks: {
      linkedin: string;
      twitter: string;
      instagram: string;
      facebook: string;
      youtube: string;
      github: string;
    };
  } | null>(null);
  const [diag, setDiag] = useState<EmailDiagnostics | null>(null);
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get('/admin/contact-messages'),
      api.get('/admin/audit-logs'),
      api.get('/admin/settings'),
    ])
      .then(([mRes, aRes, sRes]) => {
        setMessages(mRes.data.data || []);
        setAuditLogs(aRes.data.data || []);
        const raw = sRes.data.data.settings;
        setSettings({
          requireRecruiterApproval: Boolean(raw.requireRecruiterApproval),
          autoExpireJobs: Boolean(raw.autoExpireJobs),
          promotionalDigestEnabled: Boolean(raw.promotionalDigestEnabled),
          supportEmail: raw.supportEmail || 'support@jobkarenge.com',
          maxPdfSizeBytes: Number(raw.maxPdfSizeBytes || 1048576),
          brevoSenderEmail: raw.brevoSenderEmail || '',
          brevoSenderName: raw.brevoSenderName || '',
          clientUrl: raw.clientUrl || '',
          serverUrl: raw.serverUrl || '',
          socialLinks: {
            linkedin: raw.socialLinks?.linkedin || '',
            twitter: raw.socialLinks?.twitter || '',
            instagram: raw.socialLinks?.instagram || '',
            facebook: raw.socialLinks?.facebook || '',
            youtube: raw.socialLinks?.youtube || '',
            github: raw.socialLinks?.github || '',
          },
        });
        setDiag(sRes.data.data.emailDiagnostics || null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;
    setSaving(true);
    try {
      const res = await api.put('/admin/settings', settings);
      if (res.data?.data?.emailDiagnostics) {
        setDiag(res.data.data.emailDiagnostics);
      }
      window.dispatchEvent(new Event('jk:settings-updated'));
      toast.success('Platform & environment settings updated.');
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResetEnvOverrides = async () => {
    if (!settings) return;
    const cleared = {
      ...settings,
      brevoSenderEmail: '',
      brevoSenderName: '',
      clientUrl: '',
      serverUrl: '',
    };
    setSettings(cleared);
    setSaving(true);
    try {
      const res = await api.put('/admin/settings', cleared);
      if (res.data?.data?.emailDiagnostics) {
        setDiag(res.data.data.emailDiagnostics);
      }
      toast.success('Reverted email & URL overrides to server environment defaults.');
      load();
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setTestResult(null);
    try {
      const res = await api.post('/admin/test-email', testTo.trim() ? { to: testTo.trim() } : {});
      const failed = res.data?.data?.status === 'failed';
      const text = failed ? res.data?.data?.error || res.data.message : res.data.message;
      setTestResult({ ok: !failed, text });
      if (failed) toast.error(res.data.message);
      else toast.success(res.data.message);
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setTestResult({ ok: false, text: msg });
      toast.error(msg);
    } finally {
      setTestingEmail(false);
    }
  };

  if (loading || !settings) return <SkeletonList rows={4} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Governance, Environment &amp; Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage platform rules, Brevo runtime sender &amp; URL configuration, social footer links, contact inquiries, and audit trails.
        </p>
      </div>

      <form onSubmit={handleSaveSettings} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-6">
        <div className="space-y-4">
          <h2 className="text-base font-semibold">Platform Governance Rules</h2>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.requireRecruiterApproval}
              onChange={(e) => setSettings({ ...settings, requireRecruiterApproval: e.target.checked })}
            />
            <span>Require Admin verification before new recruiters can publish live jobs</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.autoExpireJobs}
              onChange={(e) => setSettings({ ...settings, autoExpireJobs: e.target.checked })}
            />
            <span>Automatically expire jobs when application deadline passes</span>
          </label>
          <label className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={settings.promotionalDigestEnabled}
              onChange={(e) => setSettings({ ...settings, promotionalDigestEnabled: e.target.checked })}
            />
            <span>Enable automated promotional job digests &amp; instant matching alerts</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
            <div>
              <label className="block text-xs font-medium mb-1">Public Support Email</label>
              <input
                type="email"
                value={settings.supportEmail}
                onChange={(e) => setSettings({ ...settings, supportEmail: e.target.value })}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Max Resume PDF Size (KB)</label>
              <input
                type="number"
                min={100}
                max={5120}
                value={Math.round(settings.maxPdfSizeBytes / 1024)}
                onChange={(e) => {
                  const kb = Math.max(100, Math.min(5120, Number(e.target.value || 1024)));
                  setSettings({ ...settings, maxPdfSizeBytes: kb * 1024 });
                }}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Brevo Sender &amp; Environment Overrides</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Leave any field blank to automatically use the server environment variable value. Changes apply immediately without restarting.
              </p>
            </div>
            <button
              type="button"
              onClick={handleResetEnvOverrides}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 self-start"
            >
              Reset to Server Env Defaults
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">
                Brevo Sender Email <span className="font-mono text-[11px] text-slate-400">(BREVO_SENDER_EMAIL)</span>
              </label>
              <input
                type="email"
                value={settings.brevoSenderEmail}
                onChange={(e) => setSettings({ ...settings, brevoSenderEmail: e.target.value })}
                placeholder={diag?.envDefaults?.fromEmail ? `Env default: ${diag.envDefaults.fromEmail}` : 'verified-sender@yourdomain.com'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Brevo Sender Name <span className="font-mono text-[11px] text-slate-400">(BREVO_SENDER_NAME)</span>
              </label>
              <input
                type="text"
                value={settings.brevoSenderName}
                onChange={(e) => setSettings({ ...settings, brevoSenderName: e.target.value })}
                placeholder={diag?.envDefaults?.fromName ? `Env default: ${diag.envDefaults.fromName}` : 'Job Karenge'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Public App URL <span className="font-mono text-[11px] text-slate-400">(CLIENT_URL)</span>
              </label>
              <input
                type="url"
                value={settings.clientUrl}
                onChange={(e) => setSettings({ ...settings, clientUrl: e.target.value })}
                placeholder={diag?.envDefaults?.clientUrl ? `Env default: ${diag.envDefaults.clientUrl}` : 'https://your-app.run.app'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                Public Server URL <span className="font-mono text-[11px] text-slate-400">(SERVER_URL)</span>
              </label>
              <input
                type="url"
                value={settings.serverUrl}
                onChange={(e) => setSettings({ ...settings, serverUrl: e.target.value })}
                placeholder={diag?.envDefaults?.serverUrl ? `Env default: ${diag.envDefaults.serverUrl}` : 'https://your-app.run.app'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
        </div>

        <div className="pt-5 border-t border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h2 className="text-base font-semibold">Footer Social Media Links</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Configured URLs automatically appear as social icons in the public website footer. Leave any field blank to hide that platform.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">LinkedIn URL</label>
              <input
                type="url"
                value={settings.socialLinks.linkedin}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, linkedin: e.target.value } })
                }
                placeholder="https://linkedin.com/company/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">X / Twitter URL</label>
              <input
                type="url"
                value={settings.socialLinks.twitter}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, twitter: e.target.value } })
                }
                placeholder="https://x.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Instagram URL</label>
              <input
                type="url"
                value={settings.socialLinks.instagram}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, instagram: e.target.value } })
                }
                placeholder="https://instagram.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Facebook URL</label>
              <input
                type="url"
                value={settings.socialLinks.facebook}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, facebook: e.target.value } })
                }
                placeholder="https://facebook.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">YouTube URL</label>
              <input
                type="url"
                value={settings.socialLinks.youtube}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, youtube: e.target.value } })
                }
                placeholder="https://youtube.com/@..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">GitHub URL</label>
              <input
                type="url"
                value={settings.socialLinks.github}
                onChange={(e) =>
                  setSettings({ ...settings, socialLinks: { ...settings.socialLinks, github: e.target.value } })
                }
                placeholder="https://github.com/..."
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-sm font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>

      {diag && (
        <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">Server Environment &amp; Integration Status</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                API keys and webhook secrets are managed exclusively through server Environment Secrets for security.
              </p>
            </div>
            <Link to="/admin/campaigns" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
              View Brevo Campaigns &amp; Logs
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">BREVO_API_KEY</span>
                <StatusIndicator status={diag.brevoConfigured ? 'Active' : 'Pending'} />
              </div>
              <p className="font-mono text-slate-600 dark:text-slate-300">
                {diag.apiKeyHint}
              </p>
              <p className="text-slate-500">
                Active Sender: <span className="font-mono">{diag.fromName} &lt;{diag.fromEmail}&gt;</span>
              </p>
              {diag.brevoConfigured && diag.apiKeyFormatValid === false && (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  Format notice: Brevo v3 keys typically start with <span className="font-mono">xkeysib-</span>.
                </p>
              )}
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">MONGODB_URI</span>
                <StatusIndicator status={diag.integrationStatus?.mongodbConfigured ? 'Active' : 'Pending'} />
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                {diag.integrationStatus?.mongodbConfigured ? 'Connected to MongoDB Atlas' : 'Using local JSON store'}
              </p>
              <p className="text-slate-500 font-mono">
                NODE_ENV={diag.serverRuntime?.nodeEnv || 'development'} · PORT={diag.serverRuntime?.port || 3000}
              </p>
            </div>
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">CLOUDINARY_*</span>
                <StatusIndicator status={diag.integrationStatus?.cloudinaryConfigured ? 'Active' : 'Pending'} />
              </div>
              <p className="text-slate-600 dark:text-slate-300">
                {diag.integrationStatus?.cloudinaryConfigured ? 'Configured via server secrets' : 'Using local file uploads'}
              </p>
              <p className="text-slate-500 truncate">
                Webhook: <span className="font-mono">{diag.webhookEndpointUrl}</span>
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Test live Brevo dispatch with the currently saved sender (<span className="font-mono">{diag.fromEmail}</span>):
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Recipient email (blank = your email)"
                className="px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent w-60"
              />
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={testingEmail}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-[#102A43] dark:bg-blue-600 text-white disabled:opacity-60"
              >
                {testingEmail ? 'Sending...' : 'Send Test Email'}
              </button>
            </div>
          </div>
          {testResult && (
            <div
              className={`rounded-lg border px-3.5 py-2.5 text-xs ${
                testResult.ok
                  ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 dark:text-emerald-300'
                  : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300'
              }`}
            >
              {testResult.text}
            </div>
          )}
        </section>
      )}

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 space-y-3">
        <h2 className="text-base font-semibold">Contact Messages ({messages.length})</h2>
        {messages.length === 0 ? (
          <p className="text-sm text-slate-500">No contact inquiries yet.</p>
        ) : (
          messages.map((m) => (
            <div key={m._id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">{m.subject}</p>
                <p className="text-xs text-slate-500">{m.name} ({m.email})</p>
                <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{m.message}</p>
              </div>
              {m.status === 'new' ? (
                <button
                  type="button"
                  onClick={async () => {
                    await api.patch(`/admin/contact-messages/${m._id}/resolve`);
                    load();
                  }}
                  className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-600 text-white shrink-0"
                >
                  Mark Resolved
                </button>
              ) : (
                <StatusIndicator status="Resolved" />
              )}
            </div>
          ))
        )}
      </section>

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-x-auto">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-base font-semibold">Administrative Audit Logs</h2>
        </div>
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
            <tr>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Details</th>
              <th className="py-3 px-4">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {auditLogs.map((a) => (
              <tr key={a._id}>
                <td className="py-3 px-4 font-medium">{a.actorEmail}</td>
                <td className="py-3 px-4 font-mono">{a.action}</td>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{a.details}</td>
                <td className="py-3 px-4 tabular-nums text-slate-500">{formatShortDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
