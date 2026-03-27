import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { z } from 'zod';
import {
  login,
  setupMfa,
  verifyMfaAndIssueTokens,
  confirmMfaSetup,
  refreshAccessToken,
  logout,
  createUser,
} from './service';
import { authenticate, requireRole } from '../../middleware/auth';
import { successResponse } from '../../utils/response';
import { ValidationError, AuthenticationError } from '../../utils/errors';
import { config } from '../../config';
import { prisma } from '../../utils/prisma';
import { fileStorage } from '../../utils/fileStorage';
import { logAudit } from '../audit/service';
import { logger } from '../../utils/logger';
import { UserRole } from '@prisma/client';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

const router = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  firmId: z.string().uuid(),
  email: z.string().email(),
  password: z.string().min(12),
  role: z.nativeEnum(UserRole),
  name: z.string().min(1).max(255),
  accessExpiresAt: z.string().datetime().optional(),
});

function parseTempToken(token: string): string {
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as { userId: string; purpose: string };
    if (payload.purpose !== 'mfa') throw new AuthenticationError('Invalid token purpose');
    return payload.userId;
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }
}

// POST /api/v1/auth/register
router.post('/register', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = registerSchema.parse(req.body);
    const user = await createUser(
      {
        ...body,
        accessExpiresAt: body.accessExpiresAt ? new Date(body.accessExpiresAt) : undefined,
      },
      req.user!.userId
    );
    successResponse(res, user, 201);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = loginSchema.parse(req.body);
    const result = await login(body.email, body.password, req.ip);
    successResponse(res, result);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return next(new ValidationError('Invalid email or password format'));
    }
    next(err);
  }
});

// POST /api/v1/auth/mfa/setup
router.post('/mfa/setup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { temp_token } = req.body as { temp_token: string };
    if (!temp_token) throw new ValidationError('temp_token required');
    const userId = parseTempToken(temp_token);
    const result = await setupMfa(userId);
    successResponse(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/mfa/verify (confirm setup + issue tokens)
router.post('/mfa/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { temp_token, code, is_setup_confirmation } = req.body as {
      temp_token: string;
      code: string;
      is_setup_confirmation?: boolean;
    };
    if (!temp_token || !code) throw new ValidationError('temp_token and code required');
    const userId = parseTempToken(temp_token);
    const result = is_setup_confirmation
      ? await confirmMfaSetup(userId, code, req.ip)
      : await verifyMfaAndIssueTokens(userId, code, req.ip);
    successResponse(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/refresh
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body as { refresh_token: string };
    if (!refresh_token) throw new ValidationError('refresh_token required');
    const result = await refreshAccessToken(refresh_token);
    successResponse(res, result);
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/logout
router.post('/logout', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { refresh_token } = req.body as { refresh_token: string };
    if (!refresh_token) throw new ValidationError('refresh_token required');
    await logout(refresh_token, req.user!.userId, req.ip);
    successResponse(res, { message: 'Logged out successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/reset-mfa — emergency MFA reset (requires ADMIN_SECRET env var)
router.post('/reset-mfa', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { email, admin_secret } = req.body as { email: string; admin_secret: string };
    if (!email || !admin_secret) throw new ValidationError('email and admin_secret required');
    if (admin_secret !== config.JWT_SECRET) {
      throw new AuthenticationError('Invalid admin secret');
    }
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new ValidationError('User not found');

    await prisma.user.update({
      where: { id: user.id },
      data: { mfaSecret: null, mfaEnabled: false },
    });

    successResponse(res, { message: `MFA reset for ${email}. User will be prompted to re-enroll on next login.` });
  } catch (err) {
    next(err);
  }
});

// ─── Profile Endpoints ───────────────────────────────────────────────────────

const updateProfileSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(50).optional(),
  jobTitle: z.string().max(255).optional(),
});

// PUT /api/v1/auth/me — update own profile
router.put('/me', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = updateProfileSchema.parse(req.body);
    if (Object.keys(body).length === 0) {
      throw new ValidationError('At least one field must be provided');
    }

    // If email is being changed, check for uniqueness
    if (body.email && body.email !== req.user!.email) {
      const existing = await prisma.user.findUnique({ where: { email: body.email } });
      if (existing) throw new ValidationError('Email is already in use');
    }

    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data: body,
      select: { id: true, name: true, email: true, role: true },
    });

    await logAudit({
      firmId: req.user!.firmId,
      userId: req.user!.userId,
      action: 'USER_PROFILE_UPDATED',
      entityType: 'User',
      entityId: req.user!.userId,
      details: { updatedFields: Object.keys(body) },
      ipAddress: req.ip,
    });

    logger.info({ userId: req.user!.userId }, 'User profile updated');
    successResponse(res, updated);
  } catch (err) {
    next(err);
  }
});

const changePasswordSchema = z.object({
  current_password: z.string().min(1),
  new_password: z.string().min(12),
});

// PUT /api/v1/auth/me/password — change password
router.put('/me/password', authenticate, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const body = changePasswordSchema.parse(req.body);

    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { passwordHash: true },
    });
    if (!user) throw new AuthenticationError('User not found');

    const isValid = await bcrypt.compare(body.current_password, user.passwordHash);
    if (!isValid) throw new ValidationError('Current password is incorrect');

    const newHash = await bcrypt.hash(body.new_password, 12);
    await prisma.user.update({
      where: { id: req.user!.userId },
      data: { passwordHash: newHash },
    });

    await logAudit({
      firmId: req.user!.firmId,
      userId: req.user!.userId,
      action: 'USER_PASSWORD_CHANGED',
      entityType: 'User',
      entityId: req.user!.userId,
      details: {},
      ipAddress: req.ip,
    });

    logger.info({ userId: req.user!.userId }, 'User password changed');
    successResponse(res, { message: 'Password changed successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/v1/auth/me/avatar — upload profile photo
router.post('/me/avatar', authenticate, upload.single('avatar'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!req.file) throw new ValidationError('No file uploaded');

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(req.file.mimetype)) {
      throw new ValidationError('File must be JPEG, PNG, or WebP');
    }

    const key = `avatars/${req.user!.userId}/${Date.now()}-${req.file.originalname}`;
    const storagePath = await fileStorage.store(key, req.file.buffer, req.file.mimetype);

    await logAudit({
      firmId: req.user!.firmId,
      userId: req.user!.userId,
      action: 'USER_AVATAR_UPLOADED',
      entityType: 'User',
      entityId: req.user!.userId,
      details: { storagePath },
      ipAddress: req.ip,
    });

    logger.info({ userId: req.user!.userId }, 'User avatar uploaded');
    successResponse(res, { avatarUrl: storagePath });
  } catch (err) {
    next(err);
  }
});

export { router as authRouter };
