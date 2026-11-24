export type AuthSyncEventType = 'LOGIN' | 'LOGOUT' | 'SESSION_REFRESH';

export interface AuthSyncPayload {
  type: AuthSyncEventType;
  userId: string | null;
  role?: string | null;
  tabId: string;
  ts: number;
}

const CHANNEL_NAME = 'jk_auth_sync';
const STORAGE_KEY = 'jk_auth_session_marker';

const TAB_ID =
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `tab_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

export function getCurrentTabId(): string {
  return TAB_ID;
}

export function readStoredSessionMarker(): AuthSyncPayload | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthSyncPayload;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function broadcastAuthSync(type: AuthSyncEventType, userId: string | null, role?: string | null): void {
  if (typeof window === 'undefined') return;
  const payload: AuthSyncPayload = {
    type,
    userId,
    role: role ?? null,
    tabId: TAB_ID,
    ts: Date.now(),
  };

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage quota/privacy mode failures cleanly
  }

  try {
    if (typeof BroadcastChannel !== 'undefined') {
      const ch = new BroadcastChannel(CHANNEL_NAME);
      ch.postMessage(payload);
      ch.close();
    }
  } catch {
    // Fallback is handled by localStorage storage events
  }
}

export function subscribeAuthSync(onRemoteEvent: (payload: AuthSyncPayload) => void): () => void {
  if (typeof window === 'undefined') return () => {};

  let lastHandledSignature = '';
  const handleIncoming = (payload: AuthSyncPayload | null | undefined) => {
    if (!payload || payload.tabId === TAB_ID) return;
    const signature = `${payload.tabId}:${payload.type}:${payload.userId ?? 'null'}:${payload.ts}`;
    if (signature === lastHandledSignature) return;
    lastHandledSignature = signature;
    onRemoteEvent(payload);
  };

  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
      channel.onmessage = (event: MessageEvent<AuthSyncPayload>) => {
        handleIncoming(event.data);
      };
    } catch {
      channel = null;
    }
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    try {
      const parsed = JSON.parse(event.newValue) as AuthSyncPayload;
      handleIncoming(parsed);
    } catch {
      // Ignore malformed storage data
    }
  };

  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener('storage', onStorage);
    if (channel) {
      try {
        channel.close();
      } catch {
        // Ignore close errors
      }
    }
  };
}
