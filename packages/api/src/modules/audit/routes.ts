import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../../utils/prisma';
import { authenticate, requireRole } from '../../middleware/auth';
import { getPaginationParams, paginatedResponse, successResponse } from '../../utils/response';
import { stringify } from 'csv-stringify';

const router = Router();

// GET /api/v1/admin/audit-log
router.get('/', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
    const { firmId, userId, action, entityType, from, to } = req.query as Record<string, string>;

    const where: Record<string, unknown> = {};
    if (firmId) where.firmId = firmId;
    if (userId) where.userId = userId;
    if (action) where.action = action;
    if (entityType) where.entityType = entityType;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: pageSize,
        include: {
          user: { select: { name: true, email: true } },
          firm: { select: { name: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    paginatedResponse(res, logs, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
  } catch (err) {
    next(err);
  }
});

// GET /api/v1/admin/audit-log/export
router.get('/export', authenticate, requireRole('ADMIN'), async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { firmId, from, to } = req.query as Record<string, string>;
    const where: Record<string, unknown> = {};
    if (firmId) where.firmId = firmId;
    if (from || to) {
      where.createdAt = {};
      if (from) (where.createdAt as Record<string, Date>).gte = new Date(from);
      if (to) (where.createdAt as Record<string, Date>).lte = new Date(to);
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="audit-log.csv"');

    const stringifier = stringify({
      header: true,
      columns: ['id', 'firmId', 'userId', 'action', 'entityType', 'entityId', 'ipAddress', 'createdAt'],
    });
    stringifier.pipe(res);

    const batchSize = 1000;
    let skip = 0;
    while (true) {
      const records = await prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: batchSize,
      });
      if (records.length === 0) break;
      for (const record of records) {
        stringifier.write(record);
      }
      skip += batchSize;
      if (records.length < batchSize) break;
    }
    stringifier.end();
  } catch (err) {
    next(err);
  }
});

export { router as auditRouter };
