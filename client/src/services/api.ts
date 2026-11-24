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

const baseURL = resolveApiBaseUrl();

export const api = axios.create({
  baseURL,
  withCredentials: true,
  headers: {
    'X-Requested-With': 'XMLHttpRequest',
  },
});

let inMemoryAccessToken: string | null = null;
let refreshPromise: Promise<string | null> | null = null;

export function setAccessToken(token: string | null): void {
  inMemoryAccessToken = token;
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
    return err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
