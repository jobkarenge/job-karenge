import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router, type Response } from 'express';
import { z } from 'zod';
import { env, integrationStatus, resolveClientOrigin, resolveRequestOrigin } from '../config/env.ts';
import {
  requireAuth,
  verifyCookieRequestOrigin,
  type AuthenticatedRequest,
} from '../middleware/authMiddleware.ts';
import { dispatchEmailBounded, sendPasswordResetEmail, sendWelcomeEmail } from '../services/emailService.ts';
import { pushNotification } from '../services/notificationService.ts';
import { db } from '../store/dataLayer.ts';
import { sanitizeUser, slugify } from '../utils/sanitize.ts';
import {
  hashToken,
  signAccessToken,
  signEmailVerificationToken,
  signRefreshToken,
  verifyEmailVerificationToken,
  verifyRefreshToken,
} from '../utils/tokens.ts';

const router = Router();

const REFRESH_COOKIE_NAME = 'jk_refresh_token';

function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE_NAME, token, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    maxAge: 7 * 24 * 60 * 60 * 1000,
    path: '/',
  } as Record<string, unknown>);
}

function clearRefreshCookie(res: Response): void {
  res.clearCookie(REFRESH_COOKIE_NAME, {
    httpOnly: true,
    secure: true,
    sameSite: 'none',
    partitioned: true,
    path: '/',
  } as Record<string, unknown>);
}

async function buildAuthSessionPayload(user: Awaited<ReturnType<typeof db.findUserById>>) {
  if (!user) return null;
  const safeUser = sanitizeUser(user);
  let candidateProfile = null;
  let recruiterProfile = null;
  let company = null;

  if (user.role === 'candidate') {
    candidateProfile = await db.getCandidateProfile(user._id);
  } else if (user.role === 'recruiter') {
    recruiterProfile = await db.getRecruiterProfile(user._id);
    if (recruiterProfile?.companyId) {
      company = await db.findCompanyById(recruiterProfile.companyId);
    }
  }

  return {
    user: safeUser,
    candidateProfile,
    recruiterProfile,
    company,
  };
}

router.get('/admin-status', async (_req, res) => {
  const adminCount = await db.countAdmins();
  res.json({
    success: true,
    data: {
      adminClaimed: adminCount > 0,
      passcodeRequired: Boolean(env.adminSetupPasscode),
    },
  });
});

const adminSetupSchema = z.object({
  name: z.string().min(2).max(80),
  email: z.string().email(),
  password: z.string().min(8).max(100),
  passcode: z.string().optional(),
});

router.post('/admin-setup', async (req, res) => {
  const parsed = adminSetupSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid input' });
  }

  const adminCount = await db.countAdmins();
  if (adminCount > 0) {
    return res.status(403).json({
      success: false,
      message: 'Super Admin account has already been claimed. Please sign in normally.',
    });
  }

  if (env.adminSetupPasscode && parsed.data.passcode?.trim() !== env.adminSetupPasscode) {
    return res.status(403).json({ success: false, message: 'Invalid admin setup passcode.' });
  }

  const existing = await db.findUserByEmail(parsed.data.email);
  if (existing) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  const adminUser = await db.createUser({
    name: parsed.data.name.trim(),
    email: parsed.data.email.trim().toLowerCase(),
    phone: '',
    passwordHash,
    role: 'admin',
    emailVerified: true,
    accountStatus: 'active',
    profileImage: '',
    profileImagePublicId: '',
    location: 'Platform HQ',
  });

  const accessToken = signAccessToken({ userId: adminUser._id, role: adminUser.role, email: adminUser.email });
  const refreshToken = signRefreshToken(adminUser._id);
  await db.saveRefreshToken(adminUser._id, hashToken(refreshToken), new Date(Date.now() + 7 * 86400_000).toISOString());
  setRefreshCookie(res, refreshToken);

  await db.createAuditLog({
    actorId: adminUser._id,
    actorEmail: adminUser.email,
    actorRole: 'admin',
    action: 'ADMIN_ACCOUNT_CLAIMED',
    targetType: 'User',
    targetId: adminUser._id,
    details: 'Initial Super Admin account claimed via setup endpoint.',
    ipAddress: req.ip || '',
  });

  res.status(201).json({
    success: true,
    message: 'Super Admin account created and signed in.',
    data: {
      accessToken,
      ...(await buildAuthSessionPayload(adminUser)),
    },
  });
});

