import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as OTPAuth from 'otpauth';
import QRCode from 'qrcode';
import { prisma } from '../../utils/prisma';
import { config } from '../../config';
import { encrypt, decrypt, generateSecureToken } from '../../utils/crypto';
import { logAudit } from '../audit/service';
import {
  AuthenticationError,
  ValidationError,
  ConflictError,
  NotFoundError,
} from '../../utils/errors';
import { UserRole } from '@prisma/client';
import { JwtPayload } from '../../middleware/auth';

const LOCK_DURATION_MS = 30 * 60 * 1000; // 30 minutes
const MAX_FAILED_ATTEMPTS = 5;

export interface LoginResult {
  mfa_required?: boolean;
  mfa_setup_required?: boolean;
  temp_token?: string;
  access_token?: string;
  refresh_token?: string;
  user?: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    firmId: string;
  };
}

function generateAccessToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any,
  });
}

function generateRefreshToken(payload: JwtPayload): string {
  return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
    expiresIn: config.JWT_REFRESH_EXPIRES_IN as any,
  });
}

function generateTempToken(userId: string, purpose: string): string {
  return jwt.sign({ userId, purpose }, config.JWT_SECRET, { expiresIn: '10m' });
}

export async function login(
  email: string,
  password: string,
  ipAddress?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    throw new AuthenticationError('Invalid email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw new AuthenticationError('Account is disabled');
  }

  if (user.accessExpiresAt && user.accessExpiresAt < new Date()) {
    throw new AuthenticationError('Account access has expired');
  }

  // Check lock
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    const remainingMs = user.lockedUntil.getTime() - Date.now();
    const remainingMin = Math.ceil(remainingMs / 60000);
    throw new AuthenticationError(`Account locked. Try again in ${remainingMin} minutes.`);
  }

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) {
    const failedCount = user.failedLoginCount + 1;
    const lockUpdate = failedCount >= MAX_FAILED_ATTEMPTS
      ? { failedLoginCount: failedCount, lockedUntil: new Date(Date.now() + LOCK_DURATION_MS) }
      : { failedLoginCount: failedCount };
    await prisma.user.update({ where: { id: user.id }, data: lockUpdate });
    await logAudit({
      firmId: user.firmId,
      userId: user.id,
      action: 'LOGIN_FAILED',
      entityType: 'users',
      entityId: user.id,
      details: { reason: 'invalid_password', failedCount },
      ipAddress,
    });
    throw new AuthenticationError('Invalid email or password');
  }

  // Reset failed count on successful password
  await prisma.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null },
  });

  const tempToken = generateTempToken(user.id, 'mfa');

  if (!user.mfaEnabled || !user.mfaSecret) {
    await logAudit({
      firmId: user.firmId,
      userId: user.id,
      action: 'LOGIN_PASSWORD_OK_MFA_SETUP_REQUIRED',
      entityType: 'users',
      entityId: user.id,
      details: { email: user.email },
      ipAddress,
    });
    return { mfa_setup_required: true, temp_token: tempToken };
  }

  await logAudit({
    firmId: user.firmId,
    userId: user.id,
    action: 'LOGIN_PASSWORD_OK_MFA_REQUIRED',
    entityType: 'users',
    entityId: user.id,
    details: { email: user.email },
    ipAddress,
  });
  return { mfa_required: true, temp_token: tempToken };
}

export async function setupMfa(
  userId: string
): Promise<{ secret: string; qrCodeDataUrl: string; otpauth_url: string }> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('User');

  // Reuse existing secret if one exists (prevents mismatch when user
  // already scanned a QR code from a previous setup attempt)
  let plainSecret: string;
  if (user.mfaSecret) {
    try {
      plainSecret = decrypt(user.mfaSecret);
    } catch {
      // Decryption failed (key changed?) — generate fresh secret
      plainSecret = new OTPAuth.Secret().base32;
      await prisma.user.update({
        where: { id: userId },
        data: { mfaSecret: encrypt(plainSecret) },
      });
    }
  } else {
    plainSecret = new OTPAuth.Secret().base32;
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: encrypt(plainSecret) },
    });
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Safeheld',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(plainSecret),
  });

  const otpAuthUrl = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

  return {
    secret: plainSecret,
    qrCodeDataUrl,
    otpauth_url: otpAuthUrl,
  };
}

