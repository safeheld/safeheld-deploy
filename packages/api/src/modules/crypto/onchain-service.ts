import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { getOnChainBalance } from '../../utils/blockchain';
import { Prisma } from '@prisma/client';

// ─── Sync Wallet Balances ───────────────────────────────────────────────────

export interface SyncResult {
  synced: number;
  failed: number;
  skipped: number;
  wallets: Array<{
    walletId: string;
    walletName: string;
    network: string;
    address: string;
    balance: string | null;
    blockNumber: number | null;
    status: 'synced' | 'failed' | 'skipped';
    error?: string;
  }>;
}

/**
 * For each active wallet belonging to the firm, query on-chain native balance
 * and create a WalletBalance snapshot with today's date.
 */
export async function syncWalletBalances(firmId: string): Promise<SyncResult> {
  const wallets = await prisma.wallet.findMany({
    where: { firmId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
  });

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const result: SyncResult = { synced: 0, failed: 0, skipped: 0, wallets: [] };

  // Process wallets sequentially to avoid rate-limiting from public RPCs
  for (const wallet of wallets) {
    const network = wallet.network;

    // Skip unsupported networks
    if (network === 'OTHER') {
      result.skipped++;
      result.wallets.push({
        walletId: wallet.id,
        walletName: wallet.walletName,
        network,
        address: wallet.address,
        balance: null,
        blockNumber: null,
        status: 'skipped',
        error: 'Network type OTHER is not supported for on-chain queries',
      });
      continue;
    }

    try {
      const onChain = await getOnChainBalance(network, wallet.address);

      if (!onChain) {
        result.failed++;
        result.wallets.push({
          walletId: wallet.id,
          walletName: wallet.walletName,
          network,
          address: wallet.address,
          balance: null,
          blockNumber: null,
          status: 'failed',
          error: 'On-chain query returned no result',
        });
        continue;
      }

      // Determine native token symbol based on network
      const tokenSymbol = getNativeTokenSymbol(network);

      await prisma.walletBalance.create({
        data: {
          firmId,
          walletId: wallet.id,
          tokenSymbol,
          tokenName: getNativeTokenName(network),
          balance: onChain.balance,
          snapshotDate: today,
          blockNumber: onChain.blockNumber ? BigInt(onChain.blockNumber) : null,
        },
      });

      result.synced++;
      result.wallets.push({
        walletId: wallet.id,
        walletName: wallet.walletName,
        network,
        address: wallet.address,
        balance: onChain.balance,
        blockNumber: onChain.blockNumber ?? null,
        status: 'synced',
      });

      logger.info(
        { walletId: wallet.id, network, balance: onChain.balance },
        'Wallet balance synced from on-chain',
      );
    } catch (err) {
      result.failed++;
      const message = err instanceof Error ? err.message : 'Unknown error';
      result.wallets.push({
        walletId: wallet.id,
        walletName: wallet.walletName,
        network,
        address: wallet.address,
        balance: null,
        blockNumber: null,
        status: 'failed',
        error: message,
      });
      logger.error({ err, walletId: wallet.id }, 'Failed to sync wallet balance');
    }
  }

  // Log data lineage event for the sync
  await prisma.dataLineageEvent.create({
    data: {
      firmId,
      eventType: 'INGESTION',
      sourceSystem: 'on-chain-sync',
      entityType: 'wallet_balances',
      entityId: firmId,
      recordCount: result.synced,
      metadata: {
        synced: result.synced,
        failed: result.failed,
        skipped: result.skipped,
        syncDate: today.toISOString(),
      },
    },
  });

  return result;
}

// ─── Reconcile Wallet Balances ──────────────────────────────────────────────

export interface ReconciliationResult {
  snapshotDate: string;
  totalReservesNative: Record<string, string>;
  totalEntitlements: Record<string, string>;
  reserveRatios: Record<string, number>;
  isFullyCollateralized: boolean;
  underCollateralized: string[];
  walletBreakdown: Array<{
    walletId: string;
    walletName: string;
    network: string;
    tokenSymbol: string;
    balance: string;
  }>;
}

/**
 * Compare latest on-chain wallet balances against client entitlements.
 * Calculates reserve ratio per token and flags under-collateralized tokens.
 */
export async function reconcileWalletBalances(firmId: string): Promise<ReconciliationResult> {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const snapshotDate = today.toISOString().slice(0, 10);

  // Get the latest balance per wallet (most recent snapshot date)
  const latestBalances = await prisma.$queryRaw<Array<{
    wallet_id: string;
    wallet_name: string;
    network: string;
    token_symbol: string;
    balance: string;
    snapshot_date: Date;
  }>>`
    SELECT DISTINCT ON (wb.wallet_id, wb.token_symbol)
      wb.wallet_id,
      w.wallet_name,
      w.network::text as network,
      wb.token_symbol,
      wb.balance::text as balance,
      wb.snapshot_date
    FROM wallet_balances wb
    JOIN wallets w ON w.id = wb.wallet_id
    WHERE wb.firm_id = ${firmId}::uuid
      AND w.status = 'ACTIVE'
    ORDER BY wb.wallet_id, wb.token_symbol, wb.snapshot_date DESC
  `;

  // Get latest entitlements per client/token
  const latestEntitlements = await prisma.$queryRaw<Array<{
    token_symbol: string;
    total_entitled: string;
  }>>`
    SELECT
      ce.token_symbol,
      SUM(ce.entitled_balance)::text as total_entitled
    FROM (
      SELECT DISTINCT ON (client_id, token_symbol)
        client_id, token_symbol, entitled_balance
      FROM client_entitlements
      WHERE firm_id = ${firmId}::uuid
      ORDER BY client_id, token_symbol, record_date DESC
    ) ce
    GROUP BY ce.token_symbol
  `;

  // Aggregate reserves by token
  const totalReservesNative: Record<string, string> = {};
  const reservesByToken: Record<string, number> = {};

  for (const row of latestBalances) {
    const sym = row.token_symbol;
    const bal = parseFloat(row.balance);
    reservesByToken[sym] = (reservesByToken[sym] || 0) + bal;
  }

  for (const [sym, bal] of Object.entries(reservesByToken)) {
    totalReservesNative[sym] = bal.toString();
  }

  // Aggregate entitlements by token
  const totalEntitlements: Record<string, string> = {};
  const entitlementsByToken: Record<string, number> = {};

  for (const row of latestEntitlements) {
    const sym = row.token_symbol;
    const bal = parseFloat(row.total_entitled);
    entitlementsByToken[sym] = bal;
    totalEntitlements[sym] = row.total_entitled;
  }

  // Calculate reserve ratios
  const reserveRatios: Record<string, number> = {};
  const underCollateralized: string[] = [];
  const allTokens = new Set([...Object.keys(reservesByToken), ...Object.keys(entitlementsByToken)]);

  for (const token of allTokens) {
    const reserves = reservesByToken[token] || 0;
    const entitled = entitlementsByToken[token] || 0;

    if (entitled === 0) {
      reserveRatios[token] = reserves > 0 ? Infinity : 1;
    } else {
      const ratio = reserves / entitled;
      reserveRatios[token] = Math.round(ratio * 10000) / 10000; // 4 decimal places
      if (ratio < 1) {
        underCollateralized.push(token);
      }
    }
  }

  const walletBreakdown = latestBalances.map(row => ({
    walletId: row.wallet_id,
    walletName: row.wallet_name,
    network: row.network,
    tokenSymbol: row.token_symbol,
    balance: row.balance,
  }));

  // Log data lineage event
  await prisma.dataLineageEvent.create({
    data: {
      firmId,
      eventType: 'RECONCILIATION',
      sourceSystem: 'on-chain-reconciliation',
      entityType: 'crypto_reconciliation',
      entityId: firmId,
      recordCount: latestBalances.length,
      metadata: {
        snapshotDate,
        tokenCount: allTokens.size,
        underCollateralizedCount: underCollateralized.length,
        isFullyCollateralized: underCollateralized.length === 0,
      },
    },
  });

  return {
    snapshotDate,
    totalReservesNative,
    totalEntitlements,
    reserveRatios,
    isFullyCollateralized: underCollateralized.length === 0,
    underCollateralized,
    walletBreakdown,
  };
}

// ─── On-Chain Sync Status ───────────────────────────────────────────────────

export interface WalletSyncStatus {
  walletId: string;
  walletName: string;
  walletType: string;
  network: string;
  address: string;
  lastSyncDate: string | null;
  lastBalance: string | null;
  lastBlockNumber: string | null;
  lastTokenSymbol: string | null;
}

/**
 * Return the last sync status for each active wallet belonging to the firm.
 */
export async function getOnChainSyncStatus(firmId: string): Promise<WalletSyncStatus[]> {
  const wallets = await prisma.wallet.findMany({
    where: { firmId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    include: {
      balances: {
        orderBy: { snapshotDate: 'desc' },
        take: 1,
      },
    },
  });

  return wallets.map(w => {
    const latest = w.balances[0];
    return {
      walletId: w.id,
      walletName: w.walletName,
      walletType: w.walletType,
      network: w.network,
      address: w.address,
      lastSyncDate: latest?.snapshotDate?.toISOString().slice(0, 10) ?? null,
      lastBalance: latest?.balance?.toString() ?? null,
      lastBlockNumber: latest?.blockNumber?.toString() ?? null,
      lastTokenSymbol: latest?.tokenSymbol ?? null,
    };
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function getNativeTokenSymbol(network: string): string {
  const map: Record<string, string> = {
    ETHEREUM: 'ETH',
    POLYGON: 'MATIC',
    ARBITRUM: 'ETH',
    OPTIMISM: 'ETH',
    BSC: 'BNB',
    AVALANCHE: 'AVAX',
    BASE: 'ETH',
    BITCOIN: 'BTC',
    SOLANA: 'SOL',
  };
  return map[network.toUpperCase()] || 'UNKNOWN';
}

function getNativeTokenName(network: string): string {
  const map: Record<string, string> = {
    ETHEREUM: 'Ether',
    POLYGON: 'MATIC',
    ARBITRUM: 'Ether (Arbitrum)',
    OPTIMISM: 'Ether (Optimism)',
    BSC: 'BNB',
    AVALANCHE: 'Avalanche',
    BASE: 'Ether (Base)',
    BITCOIN: 'Bitcoin',
    SOLANA: 'Solana',
  };
  return map[network.toUpperCase()] || network;
}