const registerSchema = z.object({
  role: z.enum(['candidate', 'recruiter']),
  name: z.string().min(2).max(100),
  email: z.string().email(),
  phone: z.string().min(6).max(24),
  password: z.string().min(8).max(100),
  location: z.string().max(120).optional(),
  companyName: z.string().max(120).optional(),
  designation: z.string().max(120).optional(),
});

router.post('/register', async (req, res) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid registration data' });
  }

  const { role, name, email, phone, password, location, companyName, designation } = parsed.data;
  if (role === 'recruiter' && (!companyName?.trim() || !designation?.trim())) {
    return res.status(400).json({
      success: false,
      message: 'Company name and designation are required for recruiter registration.',
    });
  }

  const normalizedEmail = email.trim().toLowerCase();
  const existing = await db.findUserByEmail(normalizedEmail);
  if (existing) {
    return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = await db.createUser({
    name: name.trim(),
    email: normalizedEmail,
    phone: phone.trim(),
    passwordHash,
    role,
    emailVerified: false,
    accountStatus: 'active',
    profileImage: '',
    profileImagePublicId: '',
    location: location?.trim() || '',
  });

  if (role === 'candidate') {
    await db.upsertCandidateProfile(user._id, {
      currentLocation: location?.trim() || '',
      completionPercentage: 25,
    });
    await db.getEmailPreference(user._id);
  } else {
    const settings = db.getPlatformSettings();
    const companySlug = `${slugify(companyName || name)}-${crypto.randomBytes(2).toString('hex')}`;
    const company = await db.createCompany({
      name: companyName!.trim(),
      slug: companySlug,
      logoUrl: '',
      logoPublicId: '',
      bannerUrl: '',
      bannerPublicId: '',
      industry: 'Technology & Services',
      description: `${companyName!.trim()} hiring team on Job Karenge.`,
      website: '',
      size: '50-200 employees',
      headquarters: location?.trim() || 'India',
      socialLinks: { linkedin: '', twitter: '' },
      contactEmail: normalizedEmail,
      contactPhone: phone.trim(),
      verified: !settings.requireRecruiterApproval,
      ownerRecruiterId: user._id,
    });

    await db.createRecruiterProfile({
      userId: user._id,
      companyId: company._id,
      companyName: company.name,
      designation: designation!.trim(),
      verificationStatus: settings.requireRecruiterApproval ? 'pending' : 'approved',
    });

    await pushNotification({
      userId: user._id,
      type: 'recruiter_verification',
      title: settings.requireRecruiterApproval ? 'Recruiter Verification Pending' : 'Recruiter Account Active',
      message: settings.requireRecruiterApproval
        ? 'Your recruiter account is queued for admin verification before publishing live jobs.'
        : 'Your recruiter workspace is verified and ready to publish jobs.',
      link: '/recruiter/company',
    });
  }

  const verificationToken = signEmailVerificationToken(user._id, user.email);
  await db.updateUser(user._id, { verificationToken });
  await dispatchEmailBounded(
    sendWelcomeEmail(user, verificationToken, resolveRequestOrigin(req), resolveClientOrigin(req)),
    8000
  );

  const accessToken = signAccessToken({ userId: user._id, role: user.role, email: user.email });
  const refreshToken = signRefreshToken(user._id);
  await db.saveRefreshToken(user._id, hashToken(refreshToken), new Date(Date.now() + 7 * 86400_000).toISOString());
  setRefreshCookie(res, refreshToken);

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please verify your email address.',
    data: {
      accessToken,
      verificationTokenPreview: env.isProd ? undefined : verificationToken,
      ...(await buildAuthSessionPayload(user)),
    },
  });
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

router.post('/login', async (req, res) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: 'Valid email and password are required.' });
  }

  const user = await db.findUserByEmail(parsed.data.email);
  if (!user) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  if (user.accountStatus === 'suspended') {
    return res.status(403).json({ success: false, message: 'This account has been suspended by an administrator.' });
  }

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) {
    return res.status(401).json({ success: false, message: 'Invalid email or password.' });
  }

  const accessToken = signAccessToken({ userId: user._id, role: user.role, email: user.email });
  const refreshToken = signRefreshToken(user._id);
  await db.saveRefreshToken(user._id, hashToken(refreshToken), new Date(Date.now() + 7 * 86400_000).toISOString());
  setRefreshCookie(res, refreshToken);

  res.json({
    success: true,
    data: {
      accessToken,
      ...(await buildAuthSessionPayload(user)),
    },
  });
});

