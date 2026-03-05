import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  getTokens, createToken, updateToken,
  getPegSnapshots, createPegSnapshot,
  getReserveAssets, createReserveAsset,
  getAttestations, generateAttestation,
  getStablecoinDashboard,
} from './service';

const router = Router();

const NETWORKS = ['ETHEREUM', 'BITCOIN', 'POLYGON', 'ARBITRUM', 'OPTIMISM', 'SOLANA', 'AVALANCHE', 'BSC', 'OTHER'] as const;

// ─── Stablecoin Dashboard ────────────────────────────────────────────────────

router.get('/:firmId/stablecoin/dashboard',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getStablecoinDashboard(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── Tokens ──────────────────────────────────────────────────────────────────

router.get('/:firmId/stablecoin/tokens',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { network, peg_status } = req.query as Record<string, string>;
      const result = await getTokens(req.params.firmId, { page, pageSize, network, pegStatus: peg_status });
      paginatedResponse(res, result.tokens, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/stablecoin/tokens',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        symbol: z.string().min(1).max(20),
        name: z.string().min(1).max(255),
        contractAddress: z.string().max(255).optional(),
        network: z.enum(NETWORKS),
        pegCurrency: z.string().length(3),
        pegTarget: z.number().positive().optional(),
        regime: z.enum(['MICA', 'GENIUS_ACT', 'UK_FCA', 'UNREGULATED', 'OTHER']).optional(),
        issuerName: z.string().max(255).optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const token = await createToken(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'STABLECOIN_TOKEN_CREATED',
        entityType: 'stablecoin_tokens', entityId: token.id,
        details: { symbol: body.symbol, network: body.network, pegCurrency: body.pegCurrency },
        ipAddress: req.ip,
      });

      successResponse(res, token, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/stablecoin/tokens/:tokenId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, tokenId } = req.params;
      const schema = z.object({
        currentPrice: z.number().positive().optional(),
        pegStatus: z.enum(['ON_PEG', 'MINOR_DEVIATION', 'MAJOR_DEVIATION', 'DEPEGGED']).optional(),
        totalSupply: z.string().optional(),
        circulatingSupply: z.string().optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const token = await updateToken(tokenId, firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'STABLECOIN_TOKEN_UPDATED',
        entityType: 'stablecoin_tokens', entityId: tokenId, details: body, ipAddress: req.ip,
      });

      successResponse(res, token);
    } catch (err) { next(err); }
  }
);

// ─── Peg Snapshots ───────────────────────────────────────────────────────────

router.get('/:firmId/stablecoin/peg-snapshots',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { token_id, peg_status } = req.query as Record<string, string>;
      const result = await getPegSnapshots(req.params.firmId, { page, pageSize, tokenId: token_id, pegStatus: peg_status });
      paginatedResponse(res, result.snapshots, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/stablecoin/peg-snapshots',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        tokenId: z.string().uuid(),
        price: z.number().positive(),
        snapshotAt: z.string(),
        totalSupply: z.string().optional(),
        marketCap: z.number().optional(),
        volume24h: z.number().optional(),
      });
      const body = schema.parse(req.body);
      const snapshot = await createPegSnapshot(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'PEG_SNAPSHOT_RECORDED',
        entityType: 'peg_snapshots', entityId: snapshot.id,
        details: { tokenId: body.tokenId, price: body.price },
        ipAddress: req.ip,
      });

      successResponse(res, snapshot, 201);
    } catch (err) { next(err); }
  }
);

// ─── Reserve Assets ──────────────────────────────────────────────────────────

router.get('/:firmId/stablecoin/reserve-assets',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { token_id, asset_type, status } = req.query as Record<string, string>;
      const result = await getReserveAssets(req.params.firmId, {
        page, pageSize, tokenId: token_id, assetType: asset_type, status,
      });
      paginatedResponse(res, result.assets, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/stablecoin/reserve-assets',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        tokenId: z.string().uuid(),
        assetType: z.enum(['CASH', 'TREASURY_BILL', 'GOVERNMENT_BOND', 'MONEY_MARKET_FUND', 'COMMERCIAL_PAPER', 'CERTIFICATE_OF_DEPOSIT', 'CRYPTO_COLLATERAL', 'OTHER']),
        description: z.string().min(1).max(500),
        custodian: z.string().max(255).optional(),
        faceValue: z.number().positive(),
        marketValue: z.number().optional(),
        currency: z.string().length(3),
        maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        isin: z.string().max(12).optional(),
        notes: z.string().max(5000).optional(),
        recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const asset = await createReserveAsset(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'RESERVE_ASSET_CREATED',
        entityType: 'reserve_assets', entityId: asset.id,
        details: { tokenId: body.tokenId, assetType: body.assetType, faceValue: body.faceValue },
        ipAddress: req.ip,
      });

      successResponse(res, asset, 201);
    } catch (err) { next(err); }
  }
);

// ─── Reserve Attestations ────────────────────────────────────────────────────

router.get('/:firmId/stablecoin/attestations',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { token_id } = req.query as Record<string, string>;
      const result = await getAttestations(req.params.firmId, { page, pageSize, tokenId: token_id });
      paginatedResponse(res, result.attestations, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/stablecoin/attestations/generate',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        tokenId: z.string().uuid(),
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const attestation = await generateAttestation(firmId, body.tokenId, body.snapshotDate, req.user!.userId);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'RESERVE_ATTESTATION_GENERATED',
        entityType: 'reserve_attestations', entityId: attestation.id,
        details: { tokenId: body.tokenId, snapshotDate: body.snapshotDate, coverageRatio: attestation.coverageRatio.toString() },
        ipAddress: req.ip,
      });

      successResponse(res, attestation, 201);
    } catch (err) { next(err); }
  }
);

export { router as stablecoinRouter };
