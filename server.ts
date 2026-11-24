import express from 'express';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createExpressApp } from './server/src/app.ts';
import { connectDatabase } from './server/src/config/db.ts';
import { env } from './server/src/config/env.ts';
import { attachSocketIO } from './server/src/services/notificationService.ts';
import { startBackgroundSchedulers } from './server/src/services/schedulerJobs.ts';
import { ensureSeededDatabase } from './server/src/store/dataLayer.ts';
import { verifyAccessToken } from './server/src/utils/tokens.ts';

async function bootstrap() {
  await connectDatabase();
  await ensureSeededDatabase();

  const app = createExpressApp();
  const httpServer = http.createServer(app);

  const io = new SocketIOServer(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) return next(new Error('Unauthorized'));
    try {
      const payload = verifyAccessToken(token);
      socket.data.userId = payload.userId;
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;
    if (userId) {
      socket.join(`user:${userId}`);
    }
  });

  attachSocketIO(io);
  startBackgroundSchedulers();

  if (!env.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        allowedHosts: true,
        ws: {
          server: httpServer,
          path: '/vite-ws',
        },
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`[Job Karenge] Server listening on http://0.0.0.0:${env.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Job Karenge] Fatal startup error:', err);
  process.exit(1);
});
