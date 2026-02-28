import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import pinoHttp from 'pino-http';

import { config } from './config';
import { logger } from './utils/logger';
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

// Ensure Bull queues are registered
import './modules/ingestion/queue';

const app = express();

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

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'safeheld-api', timestamp: new Date().toISOString() });
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
app.use('/api/v1/bank-dashboard', generalLimiter, bankDashboardRouter);

// ─── Error Handling ───────────────────────────────────────────────────────────

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
