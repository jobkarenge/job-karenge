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
  const [devInspectLoading, setDevInspectLoading] = useState(false);
  const [devInspectError, setDevInspectError] = useState<string | null>(null);
  const [sentInfo, setSentInfo] = useState<{ email: string; message: string } | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailPattern.test(trimmedEmail)) {
      const msg = 'Please enter a valid email address.';
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    setErrorMessage(null);
    setSentInfo(null);
    setPreviewToken(null);
    setDevInspectError(null);
    try {
      const res = await api.post('/auth/forgot-password', { email: trimmedEmail });
      toast.success(res.data.message);
      setSentInfo({
        email: trimmedEmail,
        message: res.data.message,
      });
    } catch (err) {
      const msg = getApiErrorMessage(err);
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleDevInspect = async () => {
    if (!import.meta.env.DEV || !sentInfo?.email) return;
    setDevInspectLoading(true);
    setDevInspectError(null);
    try {
      const res = await api.get('/auth/dev/reset-token-preview', {
        params: { email: sentInfo.email },
      });
      if (res.data?.data?.token) {
        setPreviewToken(res.data.data.token);
      }
    } catch (err) {
      setDevInspectError(getApiErrorMessage(err, 'No reset token available for this email in development mode.'));
    } finally {
      setDevInspectLoading(false);
    }
  };

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Forgot Password</h1>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Enter your registered email address and we will prepare password reset instructions if your account is verified.
        </p>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
          <div>
            <label htmlFor="forgot-email" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              autoComplete="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors disabled:opacity-60"
          >
            {loading ? 'Submitting Request...' : 'Send Reset Instructions'}
          </button>
        </form>

        {errorMessage && (
          <div role="alert" className="mt-4 p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300">
            {errorMessage}
          </div>
        )}

        {sentInfo && (
          <div className="mt-4 p-3.5 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-xs space-y-2">
            <p className="font-semibold text-emerald-900 dark:text-emerald-200">{sentInfo.message}</p>
            <p className="text-emerald-800 dark:text-emerald-300">
              Reset links expire after 15 minutes and can only be used once. If you do not see an email shortly, check your Spam or Promotions folder.
            </p>
            {import.meta.env.DEV && !previewToken && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleDevInspect}
                  disabled={devInspectLoading}
                  className="text-xs font-medium text-blue-700 dark:text-blue-300 underline disabled:opacity-60"
                >
                  {devInspectLoading ? 'Checking dev preview...' : 'Development Only: Inspect Reset Link'}
                </button>
                {devInspectError && (
                  <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-300">{devInspectError}</p>
                )}
              </div>
            )}
          </div>
        )}

        {import.meta.env.DEV && previewToken && (
          <div className="mt-4 p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 text-xs">
            <p className="font-medium text-blue-900 dark:text-blue-200">Development-Only Reset Link</p>
            <Link
              to={`/reset-password?token=${encodeURIComponent(previewToken)}`}
              className="mt-1 inline-block text-blue-600 dark:text-blue-300 font-medium underline"
            >
              Proceed to Reset Password
            </Link>
          </div>
        )}

        <div className="mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
          <span>Remembered your password?</span>
          <Link to="/login" className="font-semibold text-blue-600 dark:text-blue-400 hover:underline">
            Return to Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = (searchParams.get('token') || '').trim();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [resetCompleted, setResetCompleted] = useState(false);

  const meetsMinLength = password.length >= 8;
  const meetsMaxLength = password.length <= 100;
  const passwordsMatch = Boolean(password && confirm && password === confirm);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!meetsMinLength || !meetsMaxLength) {
      const msg = 'Password must be between 8 and 100 characters.';
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }
    if (password !== confirm) {
      const msg = 'Passwords do not match.';
      setErrorMessage(msg);
      toast.error(msg);
      return;
    }

    setLoading(true);
    try {
      const res = await api.post('/auth/reset-password', {
        token,
        password,
        confirmPassword: confirm,
      });
      toast.success(res.data.message);
      setResetCompleted(true);
    } catch (err) {
      const msg = getApiErrorMessage(err, 'This password reset link is invalid or has expired.');
      setErrorMessage(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[65vh] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8">
        <BrandLogo to="/" />
        <h1 className="mt-6 text-2xl font-bold text-slate-900 dark:text-white">Set New Password</h1>

        {!token ? (
          <div className="mt-4 space-y-4">
            <div className="p-3.5 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-300">
              This password reset link is missing or invalid. Please request a new password reset link.
            </div>
            <Link
              to="/forgot-password"
              className="inline-block w-full text-center py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors"
            >
              Request New Reset Link
            </Link>
          </div>
        ) : resetCompleted ? (
          <div className="mt-5 space-y-4">
            <div className="p-4 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50 dark:bg-emerald-950/30 text-sm text-emerald-900 dark:text-emerald-200 space-y-1">
              <p className="font-semibold">Your password has been reset</p>
              <p className="text-xs text-emerald-800 dark:text-emerald-300">
                Your previous sessions have been signed out. You can now sign in using your new password.
              </p>
            </div>
            <Link
              to="/login"
              className="inline-block w-full text-center py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors"
            >
              Return to Sign In
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label htmlFor="reset-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                New Password
              </label>
              <PasswordInput
                id="reset-password"
                required
                minLength={8}
                maxLength={100}
                autoComplete="new-password"
                placeholder="Minimum 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div>
              <label htmlFor="reset-confirm-password" className="block text-xs font-medium text-slate-700 dark:text-slate-300 mb-1.5">
                Confirm New Password
              </label>
              <PasswordInput
                id="reset-confirm-password"
                required
                minLength={8}
                maxLength={100}
                autoComplete="new-password"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full px-3.5 py-2.5 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
              />
            </div>

            <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/70 text-xs space-y-1">
              <p className="font-medium text-slate-700 dark:text-slate-200">Password requirements</p>
              <p className={meetsMinLength && meetsMaxLength ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                {meetsMinLength && meetsMaxLength ? '✓' : '•'} 8 to 100 characters
              </p>
              <p className={passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'}>
                {passwordsMatch ? '✓' : '•'} New password and confirmation match
              </p>
            </div>

            {errorMessage && (
              <div role="alert" className="p-3 rounded-lg border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 text-xs text-red-700 dark:text-red-300 space-y-1.5">
                <p>{errorMessage}</p>
                <Link to="/forgot-password" className="inline-block font-semibold underline">
                  Request a new reset link
                </Link>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 rounded-lg bg-[#102A43] dark:bg-blue-600 text-white text-sm font-semibold hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors disabled:opacity-60"
            >
              {loading ? 'Updating Password...' : 'Update Password'}
            </button>

            <div className="pt-2 text-center">
              <Link to="/login" className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline">
                Return to Sign In
              </Link>
            </div>
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
