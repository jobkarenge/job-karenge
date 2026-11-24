import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Moon,
  Sun,
  X,
  XCircle,
} from 'lucide-react';
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTheme } from '../../context/ThemeContext';

export const COMPANY_LOGO_URL = '/assets/aistudio/Job_karenge_logo_2e56f5f0.jpeg';

export function BrandLogo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-2.5 whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded-md"
    >
      <img
        src={COMPANY_LOGO_URL}
        alt="Job Karenge logo"
        referrerPolicy="no-referrer"
        className="h-9 w-9 rounded-lg object-cover border border-slate-200 dark:border-slate-700 bg-white shrink-0"
      />
      {!compact && (
        <span className="text-lg font-bold tracking-tight text-[#102A43] dark:text-white whitespace-nowrap shrink-0">
          Job Karenge
        </span>
      )}
    </Link>
  );
}

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
      className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
    >
      {theme === 'light' ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
      <span>{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </button>
  );
}

export function StatusIndicator({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  let tone = 'text-slate-700 dark:text-slate-300';
  let Icon = Clock;

  if (['selected', 'approved', 'published', 'active', 'completed', 'verified', 'sent', 'delivered', 'resolved'].includes(normalized)) {
    tone = 'text-emerald-700 dark:text-emerald-400';
    Icon = CheckCircle2;
  } else if (['shortlisted', 'interview scheduled', 'scheduled', 'rescheduled', 'queued'].includes(normalized)) {
    tone = 'text-blue-700 dark:text-blue-400';
    Icon = Clock;
  } else if (['rejected', 'cancelled', 'suspended', 'expired', 'failed', 'bounced', 'withdrawn', 'closed'].includes(normalized)) {
    tone = 'text-rose-700 dark:text-rose-400';
    Icon = XCircle;
  } else if (['pending', 'draft', 'simulated'].includes(normalized)) {
    tone = 'text-amber-700 dark:text-amber-400';
    Icon = AlertCircle;
  }

  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${tone}`}>
      <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>{status}</span>
    </span>
  );
}

export function EmptyState({
  title,
  description,
  actionLabel,
  onAction,
}: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-6 py-12 text-center">
      <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
      <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 max-w-md mx-auto">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex items-center justify-center px-4 py-2 text-sm font-medium rounded-lg bg-[#102A43] dark:bg-blue-600 text-white hover:bg-[#1a3c5e] dark:hover:bg-blue-700 transition-colors"
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

export function SkeletonList({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-busy="true" aria-label="Loading content">
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="h-24 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 animate-pulse"
        >
          <div className="h-4 w-1/3 bg-slate-200 dark:bg-slate-800 rounded" />
          <div className="mt-3 h-3 w-2/3 bg-slate-100 dark:bg-slate-800/70 rounded" />
        </div>
      ))}
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  danger = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close dialog"
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="mt-2 text-sm text-slate-600 dark:text-slate-400 leading-relaxed">{message}</p>
        <div className="mt-6 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
              danger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#102A43] dark:bg-blue-600 hover:bg-[#1a3c5e]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className = '', ...props }, ref) => {
    const [visible, setVisible] = useState(false);

    return (
      <div className="relative">
        <input
          {...props}
          ref={ref}
          type={visible ? 'text' : 'password'}
          className={`${className} pr-10`}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 focus-visible:outline-none focus-visible:text-blue-600"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    );
  }
);
PasswordInput.displayName = 'PasswordInput';

