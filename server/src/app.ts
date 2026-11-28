import compression from 'compression';
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
  app.set('etag', 'strong');

  app.use(
    compression({
      threshold: 1024,
      level: 6,
    })
  );

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      frameguard: false,
    })
  );

  const allowedOrigins = new Set(
    [
      ...env.clientUrl.split(',').map((s) => s.trim()),
      env.serverUrl,
      'http://localhost:3000',
      'http://127.0.0.1:3000',
    ].filter(Boolean)
  );

  const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return true;
    if (allowedOrigins.has(origin)) return true;
    try {
      const host = new URL(origin).hostname;
      return (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host.endsWith('.run.app') ||
        host.endsWith('.netlify.app') ||
        host.endsWith('.onrender.com')
      );
    } catch {
      return false;
    }
  };

  app.use(
    cors({
      origin: (origin, cb) => cb(null, isOriginAllowed(origin)),
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

  const noStore = (_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  };

  app.use('/api', (req, res, next) => {
    req.setTimeout(30_000);
    res.setTimeout(30_000, () => {
      if (!res.headersSent) {
        res.status(504).json({ success: false, message: 'Request timed out. Please try again.' });
      }
    });
    next();
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', noStore, authLimiter, authRoutes);
  app.use('/api/jobs', jobRoutes);
  app.use('/api/candidate', noStore, candidateRoutes);
  app.use('/api/applications', noStore, applicationRoutes);
  app.use('/api/recruiter/applications', noStore, recruiterAppRouter);
  app.use('/api/recruiter', noStore, recruiterRoutes);
  app.use('/api/interviews', noStore, interviewRoutes);
  app.use('/api/notifications', noStore, notificationRouter);
  app.use('/api/email', noStore, emailRouter);
  app.use('/api/files', filesRouter);
  app.use('/api/admin', noStore, adminRoutes);

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
    res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
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
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.type('text/plain').send(
      `User-agent: *\nAllow: /\nDisallow: /candidate/\nDisallow: /recruiter/\nDisallow: /admin/\nSitemap: ${activeServerUrl}/sitemap.xml\n`
    );
  });

  app.get('/sitemap.xml', async (req, res) => {
    const fallbackUrl = hasExplicitServerUrlEnv ? env.serverUrl : resolveRequestOrigin(req) || env.serverUrl;
    const activeServerUrl = (db.getPlatformSettings().serverUrl?.trim() || fallbackUrl).replace(/\/+$/, '');
    const jobs = await db.listJobsForSitemap();
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
    res.setHeader('Cache-Control', 'public, max-age=300');
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
