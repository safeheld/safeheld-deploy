import { vi } from 'vitest';

// ─── Mock @prisma/client enums (Prisma client may not be generated in CI) ────
vi.mock('@prisma/client', async () => {
  const actual = await vi.importActual('@prisma/client').catch(() => ({})) as any;
  // If the real enums are already defined (prisma generate has run), use them.
  // Otherwise, provide string-literal stand-ins so tests don't crash.
  const def = <T extends Record<string, string>>(real: unknown, fallback: T): T =>
    (real && typeof real === 'object' ? real : fallback) as T;

  return {
    ...actual,
    ReconciliationTrigger: def(actual.ReconciliationTrigger, {
      MANUAL: 'MANUAL', SCHEDULED: 'SCHEDULED', UPLOAD: 'UPLOAD',
    }),
    ReconciliationStatus: def(actual.ReconciliationStatus, {
      MATCHED: 'MATCHED', BREAK: 'BREAK', IN_PROGRESS: 'IN_PROGRESS', FAILED: 'FAILED',
    }),
    ReconciliationType: def(actual.ReconciliationType, {
      INTERNAL: 'INTERNAL', EXTERNAL: 'EXTERNAL',
    }),
    BreachStatus: def(actual.BreachStatus, {
      DETECTED: 'DETECTED', ACKNOWLEDGED: 'ACKNOWLEDGED',
      REMEDIATING: 'REMEDIATING', RESOLVED: 'RESOLVED', CLOSED: 'CLOSED',
    }),
    BreachSeverity: def(actual.BreachSeverity, {
      LOW: 'LOW', MEDIUM: 'MEDIUM', HIGH: 'HIGH', CRITICAL: 'CRITICAL',
    }),
    BreachType: def(actual.BreachType, {
      SHORTFALL: 'SHORTFALL', EXTERNAL_BREAK: 'EXTERNAL_BREAK',
      GOVERNANCE: 'GOVERNANCE', NOTIFICATION: 'NOTIFICATION',
    }),
    UserRole: def(actual.UserRole, {
      SUPER_ADMIN: 'SUPER_ADMIN', FIRM_ADMIN: 'FIRM_ADMIN',
      COMPLIANCE_OFFICER: 'COMPLIANCE_OFFICER', AUDITOR: 'AUDITOR', READ_ONLY: 'READ_ONLY',
    }),
    Prisma: actual.Prisma ?? {},
  };
});

// ─── Mock config (prevents process.exit on missing env vars) ─────────────────
vi.mock('../config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3001,
    LOG_LEVEL: 'error',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    REDIS_URL: 'redis://localhost:6379',
    JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars!!',
    JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-32chars!!',
    JWT_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '24h',
    MFA_ENCRYPTION_KEY: 'test-mfa-encryption-key-32chars!!',
    FILE_STORAGE_TYPE: 'local',
    S3_BUCKET: 'safeheld-uploads',
    S3_REPORTS_BUCKET: 'safeheld-reports',
    S3_DOCUMENTS_BUCKET: 'safeheld-documents',
    S3_ACCESS_KEY: '',
    S3_SECRET_KEY: '',
    S3_REGION: 'us-east-1',
    S3_FORCE_PATH_STYLE: false,
    SMTP_HOST: '',
    SMTP_PORT: 587,
    SMTP_USER: '',
    SMTP_PASSWORD: '',
    SMTP_FROM_EMAIL: 'noreply@safeheld.io',
    SMTP_FROM_NAME: 'Safeheld',
    FRONTEND_URL: 'http://localhost:5173',
    BCRYPT_ROUNDS: 12,
    DEFAULT_PAGE_SIZE: 50,
    MAX_PAGE_SIZE: 200,
    RATE_LIMIT_AUTH: 10,
    RATE_LIMIT_UPLOAD: 20,
    RATE_LIMIT_GENERAL: 100,
  },
}));

// ─── Mock Prisma client
vi.mock('../utils/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    refreshToken: {
      create: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    firm: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    reconciliationRun: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    reconciliationBreak: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    breach: {
      create: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
    },
    clientBalance: { groupBy: vi.fn() },
    safeguardingLedgerBalance: { groupBy: vi.fn(), create: vi.fn() },
    bankBalance: { groupBy: vi.fn(), create: vi.fn() },
    rulePack: { findFirst: vi.fn() },
    safeguardingAccount: { findMany: vi.fn(), findFirst: vi.fn() },
    auditLog: { create: vi.fn(), findMany: vi.fn(), count: vi.fn() },
    fcaNotification: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    acknowledgementLetter: { findMany: vi.fn(), updateMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    policyDocument: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    thirdPartyDueDiligence: { findMany: vi.fn(), create: vi.fn() },
    responsibilityAssignment: { findMany: vi.fn(), create: vi.fn() },
    insuranceGuarantee: { findMany: vi.fn() },
    emailLog: { create: vi.fn() },
    resolutionPackHealthCheck: { findFirst: vi.fn(), create: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

// Mock Redis
vi.mock('../utils/redis', () => ({
  redis: { ping: vi.fn().mockResolvedValue('PONG') },
}));

// Mock email
vi.mock('../utils/email', () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  breachDetectedEmail: vi.fn().mockReturnValue('<html>test</html>'),
}));

// Mock file storage
vi.mock('../utils/fileStorage', () => ({
  fileStorage: {
    store: vi.fn().mockResolvedValue('s3://bucket/test-key'),
    get: vi.fn().mockResolvedValue(Buffer.from('test')),
    getSignedDownloadUrl: vi.fn().mockResolvedValue('https://example.com/download'),
    delete: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock logger
vi.mock('../utils/logger', () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  },
}));
