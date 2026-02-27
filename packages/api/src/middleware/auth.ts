import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { UserRole } from '@prisma/client';
import { prisma } from '../utils/prisma';

export interface AuthUser {
  userId: string;
  firmId: string;
  email: string;
  role: UserRole;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export interface JwtPayload {
  userId: string;
  firmId: string;
  email: string;
  role: UserRole;
  name: string;
}

export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(new AuthenticationError('No token provided'));
  }

  const token = authHeader.substring(7);
  try {
    const payload = jwt.verify(token, config.JWT_SECRET) as JwtPayload;
    req.user = {
      userId: payload.userId,
      firmId: payload.firmId,
      email: payload.email,
      role: payload.role,
      name: payload.name,
    };
    next();
  } catch {
    next(new AuthenticationError('Invalid or expired token'));
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AuthenticationError());
    }
    if (!roles.includes(req.user.role)) {
      return next(new AuthorizationError(`Required roles: ${roles.join(', ')}`));
    }
    next();
  };
}

export function requireFirmAccess(req: Request, _res: Response, next: NextFunction): void {
  if (!req.user) return next(new AuthenticationError());
  const firmId = req.params.firmId;
  if (!firmId) return next();
  // ADMIN can access any firm
  if (req.user.role === 'ADMIN') return next();
  // Others can only access their own firm
  if (req.user.firmId !== firmId) {
    return next(new AuthorizationError('Access to this firm is not permitted'));
  }
  next();
}

export async function checkUserActive(req: Request, _res: Response, next: NextFunction): Promise<void> {
  if (!req.user) return next(new AuthenticationError());
  const user = await prisma.user.findUnique({
    where: { id: req.user.userId },
    select: { status: true, accessExpiresAt: true },
  });
  if (!user || user.status !== 'ACTIVE') {
    return next(new AuthenticationError('Account is disabled'));
  }
  if (user.accessExpiresAt && user.accessExpiresAt < new Date()) {
    return next(new AuthenticationError('Account access has expired'));
  }
  next();
}
