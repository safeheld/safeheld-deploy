import './instrument';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';
import * as Sentry from '@sentry/node';

import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './utils/prisma';
import { redis } from './utils/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';

import { authRouter } from './modules/auth/routes';
import { adminRouter } from './modules/admin/routes';
import { auditRouter } from './modules/audit/routes';
import { ingestionRouter } from './modules/ingestion/routes';
import { reconciliationRouter } from './modules/reconciliation/routes';
import { breachRouter } from './modules/breach/routes';
import { reportingRouter } from './modules/reporting/routes';
import { governanceRouter } from './modules/governance/routes';
import { monitoringRouter } from './modules/monitoring/routes';
import { bankDashboardRouter } from './modules/bank-dashboard/routes';
import { cassRouter } from './modules/cass/routes';
import { cryptoRouter } from './modules/crypto/routes';

// Ensure Bull queues are registered
import './modules/ingestion/queue';

const app = express();
const startTime = Date.now();

// ─── Reverse Proxy ───────────────────────────────────────────────────────────

app.set('trust proxy', 1);

// ─── Security ────────────────────────────────────────────────────────────────

app.use(helmet({
  contentSecurityPolicy: config.NODE_ENV === 'production' ? undefined : false,
}));

app.use(cors({
  origin: config.FRONTEND_URL,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ─── Rate Limiting ────────────────────────────────────────────────────────────

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.RATE_LIMIT_AUTH,
  standardHeaders: true,
  legacyHeaders: false,
  message: { status: 'error', error: { code: 'RATE_LIMITED', message: 'Too many requests. Please try again later.' } },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: config.RATE_LIMIT_UPLOAD,
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: config.RATE_LIMIT_GENERAL,
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Middleware ───────────────────────────────────────────────────────────────

app.use(pinoHttp({ logger }));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ─── Health Check ─────────────────────────────────────────────────────────────

app.get('/health', async (_req, res) => {
  res.set('Cache-Control', 'no-cache, no-store, must-revalidate');

  const services: Record<string, { status: string; latency?: number }> = {};

  // Check PostgreSQL
  try {
    const dbStart = Date.now();
    await Promise.race([
      prisma.$queryRawUnsafe('SELECT 1'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    services.database = { status: 'healthy', latency: Date.now() - dbStart };
  } catch {
    services.database = { status: 'unhealthy' };
  }

  // Check Redis
  try {
    const redisStart = Date.now();
    await Promise.race([
      redis.ping(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    services.redis = { status: 'healthy', latency: Date.now() - redisStart };
  } catch {
    services.redis = { status: 'unhealthy' };
  }

  const allHealthy = Object.values(services).every((s) => s.status === 'healthy');
  const status = allHealthy ? 'healthy' : 'degraded';
  const statusCode = allHealthy ? 200 : 503;

  res.status(statusCode).json({
    status,
    service: 'safeheld-api',
    services,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
  });
});

// ─── API Routes ───────────────────────────────────────────────────────────────

app.use('/api/v1/auth', authLimiter, authRouter);
app.use('/api/v1/admin', generalLimiter, adminRouter);
app.use('/api/v1/admin/audit-log', generalLimiter, auditRouter);
app.use('/api/v1/firms', uploadLimiter, ingestionRouter);
app.use('/api/v1/firms', generalLimiter, reconciliationRouter);
app.use('/api/v1/firms', generalLimiter, breachRouter);
app.use('/api/v1/firms', generalLimiter, reportingRouter);
app.use('/api/v1/firms', generalLimiter, governanceRouter);
app.use('/api/v1', generalLimiter, monitoringRouter);
app.use('/api/v1/firms', generalLimiter, cassRouter);
app.use('/api/v1/firms', generalLimiter, cryptoRouter);
app.use('/api/v1/bank-dashboard', generalLimiter, bankDashboardRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────

Sentry.setupExpressErrorHandler(app);
app.use(notFoundHandler);
app.use(errorHandler);

// ─── Start Server ─────────────────────────────────────────────────────────────

const server = app.listen(config.PORT, () => {
  logger.info({ port: config.PORT, env: config.NODE_ENV }, 'Safeheld API server started');
});

process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received — shutting down gracefully');
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled promise rejection');
});

export { app };
