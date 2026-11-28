import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import { PaginationControls, SkeletonList, StatusIndicator } from '../../components/common/UIPrimitives';
import { api, getApiErrorMessage } from '../../services/api';
import { formatShortDate } from '../../utils/formatters';
import type { EmailDiagnostics } from './AdminCampaignsPage';

interface ContactMessageRow {
  _id: string;
  name: string;
  email: string;
  subject: string;
  message: string;
  status: string;
}

interface AuditLogRow {
  _id: string;
  actorEmail: string;
  action: string;
  details: string;
  createdAt: string;
}

const MESSAGES_PAGE_SIZE = 10;
const AUDIT_PAGE_SIZE = 20;

export function AdminGovernancePage() {
  const [messages, setMessages] = useState<ContactMessageRow[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogRow[]>([]);
  const [settings, setSettings] = useState<{
    requireRecruiterApproval: boolean;
    autoExpireJobs: boolean;
    promotionalDigestEnabled: boolean;
    supportEmail: string;
    maxPdfSizeBytes: number;
    emailFromEmail: string;
    emailFromName: string;
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
  const [messagePage, setMessagePage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

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
          emailFromEmail: raw.emailFromEmail || raw.brevoSenderEmail || '',
          emailFromName: raw.emailFromName || raw.brevoSenderName || '',
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
      const aRes = await api.get('/admin/audit-logs');
      setAuditLogs(aRes.data.data || []);
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
      emailFromEmail: '',
      emailFromName: '',
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
      const aRes = await api.get('/admin/audit-logs');
      setAuditLogs(aRes.data.data || []);
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleResolveMessage = async (id: string) => {
    await api.patch(`/admin/contact-messages/${id}/resolve`);
    setMessages((prev) => prev.map((m) => (m._id === id ? { ...m, status: 'resolved' } : m)));
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

  const messageTotalPages = Math.max(1, Math.ceil(messages.length / MESSAGES_PAGE_SIZE));
  const safeMessagePage = Math.min(messagePage, messageTotalPages);
  const pagedMessages = messages.slice(
    (safeMessagePage - 1) * MESSAGES_PAGE_SIZE,
    safeMessagePage * MESSAGES_PAGE_SIZE
  );

  const auditTotalPages = Math.max(1, Math.ceil(auditLogs.length / AUDIT_PAGE_SIZE));
  const safeAuditPage = Math.min(auditPage, auditTotalPages);
  const pagedAuditLogs = auditLogs.slice(
    (safeAuditPage - 1) * AUDIT_PAGE_SIZE,
    safeAuditPage * AUDIT_PAGE_SIZE
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Governance, Environment &amp; Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Manage platform rules, Gmail SMTP sender &amp; URL configuration, social footer links, contact inquiries, and audit trails.
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
              <h2 className="text-base font-semibold">Email Sender &amp; Environment Overrides</h2>
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
                From Email Address <span className="font-mono text-[11px] text-slate-400">(EMAIL_FROM_EMAIL)</span>
              </label>
              <input
                type="email"
                value={settings.emailFromEmail}
                onChange={(e) => setSettings({ ...settings, emailFromEmail: e.target.value })}
                placeholder={diag?.envDefaults?.fromEmail ? `Env default: ${diag.envDefaults.fromEmail}` : 'your-gmail@gmail.com'}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">
                From Display Name <span className="font-mono text-[11px] text-slate-400">(EMAIL_FROM_NAME)</span>
              </label>
              <input
                type="text"
                value={settings.emailFromName}
                onChange={(e) => setSettings({ ...settings, emailFromName: e.target.value })}
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
                Gmail SMTP app passwords and service credentials are managed exclusively through server Environment Secrets for security.
              </p>
            </div>
            <Link to="/admin/campaigns" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
              View Email Campaigns &amp; Logs
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 dark:text-white">GMAIL_SMTP</span>
                <StatusIndicator status={diag.emailConfigured ? 'Active' : 'Pending'} />
              </div>
              <p className="font-mono text-slate-600 dark:text-slate-300">
                {diag.smtpHost}:{diag.smtpPort} · {diag.gmailUserHint}
              </p>
              <p className="text-slate-500">
                App Password: <span className="font-mono">{diag.appPasswordHint}</span>
              </p>
              <p className="text-slate-500">
                Active Sender: <span className="font-mono">{diag.fromName} &lt;{diag.fromEmail}&gt;</span>
              </p>
              {diag.emailConfigured && diag.appPasswordValidLength === false && (
                <p className="text-amber-700 dark:text-amber-400 font-medium">
                  Notice: Google App Passwords should be 16 characters.
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
                {diag.integrationStatus?.cloudinaryConfigured
                  ? `Configured via server ${diag.cloudinaryDetails?.source === 'cloudinary_url' ? 'CLOUDINARY_URL' : 'secrets'}`
                  : 'Using local file uploads'}
              </p>
              {diag.integrationStatus?.cloudinaryConfigured ? (
                diag.cloudinaryDetails?.cloudName && (
                  <p className="text-slate-500">
                    Cloud: <span className="font-mono">{diag.cloudinaryDetails.cloudName}</span>
                  </p>
                )
              ) : (
                <p className="text-slate-500">
                  Set{' '}
                  <span className="font-mono">
                    {diag.cloudinaryDetails?.missingVars?.length
                      ? diag.cloudinaryDetails.missingVars.join(', ')
                      : 'CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET'}
                  </span>{' '}
                  or <span className="font-mono">CLOUDINARY_URL</span> in server env.
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="text-xs text-slate-600 dark:text-slate-400">
              Test live Gmail SMTP dispatch with the currently saved sender (<span className="font-mono">{diag.fromEmail}</span>):
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

      <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
        <div className="p-6 space-y-3">
          <h2 className="text-base font-semibold">Contact Messages ({messages.length})</h2>
          {messages.length === 0 ? (
            <p className="text-sm text-slate-500">No contact inquiries yet.</p>
          ) : (
            pagedMessages.map((m) => (
              <div key={m._id} className="p-4 rounded-lg border border-slate-200 dark:border-slate-800 flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold">{m.subject}</p>
                  <p className="text-xs text-slate-500">{m.name} ({m.email})</p>
                  <p className="mt-2 text-xs text-slate-700 dark:text-slate-300">{m.message}</p>
                </div>
                {m.status === 'new' ? (
                  <button
                    type="button"
                    onClick={() => handleResolveMessage(m._id)}
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
        </div>
        <PaginationControls
          page={safeMessagePage}
          totalPages={messageTotalPages}
          totalItems={messages.length}
          pageSize={MESSAGES_PAGE_SIZE}
          onPageChange={setMessagePage}
        />
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
            {pagedAuditLogs.map((a) => (
              <tr key={a._id}>
                <td className="py-3 px-4 font-medium">{a.actorEmail}</td>
                <td className="py-3 px-4 font-mono">{a.action}</td>
                <td className="py-3 px-4 text-slate-600 dark:text-slate-400">{a.details}</td>
                <td className="py-3 px-4 tabular-nums text-slate-500">{formatShortDate(a.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <PaginationControls
          page={safeAuditPage}
          totalPages={auditTotalPages}
          totalItems={auditLogs.length}
          pageSize={AUDIT_PAGE_SIZE}
          onPageChange={setAuditPage}
        />
      </section>
    </div>
  );
}
