import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-jwt-secret-must-be-at-least-32-chars!!',
      JWT_REFRESH_SECRET: 'test-refresh-secret-must-be-32chars!!',
      JWT_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '24h',
      MFA_ENCRYPTION_KEY: 'test-mfa-encryption-key-32chars!!',
      FILE_STORAGE_TYPE: 'local',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/utils/prisma.ts', 'src/utils/redis.ts'],
    },
    setupFiles: ['./src/tests/setup.ts'],
  },
});
