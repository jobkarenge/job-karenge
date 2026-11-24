import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { Server as SocketIOServer } from 'socket.io';
import { createExpressApp } from './src/app.ts';
import { connectDatabase } from './src/config/db.ts';
import { env } from './src/config/env.ts';
import { attachSocketIO } from './src/services/notificationService.ts';
import { startBackgroundSchedulers } from './src/services/schedulerJobs.ts';
import { ensureSeededDatabase } from './src/store/dataLayer.ts';
import { verifyAccessToken } from './src/utils/tokens.ts';

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

  const serverDir = import.meta.dirname;
  const clientDir = path.resolve(serverDir, '..', 'client');

  if (!env.isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      configFile: path.resolve(clientDir, 'vite.config.ts'),
      root: clientDir,
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
    const clientDistDir = path.resolve(clientDir, 'dist');
    const localDistDir = path.resolve(process.cwd(), 'dist');
    const distDir = fs.existsSync(path.join(clientDistDir, 'index.html'))
      ? clientDistDir
      : fs.existsSync(path.join(localDistDir, 'index.html'))
        ? localDistDir
        : null;

    if (distDir) {
      app.use(express.static(distDir));
      app.get('*', (_req, res) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    } else {
      app.get('/', (_req, res) => {
        res.json({
          success: true,
          service: 'Job Karenge API',
          status: 'ok',
        });
      });
    }
  }

  httpServer.listen(env.port, '0.0.0.0', () => {
    console.log(`[Job Karenge] Server listening on http://0.0.0.0:${env.port}`);
  });
}

bootstrap().catch((err) => {
  console.error('[Job Karenge] Fatal startup error:', err);
  process.exit(1);
});
