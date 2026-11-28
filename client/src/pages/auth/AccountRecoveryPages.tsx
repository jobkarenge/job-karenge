import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BrandLogo, PasswordInput } from '../../components/common/UIPrimitives';
import { useAuth } from '../../context/AuthContext';
import { api, getApiErrorMessage } from '../../services/api';

export function VerifyEmailPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<'verifying' | 'ok' | 'err'>('verifying');
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('err');
      setMsg('Missing verification token.');
      return;
    }
    api
      .post('/auth/verify-email', { token })
      .then((res) => {
        setStatus('ok');
        setMsg(res.data.message);
      })
      .catch((err) => {
        setStatus('err');
        setMsg(getApiErrorMessage(err));
      });
  }, [token]);

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 text-center">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-xl font-bold">Email Verification</h1>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
          {status === 'verifying' ? 'Verifying your token...' : msg}
        </p>
        <Link to="/login" className="mt-6 inline-block px-5 py-2 rounded-lg bg-[#102A43] text-white text-sm font-semibold">
          Continue to Sign In
        </Link>
      </div>
    </div>
  );
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [previewToken, setPreviewToken] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ email: string; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage(null);
    setSentInfo(null);
    setPreviewToken(null);
    try {
      const res = await api.post('/auth/forgot-password', { email });
      toast.success(res.data.message);
      setSentInfo({
        email: email.trim(),
        message: res.data.message,
      });
      if (res.data.resetTokenPreview) {
        setPreviewToken(res.data.resetTokenPreview);
      }
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Enter your email address to receive a password reset link.
        </p>
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">Email Address</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        {errorMessage && (
          <div className="mt-4 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {sentInfo && (
          <div className="mt-4 p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs space-y-1.5">
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">{sentInfo.message}</p>
            <p className="text-emerald-800 dark:text-emerald-300">
              Please check the inbox and Spam/Promotions folder for <span className="font-medium">{sentInfo.email}</span> and click the Reset Password link to set a new password.
            </p>
            <Link to="/login" className="inline-block font-medium text-emerald-700 dark:text-emerald-300 underline">
              Back to Sign In
            </Link>
          </div>
        )}

        {previewToken && (
          <div className="mt-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-xs">
            <p className="font-medium text-blue-900 dark:text-blue-200">Preview Mode Reset Link</p>
            <Link to={`/reset-password?token=${encodeURIComponent(previewToken)}`} className="mt-1 inline-block text-blue-600 underline">
              Proceed to Reset Password
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error('Passwords do not match.');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', { token, password });
      toast.success(res.data.message);
      navigate('/login');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold">Set New Password</h1>
        {!token ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              This password reset link is missing or invalid. Please request a new password reset link.
            </p>
            <Link
              to="/forgot-password"
              className="inline-block w-full text-center py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold"
            >
              Request New Reset Link
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label className="block text-xs font-medium mb-1">New Password</label>
              <PasswordInput
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Confirm New Password</label>
              <PasswordInput
                required
                minLength={8}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
            >
              {loading ? 'Updating...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export function AdminSetupPage() {
  const { claimAdmin } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<{ adminClaimed: boolean; passcodeRequired: boolean } | null>(null);
  const [form, setForm] = useState({ name: '', email: '', password: '', passcode: '' });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/auth/admin-status').then((res) => setStatus(res.data.data));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await claimAdmin(form);
      toast.success('Super Admin account initialized.');
      navigate('/admin');
    } catch (err) {
      toast.error(getApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold">Super Admin Portal</h1>

        {status === null ? (
          <p className="mt-4 text-sm text-slate-500">Checking administrator status...</p>
        ) : status.adminClaimed ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-slate-600 dark:text-slate-400">
              A Super Admin account has already been configured for this platform. Please sign in with your administrator credentials.
            </p>
            <Link
              to="/login"
              className="inline-block w-full text-center py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold"
            >
              Go to Sign In
            </Link>
          </div>
        ) : (
          <>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              First-run setup: claim the initial Super Admin account to manage recruiter verifications, companies, email campaigns, and platform settings.
            </p>
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div>
                <label className="block text-xs font-medium mb-1">Administrator Name</label>
                <input
                  type="text"
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Admin Email</label>
                <input
                  type="email"
                  required
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Password (min 8 chars)</label>
                <PasswordInput
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                />
              </div>
              {status.passcodeRequired && (
                <div>
                  <label className="block text-xs font-medium mb-1">Setup Passcode</label>
                  <PasswordInput
                    required
                    value={form.passcode}
                    onChange={(e) => setForm({ ...form, passcode: e.target.value })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent"
                  />
                </div>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold disabled:opacity-60"
              >
                {submitting ? 'Claiming Admin...' : 'Claim Super Admin Account'}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
