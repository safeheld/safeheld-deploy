import { describe, it, expect, vi, beforeEach } from 'vitest';
import { login } from '../modules/auth/service';
import { prisma } from '../utils/prisma';
import { AuthenticationError } from '../utils/errors';

// bcrypt is computationally expensive — mock it for unit tests
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash:    vi.fn().mockResolvedValue('$2a$12$hashed'),
    genSalt: vi.fn().mockResolvedValue('$2a$12$salt'),
  },
}));

// jwt mock — return predictable tokens
vi.mock('jsonwebtoken', () => ({
  default: {
    sign:   vi.fn().mockReturnValue('mock.jwt.token'),
    verify: vi.fn().mockReturnValue({ userId: 'user-001', purpose: 'mfa' }),
  },
}));

import bcrypt from 'bcryptjs';

const mockBcrypt = bcrypt as any;
const mockPrisma = prisma as any;

const activeUser = {
  id:               'user-001',
  email:            'user@example.com',
  name:             'Test User',
  passwordHash:     '$2a$12$hashed',
  status:           'ACTIVE',
  role:             'COMPLIANCE_OFFICER',
  firmId:           'firm-001',
  mfaEnabled:       false,
  mfaSecret:        null,
  failedLoginCount: 0,
  lockedUntil:      null,
  accessExpiresAt:  null,
};

// ─── login ──────────────────────────────────────────────────────────────────

describe('login', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.auditLog.create.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
  });

  it('throws AuthenticationError for unknown email', async () => {
    mockPrisma.user.findUnique.mockResolvedValue(null);

    await expect(login('nobody@example.com', 'password123')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError for disabled account', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, status: 'SUSPENDED' });

    await expect(login('user@example.com', 'password123')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError for expired access', async () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, accessExpiresAt: yesterday });

    await expect(login('user@example.com', 'password123')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError for locked account', async () => {
    const future = new Date(Date.now() + 20 * 60_000);
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, lockedUntil: future });

    await expect(login('user@example.com', 'password123')).rejects.toThrow(
      AuthenticationError,
    );
  });

  it('throws AuthenticationError for wrong password and increments fail count', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, failedLoginCount: 0 });
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(login('user@example.com', 'wrongpass')).rejects.toThrow(
      AuthenticationError,
    );

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ failedLoginCount: 1 }),
      }),
    );
  });

  it('locks account after max failed attempts', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      failedLoginCount: 4, // one more will hit limit of 5
    });
    mockBcrypt.compare.mockResolvedValue(false);

    await expect(login('user@example.com', 'wrongpass')).rejects.toThrow(AuthenticationError);

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginCount: 5,
          lockedUntil: expect.any(Date),
        }),
      }),
    );
  });

  it('returns mfa_setup_required when MFA not yet configured', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, mfaEnabled: false, mfaSecret: null });
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await login('user@example.com', 'correct-password');

    expect(result.mfa_setup_required).toBe(true);
    expect(result.temp_token).toBeDefined();
    expect(result.access_token).toBeUndefined();
  });

  it('returns mfa_required when MFA is enabled but not yet verified', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({
      ...activeUser,
      mfaEnabled: true,
      mfaSecret:  'ENCRYPTED_SECRET',
    });
    mockBcrypt.compare.mockResolvedValue(true);

    const result = await login('user@example.com', 'correct-password');

    expect(result.mfa_required).toBe(true);
    expect(result.temp_token).toBeDefined();
    expect(result.access_token).toBeUndefined();
  });

  it('resets failedLoginCount on successful password check', async () => {
    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser, failedLoginCount: 3 });
    mockBcrypt.compare.mockResolvedValue(true);

    await login('user@example.com', 'correct-password');

    expect(mockPrisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failedLoginCount: 0,
          lockedUntil: null,
        }),
      }),
    );
  });

  it('does not expose which field (email vs password) was wrong', async () => {
    // Both unknown email and wrong password should return the same generic message
    mockPrisma.user.findUnique.mockResolvedValue(null);
    const err1 = await login('nobody@x.com', 'pw').catch(e => e);

    mockPrisma.user.findUnique.mockResolvedValue({ ...activeUser });
    mockBcrypt.compare.mockResolvedValue(false);
    const err2 = await login('user@example.com', 'wrongpw').catch(e => e);

    expect(err1.message).toBe(err2.message);
  });
});
