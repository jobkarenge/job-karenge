import type { Server as SocketIOServer } from 'socket.io';
import { db } from '../store/dataLayer.ts';
import type { NotificationRecord } from '../types/domain.ts';

let ioInstance: SocketIOServer | null = null;

export function attachSocketIO(io: SocketIOServer): void {
  ioInstance = io;
}

export function emitUserEvent(userId: string, event: string, payload?: unknown): void {
  if (ioInstance && userId) {
    ioInstance.to(`user:${userId}`).emit(event, payload ?? {});
  }
}

export async function pushNotification(params: {
  userId: string;
  type: string;
  title: string;
  message: string;
  link?: string;
}): Promise<NotificationRecord> {
  const created = await db.createNotification({
    userId: params.userId,
    type: params.type,
    title: params.title,
    message: params.message,
    link: params.link || '',
    read: false,
  });

  if (ioInstance) {
    ioInstance.to(`user:${params.userId}`).emit('notification:new', created);
  }

  return created;
}
