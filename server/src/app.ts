import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type NextFunction, type Request, type Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { z } from 'zod';
import { env, hasExplicitServerUrlEnv, integrationStatus, resolveRequestOrigin } from './config/env.ts';
import adminRoutes from './routes/adminRoutes.ts';
import applicationRoutes, { recruiterAppRouter } from './routes/applicationRoutes.ts';
import authRoutes from './routes/authRoutes.ts';
import candidateRoutes from './routes/candidateRoutes.ts';
import interviewRoutes from './routes/interviewRoutes.ts';
import jobRoutes from './routes/jobRoutes.ts';
import { emailRouter, filesRouter, notificationRouter } from './routes/notificationAndEmailRoutes.ts';
import recruiterRoutes from './routes/recruiterRoutes.ts';
import { db } from './store/dataLayer.ts';
import { stripNoSqlOperators } from './utils/sanitize.ts';

export function createExpressApp() {
  const app = express();
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  const allowedOrigins = new Set(
    [env.clientUrl, env.serverUrl, 'http://localhost:3000'].filter(Boolean)
  );

  app.use(
    cors({
      origin: (origin, cb) => {
        if (!origin) return cb(null, true);
        if (allowedOrigins.has(origin) || origin.endsWith('.run.app') || origin.includes('localhost')) {
          return cb(null, true);
        }
        return cb(null, true);
      },
      credentials: true,
    })
  );

  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));

  // Sanitize incoming payloads against NoSQL operator injection
  app.use((req, _res, next) => {
    if (req.body && typeof req.body === 'object') {
      req.body = stripNoSqlOperators(req.body);
    }
    next();
  });

  const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: 'Too many authentication attempts. Please wait a few minutes.' },
  });

  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 240,
    standardHeaders: true,
    legacyHeaders: false,
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', authLimiter, authRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/candidate', candidateRoutes);
  app.use('/api/applications', applicationRoutes);
  app.use('/api/recruiter/applications', recruiterAppRouter);
  app.use('/api/recruiter', recruiterRoutes);
  app.use('/api/interviews', interviewRoutes);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/email', emailRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/admin', adminRoutes);

  // Public contact & newsletter endpoints
  app.post('/api/contact', async (req, res) => {
    const schema = z.object({
      name: z.string().min(2).max(100),
      email: z.string().email(),
      subject: z.string().min(3).max(150),
      message: z.string().min(10).max(3000),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid contact message' });
    }
    const created = await db.createContactMessage(parsed.data);
    res.status(201).json({ success: true, message: 'Thank you. Our team will respond shortly.', data: created });
  });

  app.post('/api/newsletter', async (req, res) => {
    const schema = z.object({ email: z.string().email() });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }
    await db.addNewsletterSubscriber(parsed.data.email);
    res.status(201).json({ success: true, message: 'Subscribed to Job Karenge career dispatches.' });
  });

  app.get('/api/public/settings', (_req, res) => {
    const settings = db.getPlatformSettings();
    const sanitizeHttp = (url?: string) => {
      const trimmed = (url || '').trim();
      if (!trimmed) return '';
      try {
        const u = new URL(trimmed);
        return u.protocol === 'http:' || u.protocol === 'https:' ? trimmed : '';
      } catch {
        return '';
      }
    };
    res.json({
      success: true,
      data: {
        supportEmail: settings.supportEmail || 'support@jobkarenge.com',
        socialLinks: {
          linkedin: sanitizeHttp(settings.socialLinks?.linkedin),
          twitter: sanitizeHttp(settings.socialLinks?.twitter),
          instagram: sanitizeHttp(settings.socialLinks?.instagram),
          facebook: sanitizeHttp(settings.socialLinks?.facebook),
          youtube: sanitizeHttp(settings.socialLinks?.youtube),
          github: sanitizeHttp(settings.socialLinks?.github),
        },
      },
    });
  });

  app.get('/api/health', (_req, res) => {
    res.json({
      success: true,
      status: 'ok',
      database: db.isMongo() ? 'mongodb_atlas' : 'local_persistent_store',
      integrations: integrationStatus,
      timestamp: new Date().toISOString(),
    });
  });

  // Dynamic SEO Sitemap & Robots
  app.get('/robots.txt', (req, res) => {
    const fallbackUrl = hasExplicitServerUrlEnv ? env.serverUrl : resolveRequestOrigin(req) || env.serverUrl;
    const activeServerUrl = (db.getPlatformSettings().serverUrl?.trim() || fallbackUrl).replace(/\/+$/, '');
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /candidate/\nDisallow: /recruiter/\nDisallow: /admin/\nSitemap: ${activeServerUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const fallbackUrl = hasExplicitServerUrlEnv ? env.serverUrl : resolveRequestOrigin(req) || env.serverUrl;
    const activeServerUrl = (db.getPlatformSettings().serverUrl?.trim() || fallbackUrl).replace(/\/+$/, '');
    const jobs = (await db.listJobs()).filter((j) => j.status === 'published');
    const urls = [
      `${activeServerUrl}/`,
      `${activeServerUrl}/jobs`,
      `${activeServerUrl}/companies`,
      `${activeServerUrl}/about`,
      `${activeServerUrl}/contact`,
      ...jobs.map((j) => `${activeServerUrl}/jobs/${j._id}`),
    ];
    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
      .map((u) => `  <url><loc>${u}</loc></url>`)
      .join('\n')}\n</urlset>`;
    res.type('application/xml').send(xml);
  });

  // Return JSON 404 for unknown API routes instead of falling through to SPA HTML
  app.use('/api', (_req, res) => {
    res.status(404).json({
      success: false,
      message: 'API endpoint not found.',
    });
  });

  // Centralized API error handler (including Multer file size/type errors)
  app.use('/api', (err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error('[API Error]', err);
    res.status(400).json({
      success: false,
      message: err.message || 'An unexpected server error occurred.',
    });
  });

  return app;
}
