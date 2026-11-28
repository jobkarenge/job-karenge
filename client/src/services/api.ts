import axios from 'axios';

function cleanOriginAndPath(rawUrl?: string): { origin: string; basePath: string } | null {
  const raw = rawUrl?.trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    const isLocalTarget =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocalTarget && typeof window !== 'undefined' && parsed.host !== window.location.host) {
      return null;
    }
    const cleanPath = parsed.pathname.replace(/\/+$/, '').replace(/\/api$/i, '');
    return {
      origin: parsed.origin,
      basePath: cleanPath,
    };
  } catch {
    return null;
  }
}

export function resolveApiBaseUrl(rawUrl = import.meta.env?.VITE_API_URL): string {
  const resolved = cleanOriginAndPath(rawUrl);
  if (!resolved) return '/api';
  return `${resolved.origin}${resolved.basePath}/api`;
}

export function getBackendOrigin(rawUrl = import.meta.env?.VITE_API_URL): string | undefined {
  const resolved = cleanOriginAndPath(rawUrl);
  if (!resolved) return undefined;
  return `${resolved.origin}${resolved.basePath}`;
}

export function resolveApiAssetUrl(url?: string | null): string {
  const trimmed = (url || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('/api/')) {
    const backendOrigin = getBackendOrigin();
    return backendOrigin ? `${backendOrigin}${trimmed}` : trimmed;
  }
  return trimmed;
}

export function optimizeCloudinaryImageUrl(
  url?: string | null,
  options?: { width?: number; height?: number; crop?: 'fill' | 'fit' | 'limit' | 'thumb' }
): string {
  const resolved = resolveApiAssetUrl(url);
  if (!resolved) return '';
  if (!/^https?:\/\/res\.cloudinary\.com\//i.test(resolved) || !resolved.includes('/image/upload/')) {
    return resolved;
  }
  // Skip if already transformed
  if (/\/image\/upload\/[^/]*(f_auto|q_auto)/i.test(resolved)) {
    return resolved;
  }
  const transforms: string[] = ['f_auto', 'q_auto', 'dpr_auto'];
  if (options?.width) transforms.push(`w_${Math.round(options.width)}`);
  if (options?.height) transforms.push(`h_${Math.round(options.height)}`);
  if (options?.width || options?.height) {
    transforms.push(`c_${options.crop || (options.width && options.height ? 'fill' : 'limit')}`);
  }
  return resolved.replace('/image/upload/', `/image/upload/${transforms.join(',')}/`);
}

const baseURL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL,
  timeout: 35000,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

export interface PublicSettingsPayload {
  supportEmail?: string;
  socialLinks?: Record<string, string>;
}

let cachedPublicSettings: { value: PublicSettingsPayload; expiresAt: number } | null = null;
let publicSettingsInflight: Promise<PublicSettingsPayload> | null = null;

export function invalidatePublicSettingsCache(): void {
  cachedPublicSettings = null;
}

export async function fetchPublicSettings(force = false): Promise<PublicSettingsPayload> {
  if (!force && cachedPublicSettings && cachedPublicSettings.expiresAt > Date.now()) {
    return cachedPublicSettings.value;
  }
  if (!force && publicSettingsInflight) {
    return publicSettingsInflight;
  }
  publicSettingsInflight = api
    .get('/public/settings')
    .then((res) => {
      const value: PublicSettingsPayload = res.data?.data || {};
      cachedPublicSettings = { value, expiresAt: Date.now() + 60_000 };
      return value;
    })
    .finally(() => {
      publicSettingsInflight = null;
    });
  return publicSettingsInflight;
}

export interface CachedCategoryItem {
  _id: string;
  name: string;
  slug: string;
  description: string;
  openCount?: number;
}

let cachedCategories: { value: CachedCategoryItem[]; expiresAt: number } | null = null;
let categoriesInflight: Promise<CachedCategoryItem[]> | null = null;

export function invalidateCategoriesCache(): void {
  cachedCategories = null;
}