router.post('/refresh', verifyCookieRequestOrigin, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, message: 'No active session' });
  }

  try {
    const decoded = verifyRefreshToken(token);
    const tokenHash = hashToken(token);
    const stored = await db.findValidRefreshToken(tokenHash);
    if (!stored || stored.userId !== decoded.userId) {
      return res.status(401).json({ success: false, message: 'Session expired or revoked' });
    }

    const user = await db.findUserById(decoded.userId);
    if (!user || user.accountStatus === 'suspended') {
      return res.status(401).json({ success: false, message: 'Account unavailable' });
    }

    const accessToken = signAccessToken({ userId: user._id, role: user.role, email: user.email });
    res.json({
      success: true,
      data: {
        accessToken,
        ...(await buildAuthSessionPayload(user)),
      },
    });
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid refresh token' });
  }
});

router.post('/logout', verifyCookieRequestOrigin, async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE_NAME];
  if (token) {
    await db.revokeRefreshToken(hashToken(token));
  }
  clearRefreshCookie(res);
  res.json({ success: true, message: 'Logged out successfully.' });
});

router.post('/verify-email', async (req, res) => {
  const token = String(req.body?.token || '');
  if (!token) {
    return res.status(400).json({ success: false, message: 'Verification token is required.' });
  }

  try {
    const { userId } = verifyEmailVerificationToken(token);
    const updated = await db.updateUser(userId, { emailVerified: true, verificationToken: '' });
    if (!updated) {
      return res.status(404).json({ success: false, message: 'Account not found.' });
    }
    res.json({ success: true, message: 'Email verified successfully.' });
  } catch {
    res.status(400).json({ success: false, message: 'Invalid or expired verification link.' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const emailParsed = z.string().trim().email().safeParse(req.body?.email);
  if (!emailParsed.success) {
    return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
  }
  const email = emailParsed.data.toLowerCase();

  if (env.isProd && !integrationStatus.emailConfigured) {
    console.error('[Auth][ForgotPassword] Cannot send reset email: GMAIL_USER / GMAIL_APP_PASSWORD not configured.');
    return res.status(503).json({
      success: false,
      message: 'Password reset email service is not configured on this server. Please contact support.',
    });
  }

  const user = await db.findUserByEmail(email);
  if (user) {
    const resetToken = crypto.randomBytes(24).toString('hex');
    const resetTokenHash = hashToken(resetToken);
    const resetTokenExpires = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await db.updateUser(user._id, { resetTokenHash, resetTokenExpires });
    try {
      const emailResult = await dispatchEmailBounded(
        sendPasswordResetEmail(user, resetToken, resolveRequestOrigin(req), resolveClientOrigin(req)),
        10_000
      );
      if (emailResult.status === 'failed') {
        console.error(`[Auth][ForgotPassword] Reset email failed for ${email}: ${emailResult.error}`);
      }
    } catch (err) {
      console.error(`[Auth][ForgotPassword] Unexpected reset email error for ${email}:`, err);
    }

    return res.json({
      success: true,
      message: 'If an account matches this email, a reset link has been sent.',
      resetTokenPreview: env.isProd ? undefined : resetToken,
    });
  }

  res.json({
    success: true,
    message: 'If an account matches this email, a reset link has been sent.',
  });
});

router.post('/reset-password', async (req, res) => {
  const schema = z.object({
    token: z.string().min(10),
    password: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid reset request' });
  }

  const targetHash = hashToken(parsed.data.token);
  const user = await db.findUserByResetTokenHash(targetHash);

  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired password reset token.' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 12);
  await db.updateUser(user._id, { passwordHash, resetTokenHash: '', resetTokenExpires: '' });
  res.json({ success: true, message: 'Password updated successfully. You can now sign in.' });
});

router.post('/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  const schema = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(8).max(100),
  });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ success: false, message: parsed.error.issues[0]?.message || 'Invalid password input' });
  }

  const valid = await bcrypt.compare(parsed.data.currentPassword, req.user!.passwordHash);
  if (!valid) {
    return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
  }

  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.updateUser(req.user!._id, { passwordHash });
  res.json({ success: true, message: 'Password changed successfully.' });
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    data: await buildAuthSessionPayload(req.user!),
  });
});

export default router;
