export function formatSalaryRange(
  min: number,
  max: number,
  currency = 'INR',
  period: 'Annual' | 'Monthly' = 'Annual'
): string {
  if (!min && !max) return 'Competitive compensation';
  const suffix = period === 'Monthly' ? '/ mo' : '/ yr';
  if (currency === 'INR') {
    const fmt = (val: number) =>
      val >= 100000 ? `₹${(val / 100000).toFixed(val % 100000 === 0 ? 0 : 1)}L` : `₹${val.toLocaleString('en-IN')}`;
    if (min && max) return `${fmt(min)} – ${fmt(max)} ${suffix}`;
    return `${fmt(min || max)} ${suffix}`;
  }
  const fmtUsd = (val: number) =>
    val >= 1000 ? `$${(val / 1000).toFixed(val % 1000 === 0 ? 0 : 1)}k` : `$${val.toLocaleString('en-US')}`;
  if (min && max) return `${fmtUsd(min)} – ${fmtUsd(max)} ${suffix}`;
  return `${fmtUsd(min || max)} ${suffix}`;
}

export function formatShortDate(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatRelativeDate(iso?: string): string {
  if (!iso) return 'Recently';
  const diffMs = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diffMs / 86400_000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatShortDate(iso);
}

export function isDeadlineExpired(iso?: string | null): boolean {
  if (!iso) return false;
  const ms = new Date(iso).getTime();
  if (Number.isNaN(ms)) return false;
  return ms < Date.now();
}

export function formatDeadline(iso?: string | null): string {
  if (!iso) return 'No deadline (Ongoing)';
  return formatShortDate(iso);
}
