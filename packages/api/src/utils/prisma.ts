import { Prisma, PrismaClient } from '@prisma/client';
import { logger } from './logger';

type PrismaWithEvents = PrismaClient<
  { log: [{ level: 'warn'; emit: 'event' }, { level: 'error'; emit: 'event' }] },
  'warn' | 'error'
>;

const globalForPrisma = globalThis as unknown as { prisma: PrismaWithEvents };

export const prisma: PrismaWithEvents =
  globalForPrisma.prisma ||
  new PrismaClient({
    log: [
      { level: 'warn', emit: 'event' },
      { level: 'error', emit: 'event' },
    ],
  }) as PrismaWithEvents;

prisma.$on('warn', (e: Prisma.LogEvent) => logger.warn({ msg: e.message }, 'Prisma warning'));
prisma.$on('error', (e: Prisma.LogEvent) => logger.error({ msg: e.message }, 'Prisma error'));

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
