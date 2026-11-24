import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { toast } from 'sonner';
import { api, getAccessToken } from '../services/api';
import type { AppNotification } from '../types';
import { useAuth } from './AuthContext';

interface NotificationContextValue {
  notifications: AppNotification[];
  unreadCount: number;
  connected: boolean;
  refreshNotifications: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextValue>({
  notifications: [],
  unreadCount: 0,
  connected: false,
  refreshNotifications: async () => {},
  markRead: async () => {},
  markAllRead: async () => {},
  deleteNotification: async () => {},
});

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const seenIdsRef = React.useRef<Set<string>>(new Set());
  const initializedRef = React.useRef(false);
  const lastUserIdRef = React.useRef<string | null>(null);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      lastUserIdRef.current = null;
      setNotifications([]);
      setUnreadCount(0);
      seenIdsRef.current = new Set();
      initializedRef.current = false;
      return;
    }
    if (lastUserIdRef.current !== user._id) {
      lastUserIdRef.current = user._id;
      seenIdsRef.current = new Set();
      initializedRef.current = false;
    }
    try {
      const res = await api.get('/notifications');
      const items: AppNotification[] = res.data.data.items || [];
      if (initializedRef.current) {
        const newlyArrived = items.filter((n) => !n.read && !seenIdsRef.current.has(n._id));
        for (const incoming of newlyArrived) {
          toast.info(incoming.title, { description: incoming.message });
          window.dispatchEvent(new CustomEvent('jk:notification-received', { detail: incoming }));
        }
      }
      seenIdsRef.current = new Set(items.map((n) => n._id));
      initializedRef.current = true;
      setNotifications(items);
      setUnreadCount(res.data.data.unreadCount ?? items.filter((n) => !n.read).length);
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    refreshNotifications();
  }, [refreshNotifications]);

  useEffect(() => {
    if (!user) {
      setConnected(false);
      return;
    }

    const socket: Socket = io({
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket', 'polling'],
      reconnection: true,
    });

    const connectIfToken = () => {
      if (getAccessToken() && !socket.connected) {
        socket.connect();
      }
    };

    socket.on('connect', () => {
      setConnected(true);
      refreshNotifications();
    });
    socket.on('disconnect', () => setConnected(false));
    socket.on('connect_error', () => {
      setConnected(false);
    });
    socket.on('notification:new', (incoming: AppNotification) => {
      seenIdsRef.current.add(incoming._id);
      setNotifications((prev) => {
        if (prev.some((n) => n._id === incoming._id)) return prev;
        return [incoming, ...prev];
      });
      setUnreadCount((c) => c + 1);
      toast.info(incoming.title, { description: incoming.message });
      window.dispatchEvent(new CustomEvent('jk:notification-received', { detail: incoming }));
    });
    socket.on('companies:updated', (payload: unknown) => {
      window.dispatchEvent(new CustomEvent('jk:companies-updated', { detail: payload }));
    });

    const handleTokenChange = () => {
      if (getAccessToken()) {
        if (socket.connected) {
          socket.disconnect();
        }
        socket.connect();
      } else {
        socket.disconnect();
      }
    };

    const handleFocus = () => {
      refreshNotifications();
      connectIfToken();
    };
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refreshNotifications();
        connectIfToken();
      }
    };

    window.addEventListener('jk:auth-token-changed', handleTokenChange);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    const pollInterval = window.setInterval(refreshNotifications, 15000);

    return () => {
      window.clearInterval(pollInterval);
      window.removeEventListener('jk:auth-token-changed', handleTokenChange);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
      socket.disconnect();
    };
  }, [user, refreshNotifications]);

  const markRead = async (id: string) => {
    await api.patch(`/notifications/${id}/read`);
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, read: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
  };

  const markAllRead = async () => {
    await api.patch('/notifications/read-all');
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const deleteNotification = async (id: string) => {
    const target = notifications.find((n) => n._id === id);
    await api.delete(`/notifications/${id}`);
    setNotifications((prev) => prev.filter((n) => n._id !== id));
    if (target && !target.read) {
      setUnreadCount((c) => Math.max(0, c - 1));
    }
  };

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        connected,
        refreshNotifications,
        markRead,
        markAllRead,
        deleteNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  return useContext(NotificationContext);
}
