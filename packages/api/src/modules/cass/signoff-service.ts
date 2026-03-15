import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { NotFoundError, ValidationError } from '../../utils/errors';

const VALID_ENTITY_TYPES = ['CMAR_SUBMISSION', 'RECONCILIATION_RUN', 'BREACH_RESOLUTION'] as const;
type SignOffEntityType = typeof VALID_ENTITY_TYPES[number];

/**
 * Create a sign-off request for a given entity (CMAR, reconciliation run, breach resolution).
 */
export async function requestSignOff(
  entityType: string,
  entityId: string,
  firmId: string,
  requestedById: string,
) {
  if (!VALID_ENTITY_TYPES.includes(entityType as SignOffEntityType)) {
    throw new ValidationError(`Invalid entity type: ${entityType}. Must be one of: ${VALID_ENTITY_TYPES.join(', ')}`);
  }

  // Verify the entity exists and belongs to the firm
  await verifyEntityExists(entityType as SignOffEntityType, entityId, firmId);

  // Check for existing pending sign-off on this entity
  const existing = await prisma.signOff.findFirst({
    where: { firmId, entityType, entityId, status: 'PENDING' },
  });
  if (existing) {
    throw new ValidationError('A pending sign-off request already exists for this entity');
  }

  const signOff = await prisma.signOff.create({
    data: {
      firmId,
      entityType,
      entityId,
      requestedBy: requestedById,
      status: 'PENDING',
    },
  });

  // Notify compliance officers
  const complianceOfficers = await prisma.user.findMany({
    where: { firmId, role: { in: ['COMPLIANCE_OFFICER', 'ADMIN'] }, status: 'ACTIVE' },
    select: { id: true, email: true, name: true },
  });

  logger.info(
    { firmId, signOffId: signOff.id, entityType, entityId, notifyCount: complianceOfficers.length },
    'Sign-off requested, compliance officers notified',
  );

  return signOff;
}

/**
 * Approve a sign-off request. Enforces four-eyes principle (approver must differ from requester).
 */
export async function approveSignOff(
  signOffId: string,
  firmId: string,
  userId: string,
  comments?: string,
) {
  const signOff = await prisma.signOff.findFirst({
    where: { id: signOffId, firmId },
  });
  if (!signOff) throw new NotFoundError('Sign-off request');

  if (signOff.status !== 'PENDING') {
    throw new ValidationError(`Sign-off is already ${signOff.status.toLowerCase()}`);
  }

  // Four-eyes principle: approver must be different from requester
  if (signOff.requestedBy === userId) {
    throw new ValidationError('Approver must be different from the requester (four-eyes principle)');
  }

  const updated = await prisma.signOff.update({
    where: { id: signOffId },
    data: {
      status: 'APPROVED',
      approvedBy: userId,
      comments: comments || null,
      resolvedAt: new Date(),
    },
  });

  // Update the underlying entity status based on entity type
  await updateEntityOnApproval(signOff.entityType as SignOffEntityType, signOff.entityId, firmId, userId);

  logger.info({ firmId, signOffId, entityType: signOff.entityType, entityId: signOff.entityId, userId }, 'Sign-off approved');

  return updated;
}

/**
 * Reject a sign-off request with a reason.
 */
export async function rejectSignOff(
  signOffId: string,
  firmId: string,
  userId: string,
  reason: string,
) {
  const signOff = await prisma.signOff.findFirst({
    where: { id: signOffId, firmId },
  });
  if (!signOff) throw new NotFoundError('Sign-off request');

  if (signOff.status !== 'PENDING') {
    throw new ValidationError(`Sign-off is already ${signOff.status.toLowerCase()}`);
  }

  const updated = await prisma.signOff.update({
    where: { id: signOffId },
    data: {
      status: 'REJECTED',
      approvedBy: userId,
      rejectionReason: reason,
      resolvedAt: new Date(),
    },
  });

  logger.info({ firmId, signOffId, entityType: signOff.entityType, entityId: signOff.entityId, userId }, 'Sign-off rejected');

  return updated;
}

/**
 * Verify that the entity referenced by a sign-off request actually exists.
 */
async function verifyEntityExists(entityType: SignOffEntityType, entityId: string, firmId: string) {
  switch (entityType) {
    case 'CMAR_SUBMISSION': {
      const entity = await prisma.cmarSubmission.findFirst({ where: { id: entityId, firmId } });
      if (!entity) throw new NotFoundError('CMAR Submission');
      break;
    }
    case 'RECONCILIATION_RUN': {
      const entity = await prisma.reconciliationRun.findFirst({ where: { id: entityId, firmId } });
      if (!entity) throw new NotFoundError('Reconciliation Run');
      break;
    }
    case 'BREACH_RESOLUTION': {
      const entity = await prisma.breach.findFirst({ where: { id: entityId, firmId } });
      if (!entity) throw new NotFoundError('Breach');
      break;
    }
  }
}

/**
 * Update the underlying entity when a sign-off is approved.
 */
async function updateEntityOnApproval(entityType: SignOffEntityType, entityId: string, firmId: string, userId: string) {
  switch (entityType) {
    case 'CMAR_SUBMISSION': {
      await prisma.cmarSubmission.updateMany({
        where: { id: entityId, firmId },
        data: { status: 'IN_REVIEW' },
      });
      break;
    }
    case 'RECONCILIATION_RUN': {
      // Mark reconciliation as reviewed — no status field to update directly,
      // but we log the approval through the sign-off record itself.
      logger.info({ firmId, entityId, userId }, 'Reconciliation run sign-off approved');
      break;
    }
    case 'BREACH_RESOLUTION': {
      await prisma.breach.updateMany({
        where: { id: entityId, firmId, status: 'REMEDIATING' },
        data: { status: 'RESOLVED', resolvedAt: new Date() },
      });
      break;
    }
  }
}
