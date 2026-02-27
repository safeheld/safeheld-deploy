import { z } from 'zod';
import dotenv from 'dotenv';
dotenv.config();

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  DATABASE_URL: z.string(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('24h'),
  MFA_ENCRYPTION_KEY: z.string().min(32),
  FILE_STORAGE_TYPE: z.enum(['s3', 'local']).default('s3'),
  S3_BUCKET: z.string().default('safeheld-uploads'),
  S3_REPORTS_BUCKET: z.string().default('safeheld-reports'),
  S3_DOCUMENTS_BUCKET: z.string().default('safeheld-documents'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_ENDPOINT: z.string().optional(),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_USER: z.string().default(''),
  SMTP_PASSWORD: z.string().default(''),
  SMTP_FROM_EMAIL: z.string().default('noreply@safeheld.io'),
  SMTP_FROM_NAME: z.string().default('Safeheld'),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  BCRYPT_ROUNDS: z.coerce.number().default(12),
  DEFAULT_PAGE_SIZE: z.coerce.number().default(50),
  MAX_PAGE_SIZE: z.coerce.number().default(200),
  RATE_LIMIT_AUTH: z.coerce.number().default(10),
  RATE_LIMIT_UPLOAD: z.coerce.number().default(20),
  RATE_LIMIT_GENERAL: z.coerce.number().default(100),
});

const parsed = configSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', parsed.error.format());
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof config;
