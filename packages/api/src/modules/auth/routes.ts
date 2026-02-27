import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
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
import { UserRole } from '@prisma/client';

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

export { router as authRouter };
