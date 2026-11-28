export function stripNoSqlOperators<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => stripNoSqlOperators(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k.startsWith('$') || k.includes('.')) continue;
      out[k] = stripNoSqlOperators(v);
    }
    return out as T;
  }
  return value;
}

export function sanitizeUser<
  T extends {
    passwordHash?: string;
    verificationToken?: string;
    passwordResetTokenHash?: string;
    passwordResetExpires?: string | null;
  },
>(
  user: T
): Omit<T, 'passwordHash' | 'verificationToken' | 'passwordResetTokenHash' | 'passwordResetExpires'> {
  const {
    passwordHash: _p,
    verificationToken: _v,
    passwordResetTokenHash: _prh,
    passwordResetExpires: _pre,
    ...safe
  } = user;
  return safe;
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

export function isSafeHttpUrl(url: string): boolean {
  if (!url) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
