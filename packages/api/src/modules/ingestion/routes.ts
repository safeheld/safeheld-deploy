import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { logAudit } from '../audit/service';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { ValidationError, NotFoundError, ConflictError } from '../../utils/errors';
import { InputType } from '@prisma/client';
import { parseCsv, autoMapColumns } from './csvParser';
import { validateSchema } from './validator';
import { uploadQueue } from './queue';
import { fileStorage } from '../../utils/fileStorage';

const router = Router();

const upload = multer({
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    const allowed = ['text/csv', 'application/csv', 'text/plain', 'application/octet-stream',
                     'application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV, PDF, and DOCX files are allowed'));
    }
  },
});

// POST /api/v1/firms/:firmId/uploads
router.post('/:firmId/uploads',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  upload.single('file'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!req.file) throw new ValidationError('No file uploaded');
      const { firmId } = req.params;
      const { input_type, mapping_config_id } = req.body as { input_type: string; mapping_config_id?: string };

      if (!input_type || !Object.values(InputType).includes(input_type as InputType)) {
        throw new ValidationError('Valid input_type is required');
      }

      const fileHash = crypto.createHash('sha256').update(req.file.buffer).digest('hex');

      // Duplicate detection
      const existing = await prisma.upload.findFirst({
        where: { firmId, fileHash },
      });
      if (existing) {
        throw new ConflictError(`This file has already been uploaded (upload ID: ${existing.id})`);
      }

      // Store the file
      const storagePath = await fileStorage.store(
        `firms/${firmId}/uploads/${Date.now()}_${req.file.originalname}`,
        req.file.buffer,
        req.file.mimetype
      );

      // Create upload record
      const uploadRecord = await prisma.upload.create({
        data: {
          firmId,
          userId: req.user!.userId,
          inputType: input_type as InputType,
          filename: req.file.originalname,
          fileHash,
          fileSizeBytes: req.file.size,
          status: 'PENDING',
          mappingConfigId: mapping_config_id || null,
          storagePath,
        },
      });

      // For CSV types — parse and return column mapping suggestion
      const csvInputTypes = ['CLIENT_BALANCES', 'CLIENT_TRANSACTIONS', 'SAFEGUARDING_LEDGER_BALANCES',
                             'BANK_BALANCES', 'BANK_TRANSACTIONS', 'ACCOUNT_REGISTER'];
      
      if (csvInputTypes.includes(input_type)) {
        try {
          const parsed = await parseCsv(req.file.buffer);
          const autoMapped = autoMapColumns(parsed.headers);
          
          // Check for existing mapping config
          const existingMapping = mapping_config_id
            ? await prisma.mappingConfig.findUnique({ where: { id: mapping_config_id } })
            : await prisma.mappingConfig.findUnique({ where: { firmId_inputType: { firmId, inputType: input_type as InputType } } });

          const suggestedMapping = existingMapping?.columnMappings as Record<string, string> || autoMapped;
          const schemaErrors = validateSchema(parsed.headers, input_type, suggestedMapping);

          await logAudit({
            firmId,
            userId: req.user!.userId,
            action: 'UPLOAD_DATA',
            entityType: 'uploads',
            entityId: uploadRecord.id,
            details: { inputType: input_type, filename: req.file.originalname, rowCount: parsed.rowCount },
            ipAddress: req.ip,
          });

          successResponse(res, {
            upload: uploadRecord,
            csv_preview: {
              headers: parsed.headers,
              sample_rows: parsed.rows.slice(0, 3),
              row_count: parsed.rowCount,
              delimiter: parsed.delimiter,
            },
            column_mapping: {
              suggested: suggestedMapping,
              auto_mapped: autoMapped,
              schema_errors: schemaErrors,
              existing_config: !!existingMapping,
            },
          }, 201);
          return;
        } catch (_parseErr) {
          // Return upload record but indicate parse preview failed
        }
      }

      await logAudit({
        firmId,
        userId: req.user!.userId,
        action: 'UPLOAD_DATA',
        entityType: 'uploads',
        entityId: uploadRecord.id,
        details: { inputType: input_type, filename: req.file.originalname },
        ipAddress: req.ip,
      });

      successResponse(res, { upload: uploadRecord }, 201);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/uploads/:uploadId/process
router.post('/:firmId/uploads/:uploadId/process',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, uploadId } = req.params;
      const { column_mappings, save_mapping } = req.body as {
        column_mappings: Record<string, string>;
        save_mapping?: boolean;
      };

      const uploadRecord = await prisma.upload.findFirst({
        where: { id: uploadId, firmId },
      });
      if (!uploadRecord) throw new NotFoundError('Upload');
      if (uploadRecord.status !== 'PENDING') {
        throw new ValidationError('Upload has already been processed');
      }

      if (save_mapping && column_mappings) {
        await prisma.mappingConfig.upsert({
          where: { firmId_inputType: { firmId, inputType: uploadRecord.inputType } },
          update: { columnMappings: column_mappings },
          create: {
            firmId,
            inputType: uploadRecord.inputType,
            columnMappings: column_mappings,
          },
        });
      }

      // Queue the validation job
      await uploadQueue.add('validate-upload', {
        uploadId: uploadRecord.id,
        firmId,
        columnMappings: column_mappings,
      }, {
        attempts: 2,
        backoff: { type: 'fixed', delay: 120000 },
      });

      await prisma.upload.update({
        where: { id: uploadId },
        data: { status: 'VALIDATING' },
      });

      successResponse(res, { message: 'Upload queued for processing', uploadId });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/uploads
router.get('/:firmId/uploads',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const { page, pageSize, skip } = getPaginationParams(req.query as Record<string, unknown>);
      const { input_type, status } = req.query as Record<string, string>;

      const where: Record<string, unknown> = { firmId };
      if (input_type) where.inputType = input_type;
      if (status) where.status = status;

      const [uploads, total] = await Promise.all([
        prisma.upload.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip,
          take: pageSize,
          include: { user: { select: { name: true, email: true } } },
        }),
        prisma.upload.count({ where }),
      ]);

      paginatedResponse(res, uploads, { page, pageSize, total, totalPages: Math.ceil(total / pageSize) });
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/uploads/:uploadId
router.get('/:firmId/uploads/:uploadId',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const upload = await prisma.upload.findFirst({
        where: { id: req.params.uploadId, firmId: req.params.firmId },
        include: { user: { select: { name: true, email: true } }, mappingConfig: true },
      });
      if (!upload) throw new NotFoundError('Upload');
      successResponse(res, upload);
    } catch (err) {
      next(err);
    }
  }
);

// POST /api/v1/firms/:firmId/mapping-configs
router.post('/:firmId/mapping-configs',
  authenticate,
  requireFirmAccess,
  requireRole('COMPLIANCE_OFFICER', 'FINANCE_OPS', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        inputType: z.nativeEnum(InputType),
        columnMappings: z.record(z.string()),
        hasHeaderRow: z.boolean().default(true),
      });
      const body = schema.parse(req.body);

      const config = await prisma.mappingConfig.upsert({
        where: { firmId_inputType: { firmId, inputType: body.inputType } },
        update: { columnMappings: body.columnMappings, hasHeaderRow: body.hasHeaderRow },
        create: { firmId, inputType: body.inputType, columnMappings: body.columnMappings, hasHeaderRow: body.hasHeaderRow },
      });

      successResponse(res, config, 201);
    } catch (err) {
      next(err);
    }
  }
);

// GET /api/v1/firms/:firmId/mapping-configs
router.get('/:firmId/mapping-configs',
  authenticate,
  requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const configs = await prisma.mappingConfig.findMany({
        where: { firmId: req.params.firmId },
      });
      successResponse(res, configs);
    } catch (err) {
      next(err);
    }
  }
);

export { router as ingestionRouter };
