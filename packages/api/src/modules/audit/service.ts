import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../../utils/prisma';

export interface LogAuditParams {
  firmId?: string;
  userId?: string;
  action: string;
  entityType: string;
  entityId: string;
  details: Record<string, unknown>;
  ipAddress?: string;
}

function computeHash(previousHash: string, data: Record<string, unknown>): string {
  const payload = JSON.stringify({ previousHash, ...data });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    // Get the hash of the most recent audit log entry (global chain)
    const lastEntry = await prisma.auditLog.findFirst({
      where: { currentHash: { not: null } },
      orderBy: { createdAt: 'desc' },
      select: { currentHash: true },
    });

    const previousHash = lastEntry?.currentHash ?? '0'.repeat(64);

    const hashData = {
      firmId: params.firmId,
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: params.details,
      timestamp: new Date().toISOString(),
    };

    const currentHash = computeHash(previousHash, hashData);

    await prisma.auditLog.create({
      data: {
        firmId: params.firmId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details as unknown as Prisma.InputJsonValue,
        ipAddress: params.ipAddress,
        previousHash,
        currentHash,
      },
    });
  } catch (err) {
    // Never let audit logging failures crash the application
    console.error('Failed to write audit log:', err);
  }
}