export async function verifyMfaAndIssueTokens(
  userId: string,
  totpCode: string,
  ipAddress?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaSecret) throw new AuthenticationError('MFA not configured');

  let plainSecret: string;
  try {
    plainSecret = decrypt(user.mfaSecret);
  } catch (err) {
    console.error(`[MFA] Decryption failed for user ${user.email}:`, err);
    throw new AuthenticationError('MFA verification failed — please contact admin to reset MFA');
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Safeheld',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(plainSecret),
  });

  const delta = totp.validate({ token: totpCode, window: 2 });
  if (delta === null) {
    console.warn(`[MFA] Invalid code for ${user.email} (code=${totpCode}, expected=${totp.generate()})`);
    throw new AuthenticationError('Invalid MFA code');
  }

  const payload: JwtPayload = {
    userId: user.id,
    firmId: user.firmId,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        token: refreshToken,
        expiresAt,
      },
    }),
    prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), mfaEnabled: true },
    }),
  ]);

  await logAudit({
    firmId: user.firmId,
    userId: user.id,
    action: 'LOGIN_SUCCESS',
    entityType: 'users',
    entityId: user.id,
    details: { email: user.email },
    ipAddress,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      firmId: user.firmId,
    },
  };
}

export async function confirmMfaSetup(
  userId: string,
  totpCode: string,
  ipAddress?: string
): Promise<LoginResult> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || !user.mfaSecret) throw new AuthenticationError('MFA setup not initiated');

  let plainSecret: string;
  try {
    plainSecret = decrypt(user.mfaSecret);
  } catch (err) {
    console.error(`[MFA] Decryption failed for user ${user.email}:`, err);
    throw new AuthenticationError('MFA verification failed — please contact admin to reset MFA');
  }

  const totp = new OTPAuth.TOTP({
    issuer: 'Safeheld',
    label: user.email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(plainSecret),
  });

  const delta = totp.validate({ token: totpCode, window: 2 });
  if (delta === null) {
    console.warn(`[MFA] Invalid code for ${user.email} during setup confirmation (code=${totpCode}, expected=${totp.generate()})`);
    throw new AuthenticationError('Invalid MFA code — please check your authenticator app');
  }

  const payload: JwtPayload = {
    userId: user.id,
    firmId: user.firmId,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);

  await Promise.all([
    prisma.user.update({ where: { id: user.id }, data: { mfaEnabled: true, lastLoginAt: new Date() } }),
    prisma.refreshToken.create({ data: { userId: user.id, token: refreshToken, expiresAt } }),
  ]);

  await logAudit({
    firmId: user.firmId,
    userId: user.id,
    action: 'MFA_SETUP_COMPLETE',
    entityType: 'users',
    entityId: user.id,
    details: { email: user.email },
    ipAddress,
  });

  return {
    access_token: accessToken,
    refresh_token: refreshToken,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      firmId: user.firmId,
    },
  };
}

export async function refreshAccessToken(refreshToken: string): Promise<{ access_token: string }> {
  const storedToken = await prisma.refreshToken.findUnique({
    where: { token: refreshToken },
    include: { user: true },
  });

  if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
    throw new AuthenticationError('Invalid or expired refresh token');
  }

  const user = storedToken.user;
  if (user.status !== 'ACTIVE') {
    throw new AuthenticationError('Account is disabled');
  }

  const payload: JwtPayload = {
    userId: user.id,
    firmId: user.firmId,
    email: user.email,
    role: user.role,
    name: user.name,
  };

  const accessToken = generateAccessToken(payload);
  return { access_token: accessToken };
}

export async function logout(refreshToken: string, userId: string, ipAddress?: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { token: refreshToken, userId },
    data: { revokedAt: new Date() },
  });
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { firmId: true } });
  await logAudit({
    firmId: user?.firmId,
    userId,
    action: 'LOGOUT',
    entityType: 'users',
    entityId: userId,
    details: {},
    ipAddress,
  });
}

export interface CreateUserParams {
  firmId: string;
  email: string;
  password: string;
  role: UserRole;
  name: string;
  accessExpiresAt?: Date;
}

export async function createUser(params: CreateUserParams, createdById: string): Promise<object> {
  // Validate password policy
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]).{12,}$/;
  if (!passwordRegex.test(params.password)) {
    throw new ValidationError(
      'Password must be at least 12 characters and include uppercase, lowercase, number, and special character'
    );
  }

  const existing = await prisma.user.findUnique({ where: { email: params.email } });
  if (existing) throw new ConflictError('Email address already registered');

  if ((params.role === 'AUDITOR' || params.role === 'BANK_VIEWER') && !params.accessExpiresAt) {
    throw new ValidationError(`${params.role} accounts must have an access expiry date`);
  }

  const passwordHash = await bcrypt.hash(params.password, config.BCRYPT_ROUNDS);
  const user = await prisma.user.create({
    data: {
      firmId: params.firmId,
      email: params.email,
      passwordHash,
      role: params.role,
      name: params.name,
      accessExpiresAt: params.accessExpiresAt,
    },
    select: { id: true, email: true, name: true, role: true, firmId: true, createdAt: true },
  });

  await logAudit({
    firmId: params.firmId,
    userId: createdById,
    action: 'USER_CREATED',
    entityType: 'users',
    entityId: user.id,
    details: { email: user.email, role: user.role, name: user.name },
  });

  return user;
}