export async function fetchCategories(force = false): Promise<CachedCategoryItem[]> {
  if (!force && cachedCategories && cachedCategories.expiresAt > Date.now()) {
    return cachedCategories.value;
  }
  if (!force && categoriesInflight) {
    return categoriesInflight;
  }
  categoriesInflight = api
    .get('/jobs/categories')
    .then((res) => {
      const value: CachedCategoryItem[] = res.data?.data || [];
      cachedCategories = { value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .finally(() => {
      categoriesInflight = null;
    });
  return categoriesInflight;
}

let cachedCompanies: { value: unknown[]; expiresAt: number } | null = null;
let companiesInflight: Promise<unknown[]> | null = null;

export function invalidateCompaniesCache(): void {
  cachedCompanies = null;
  companiesInflight = null;
}

export async function fetchCompanies<T = unknown>(force = false): Promise<T[]> {
  if (!force && cachedCompanies && cachedCompanies.expiresAt > Date.now()) {
    return cachedCompanies.value as T[];
  }
  if (!force && companiesInflight) {
    return companiesInflight as Promise<T[]>;
  }
  companiesInflight = api
    .get('/jobs/companies')
    .then((res) => {
      const value: unknown[] = res.data?.data || [];
      cachedCompanies = { value, expiresAt: Date.now() + 30_000 };
      return value;
    })
    .finally(() => {
      companiesInflight = null;
    });
  return companiesInflight as Promise<T[]>;
}

let cachedSavedJobIds: { userId: string; ids: string[]; expiresAt: number } | null = null;
let savedJobsInflight: { userId: string; promise: Promise<string[]> } | null = null;

export function invalidateSavedJobsCache(): void {
  cachedSavedJobIds = null;
  savedJobsInflight = null;
}

export async function fetchSavedJobIds(userId: string, force = false): Promise<Set<string>> {
  if (!userId) return new Set();
  if (!force && cachedSavedJobIds && cachedSavedJobIds.userId === userId && cachedSavedJobIds.expiresAt > Date.now()) {
    return new Set(cachedSavedJobIds.ids);
  }
  if (!force && savedJobsInflight && savedJobsInflight.userId === userId) {
    return new Set(await savedJobsInflight.promise);
  }
  const promise = api
    .get('/candidate/saved-jobs')
    .then((res) => {
      const ids = (res.data?.data || []).map((item: { jobId: string }) => item.jobId);
      cachedSavedJobIds = { userId, ids, expiresAt: Date.now() + 15_000 };
      return ids as string[];
    })
    .finally(() => {
      if (savedJobsInflight?.userId === userId) {
        savedJobsInflight = null;
      }
    });
  savedJobsInflight = { userId, promise };
  return new Set(await promise);
}

let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
  if (!token) {
    invalidateSavedJobsCache();
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('jk:auth-token-changed', { detail: { token } }));
  }
}

export function getAccessToken(): string | null {
  return inMemoryAccessToken;
}

api.interceptors.request.use((config) => {
  if (inMemoryAccessToken) {
    config.headers.Authorization = `Bearer ${inMemoryAccessToken}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (
      error.response?.status === 401 &&
      original &&
      !original._retry &&
      !original.url?.includes('/auth/login') &&
      !original.url?.includes('/auth/refresh') &&
      !original.url?.includes('/auth/register')
    ) {
      original._retry = true;
      try {
        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${baseURL}/auth/refresh`, {}, { withCredentials: true, headers: { 'X-Requested-With': 'XMLHttpRequest' } })
            .then((res) => {
              const token = res.data?.data?.accessToken || null;
              setAccessToken(token);
              return token;
            })
            .catch(() => {
              setAccessToken(null);
              return null;
            })
            .finally(() => {
              refreshPromise = null;
            });
        }
        const newToken = await refreshPromise;
        if (newToken) {
          original.headers.Authorization = `Bearer ${newToken}`;
          return api(original);
        }
      } catch {
        // fall through
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(err: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(err)) {
    if (err.response?.data?.message) {
      return err.response.data.message;
    }
    if (err.response?.status === 404) {
      return 'API endpoint not found (404). Make sure the Node/Express backend server is running and VITE_API_URL or reverse-proxy rewrites are configured.';
    }
    if (err.code === 'ECONNABORTED') {
      return 'Request timed out. Please check your connection or try again in a moment.';
    }
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
