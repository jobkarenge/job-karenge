import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { api, setAccessToken } from '../services/api';
import {
  broadcastAuthSync,
  readStoredSessionMarker,
  subscribeAuthSync,
} from '../services/authSync';
import type { CandidateProfile, Company, RecruiterProfile, User } from '../types';

interface AuthState {
  user: User | null;
  candidateProfile: CandidateProfile | null;
  recruiterProfile: RecruiterProfile | null;
  company: Company | null;
  loading: boolean;
}

interface SessionPayload {
  accessToken?: string;
  user: User;
  candidateProfile?: CandidateProfile | null;
  recruiterProfile?: RecruiterProfile | null;
  company?: Company | null;
}

interface AuthContextValue extends AuthState {
  login: (email: string, password: string) => Promise<User>;
  register: (payload: Record<string, unknown>) => Promise<{ user: User; verificationTokenPreview?: string }>;
  claimAdmin: (payload: { name: string; email: string; password: string; passcode?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setSessionFromPayload: (data: SessionPayload) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    candidateProfile: null,
    recruiterProfile: null,
    company: null,
    loading: true,
  });

  const currentUserIdRef = useRef<string | null>(null);
  const syncInFlightRef = useRef<Promise<void> | null>(null);

  const clearLocalSession = useCallback((shouldBroadcast: boolean) => {
    currentUserIdRef.current = null;
    setAccessToken(null);
    setState({
      user: null,
      candidateProfile: null,
      recruiterProfile: null,
      company: null,
      loading: false,
    });
    if (shouldBroadcast) {
      broadcastAuthSync('LOGOUT', null, null);
    }
  }, []);

  const applyPayload = useCallback(
    (data: SessionPayload, broadcastMode: false | 'LOGIN' | 'SESSION_REFRESH' = 'SESSION_REFRESH') => {
      if (data.accessToken) {
        setAccessToken(data.accessToken);
      }
      currentUserIdRef.current = data.user?._id || null;
      setState({
        user: data.user,
        candidateProfile: data.candidateProfile || null,
        recruiterProfile: data.recruiterProfile || null,
        company: data.company || null,
        loading: false,
      });
      if (broadcastMode && data.user?._id) {
        broadcastAuthSync(broadcastMode, data.user._id, data.user.role);
      }
    },
    []
  );

  const syncFromRefreshCookie = useCallback(
    async (notifyIfSwitched = false) => {
      if (syncInFlightRef.current) {
        return syncInFlightRef.current;
      }

      const task = (async () => {
        const previousUserId = currentUserIdRef.current;
        try {
          const res = await api.post('/auth/refresh');
          if (res.data?.data?.user) {
            const nextUser: User = res.data.data.user;
            applyPayload(res.data.data, false);
            if (notifyIfSwitched && previousUserId && previousUserId !== nextUser._id) {
              toast.info(`Switched active session to ${nextUser.name} (${nextUser.role}) to stay synced across tabs.`);
            }
          } else {
            clearLocalSession(false);
          }
        } catch {
          clearLocalSession(false);
        } finally {
          syncInFlightRef.current = null;
        }
      })();

      syncInFlightRef.current = task;
      return task;
    },
    [applyPayload, clearLocalSession]
  );

  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get('/auth/me');
      applyPayload(res.data.data, 'SESSION_REFRESH');
    } catch {
      clearLocalSession(false);
    }
  }, [applyPayload, clearLocalSession]);

  useEffect(() => {
    let active = true;
    api
      .post('/auth/refresh')
      .then((res) => {
        if (!active) return;
        if (res.data?.data?.user) {
          const incomingUser: User = res.data.data.user;
          const marker = readStoredSessionMarker();
          const markerDiffers = marker?.userId !== incomingUser._id;
          applyPayload(res.data.data, markerDiffers ? 'SESSION_REFRESH' : false);
        } else {
          clearLocalSession(false);
        }
      })
      .catch(() => {
        if (active) {
          clearLocalSession(false);
        }
      });
    return () => {
      active = false;
    };
  }, [applyPayload, clearLocalSession]);

  useEffect(() => {
    const unsubscribe = subscribeAuthSync((payload) => {
      if (payload.type === 'LOGOUT') {
        if (currentUserIdRef.current !== null) {
          clearLocalSession(false);
          toast.info('Signed out in another tab.');
        } else {
          setAccessToken(null);
        }
        return;
      }

      if (payload.userId && payload.userId !== currentUserIdRef.current) {
        // Immediately drop previous user's in-memory JWT before refreshing from shared cookie
        setAccessToken(null);
        void syncFromRefreshCookie(true);
      } else if (payload.type === 'SESSION_REFRESH' && payload.userId && payload.userId === currentUserIdRef.current) {
        void syncFromRefreshCookie(false);
      }
    });

    const checkTabSync = () => {
      const marker = readStoredSessionMarker();
      if (!marker) return;
      if (marker.userId === null && currentUserIdRef.current !== null) {
        clearLocalSession(false);
        toast.info('Signed out in another tab.');
        return;
      }
      if (marker.userId && marker.userId !== currentUserIdRef.current) {
        setAccessToken(null);
        void syncFromRefreshCookie(true);
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkTabSync();
      }
    };

    window.addEventListener('focus', checkTabSync);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      unsubscribe();
      window.removeEventListener('focus', checkTabSync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [clearLocalSession, syncFromRefreshCookie]);

  const login = async (email: string, password: string) => {
    const res = await api.post('/auth/login', { email, password });
    applyPayload(res.data.data, 'LOGIN');
    return res.data.data.user as User;
  };

  const register = async (payload: Record<string, unknown>) => {
    const res = await api.post('/auth/register', payload);
    applyPayload(res.data.data, 'LOGIN');
    return {
      user: res.data.data.user as User,
      verificationTokenPreview: res.data.data.verificationTokenPreview as string | undefined,
    };
  };

  const claimAdmin = async (payload: { name: string; email: string; password: string; passcode?: string }) => {
    const res = await api.post('/auth/admin-setup', payload);
    applyPayload(res.data.data, 'LOGIN');
    return res.data.data.user as User;
  };

  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } finally {
      clearLocalSession(true);
    }
  };

  const setSessionFromPayload = useCallback(
    (data: SessionPayload) => {
      applyPayload(data, 'LOGIN');
    },
    [applyPayload]
  );

  return (
    <AuthContext.Provider
      value={{
        ...state,
        login,
        register,
        claimAdmin,
        logout,
        refreshUser,
        setSessionFromPayload,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
