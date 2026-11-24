import axios from 'axios';

function resolveBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL?.trim();
  if (!raw) return '/api';
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return '/api';
    }
    const isLocalTarget =
      parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
    if (isLocalTarget && typeof window !== 'undefined' && parsed.host !== window.location.host) {
      return '/api';
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}/api`;
  } catch {
    return '/api';
  }
}

const baseURL = resolveBaseUrl();

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
    return err.response?.data?.message || err.message || fallback;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
