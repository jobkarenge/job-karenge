import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { env } from '../config/env.ts';
import type { UserRole } from '../types/domain.ts';

export interface AccessTokenPayload {
  userId: string;
  role: UserRole;
  email: string;
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.jwtAccessSecret, { expiresIn: '20m' });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.jwtAccessSecret) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): string {
  return jwt.sign({ userId, jti: crypto.randomBytes(12).toString('hex') }, env.jwtRefreshSecret, {
    expiresIn: '7d',
  });
}

export function verifyRefreshToken(token: string): { userId: string } {
  return jwt.verify(token, env.jwtRefreshSecret) as { userId: string };
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function signEmailVerificationToken(userId: string, email: string): string {
  return jwt.sign({ userId, email, purpose: 'verify_email' }, env.emailVerificationSecret, { expiresIn: '24h' });
}

export function verifyEmailVerificationToken(token: string): { userId: string; email: string } {
  const decoded = jwt.verify(token, env.emailVerificationSecret) as {
    userId: string;
    email: string;
    purpose?: string;
  };
  if (decoded.purpose !== 'verify_email') throw new Error('Invalid verification token');
  return { userId: decoded.userId, email: decoded.email };
}

export const PASSWORD_RESET_TTL_MS = 15 * 60 * 1000;

export function generatePasswordResetToken(): {
  token: string;
  tokenHash: string;
  expiresAt: string;
} {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + PASSWORD_RESET_TTL_MS).toISOString();
  return { token, tokenHash, expiresAt };
}
