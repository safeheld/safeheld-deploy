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

export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        firmId: params.firmId,
        userId: params.userId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        details: params.details as unknown as Prisma.InputJsonValue,
        ipAddress: params.ipAddress,
      },
    });
  } catch (err) {
    // Never let audit logging failures crash the application
    console.error('Failed to write audit log:', err);
  }
}
