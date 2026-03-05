import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authenticate, requireRole, requireFirmAccess } from '../../middleware/auth';
import { successResponse, paginatedResponse, getPaginationParams } from '../../utils/response';
import { logAudit } from '../audit/service';
import {
  getWallets, createWallet, updateWallet,
  getWalletBalances, createWalletBalance,
  getClientEntitlements, createClientEntitlement,
  getProofOfReserves, generateProofOfReserves,
  getDataLineage, getCryptoDashboard,
} from './service';

const router = Router();

const NETWORKS = ['ETHEREUM', 'BITCOIN', 'POLYGON', 'ARBITRUM', 'OPTIMISM', 'SOLANA', 'AVALANCHE', 'BSC', 'OTHER'] as const;

// ─── Crypto Dashboard ────────────────────────────────────────────────────────

router.get('/:firmId/crypto/dashboard',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const data = await getCryptoDashboard(req.params.firmId);
      successResponse(res, data);
    } catch (err) { next(err); }
  }
);

// ─── Wallets ─────────────────────────────────────────────────────────────────

router.get('/:firmId/crypto/wallets',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { wallet_type, network, status } = req.query as Record<string, string>;
      const result = await getWallets(req.params.firmId, { page, pageSize, walletType: wallet_type, network, status });
      paginatedResponse(res, result.wallets, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/crypto/wallets',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        walletName: z.string().min(1).max(255),
        walletType: z.enum(['HOT', 'COLD', 'WARM', 'CUSTODIAL', 'OMNIBUS']),
        network: z.enum(NETWORKS),
        address: z.string().min(1).max(255),
        custodian: z.string().max(255).optional(),
        isMultisig: z.boolean().optional(),
        requiredSignatures: z.number().int().positive().optional(),
        totalSignatories: z.number().int().positive().optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const wallet = await createWallet(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'WALLET_CREATED',
        entityType: 'wallets', entityId: wallet.id,
        details: { walletName: body.walletName, walletType: body.walletType, network: body.network },
        ipAddress: req.ip,
      });

      successResponse(res, wallet, 201);
    } catch (err) { next(err); }
  }
);

router.put('/:firmId/crypto/wallets/:walletId',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId, walletId } = req.params;
      const schema = z.object({
        status: z.enum(['ACTIVE', 'FROZEN', 'DECOMMISSIONED']).optional(),
        notes: z.string().max(5000).optional(),
      });
      const body = schema.parse(req.body);
      const wallet = await updateWallet(walletId, firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'WALLET_UPDATED',
        entityType: 'wallets', entityId: walletId, details: body, ipAddress: req.ip,
      });

      successResponse(res, wallet);
    } catch (err) { next(err); }
  }
);

// ─── Wallet Balances ─────────────────────────────────────────────────────────

router.get('/:firmId/crypto/balances',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { wallet_id, token_symbol, snapshot_date } = req.query as Record<string, string>;
      const result = await getWalletBalances(req.params.firmId, {
        page, pageSize, walletId: wallet_id, tokenSymbol: token_symbol, snapshotDate: snapshot_date,
      });
      // Serialize BigInt fields
      const serialized = result.balances.map(b => ({
        ...b,
        blockNumber: b.blockNumber?.toString() || null,
        balance: b.balance.toString(),
      }));
      paginatedResponse(res, serialized, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/crypto/balances',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        walletId: z.string().uuid(),
        tokenSymbol: z.string().min(1).max(20),
        tokenName: z.string().max(100).optional(),
        contractAddress: z.string().max(255).optional(),
        balance: z.string(),
        balanceUsd: z.number().optional(),
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        blockNumber: z.string().optional(),
      });
      const body = schema.parse(req.body);
      const bal = await createWalletBalance(firmId, body);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'WALLET_BALANCE_RECORDED',
        entityType: 'wallet_balances', entityId: bal.id,
        details: { walletId: body.walletId, tokenSymbol: body.tokenSymbol, snapshotDate: body.snapshotDate },
        ipAddress: req.ip,
      });

      successResponse(res, { ...bal, blockNumber: bal.blockNumber?.toString() || null, balance: bal.balance.toString() }, 201);
    } catch (err) { next(err); }
  }
);

// ─── Client Entitlements ─────────────────────────────────────────────────────

router.get('/:firmId/crypto/entitlements',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { client_id, token_symbol } = req.query as Record<string, string>;
      const result = await getClientEntitlements(req.params.firmId, {
        page, pageSize, clientId: client_id, tokenSymbol: token_symbol,
      });
      const serialized = result.entitlements.map(e => ({ ...e, entitledBalance: e.entitledBalance.toString() }));
      paginatedResponse(res, serialized, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/crypto/entitlements',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        clientId: z.string().min(1).max(100),
        clientName: z.string().max(255).optional(),
        tokenSymbol: z.string().min(1).max(20),
        entitledBalance: z.string(),
        entitledValueUsd: z.number().optional(),
        recordDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const ent = await createClientEntitlement(firmId, body);

      successResponse(res, { ...ent, entitledBalance: ent.entitledBalance.toString() }, 201);
    } catch (err) { next(err); }
  }
);

// ─── Proof of Reserves ───────────────────────────────────────────────────────

router.get('/:firmId/crypto/proof-of-reserves',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const result = await getProofOfReserves(req.params.firmId, { page, pageSize });
      paginatedResponse(res, result.proofs, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

router.post('/:firmId/crypto/proof-of-reserves/generate',
  authenticate, requireFirmAccess, requireRole('COMPLIANCE_OFFICER', 'ADMIN'),
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { firmId } = req.params;
      const schema = z.object({
        snapshotDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      });
      const body = schema.parse(req.body);
      const proof = await generateProofOfReserves(firmId, body.snapshotDate, req.user!.userId);

      await logAudit({
        firmId, userId: req.user!.userId, action: 'PROOF_OF_RESERVES_GENERATED',
        entityType: 'proof_of_reserves', entityId: proof.id,
        details: { snapshotDate: body.snapshotDate, reserveRatio: proof.reserveRatio.toString() },
        ipAddress: req.ip,
      });

      successResponse(res, proof, 201);
    } catch (err) { next(err); }
  }
);

// ─── Data Lineage ────────────────────────────────────────────────────────────

router.get('/:firmId/crypto/data-lineage',
  authenticate, requireFirmAccess,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { page, pageSize } = getPaginationParams(req.query as Record<string, unknown>);
      const { event_type, entity_type } = req.query as Record<string, string>;
      const result = await getDataLineage(req.params.firmId, {
        page, pageSize, eventType: event_type, entityType: entity_type,
      });
      paginatedResponse(res, result.events, {
        page: result.page, pageSize: result.pageSize, total: result.total, totalPages: result.totalPages,
      });
    } catch (err) { next(err); }
  }
);

export { router as cryptoRouter };
