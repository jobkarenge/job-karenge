import type { NextFunction, Request, Response } from 'express';
import { db } from '../store/dataLayer.ts';
import type { UserRecord, UserRole } from '../types/domain.ts';
import { verifyAccessToken } from '../utils/tokens.ts';

export interface AuthenticatedRequest extends Request {
  user?: UserRecord;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const payload = verifyAccessToken(token);
    const user = await db.findUserById(payload.userId);
    if (!user) {
      return res.status(401).json({ success: false, message: 'User account not found' });
    }
    if (user.accountStatus === 'suspended') {
      return res.status(403).json({ success: false, message: 'Account is suspended. Contact support.' });
    }
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired access token' });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const payload = verifyAccessToken(authHeader.slice(7).trim());
      const user = await db.findUserById(payload.userId);
      if (user && user.accountStatus !== 'suspended') {
        req.user = user;
      }
    } catch {
      // ignore invalid optional token
    }
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'You do not have permission for this action' });
    }
    next();
  };
}

export function verifyCookieRequestOrigin(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  const host = (req.headers['x-forwarded-host'] as string) || req.headers.host;
  const requestedWith = req.headers['x-requested-with'];

  if (requestedWith === 'XMLHttpRequest') {
    return next();
  }

  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host.split(',')[0].trim()) {
        return next();
      }
    } catch {
      return res.status(403).json({ success: false, message: 'Invalid request origin' });
    }
    return res.status(403).json({ success: false, message: 'Origin mismatch' });
  }

  next();
}
