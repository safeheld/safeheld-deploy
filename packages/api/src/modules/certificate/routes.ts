import { Router, Request, Response, NextFunction } from 'express';
import { authenticate, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { NotFoundError } from '../../utils/errors';
import { verifyCertificate, getCertificatesForFirm } from './service';

const router = Router();

// GET /api/v1/certificates/:identifier/verify — PUBLIC, no auth required
// Regulators can verify any certificate by ID or SHA-256 hash
router.get('/:identifier/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { identifier } = req.params;
    const result = await verifyCertificate(identifier);

    if (!result) {
      throw new NotFoundError('Certificate not found. The provided ID or hash does not match any issued certificate.');
    }

    successResponse(res, result);
  } catch (err) {
    next(err);
  }
});

export { router as certificateRouter };

// Firm-scoped certificate list (authenticated)
const firmRouter = Router();

// GET /api/v1/firms/:firmId/certificates
firmRouter.get('/:firmId/certificates',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const result = await getCertificatesForFirm(firmId, { page, pageSize });
      paginatedResponse(res, result.certificates, {
        page: result.page,
        pageSize: result.pageSize,
        total: result.total,
        totalPages: result.totalPages,
      });
    } catch (err) {
      next(err);
    }
  }
);

export { firmRouter as certificateFirmRouter };
