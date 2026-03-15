import { logger } from './logger';

// ─── RPC Endpoints (public, no API key required) ────────────────────────────

const RPC_URLS: Record<string, string> = {
  ETHEREUM: 'https://eth.llamarpc.com',
  POLYGON: 'https://polygon-rpc.com',
  ARBITRUM: 'https://arb1.arbitrum.io/rpc',
  OPTIMISM: 'https://mainnet.optimism.io',
  BSC: 'https://bsc-dataseed.binance.org',
  AVALANCHE: 'https://api.avax.network/ext/bc/C/rpc',
  BASE: 'https://mainnet.base.org',
  SOLANA: 'https://api.mainnet-beta.solana.com',
};

const BITCOIN_API = 'https://blockchain.info/balance?active=';

const TIMEOUT_MS = 10_000;

export interface OnChainBalanceResult {
  balance: string;
  blockNumber?: number;
}

/**
 * Query the native balance of an address on a given blockchain network.
 * Returns null if the query fails for any reason.
 */
export async function getOnChainBalance(
  network: string,
  address: string,
): Promise<OnChainBalanceResult | null> {
  try {
    const upperNetwork = network.toUpperCase();

    if (upperNetwork === 'BITCOIN') {
      return await getBitcoinBalance(address);
    }

    if (upperNetwork === 'SOLANA') {
      return await getSolanaBalance(address);
    }

    // EVM chains
    const rpcUrl = RPC_URLS[upperNetwork];
    if (!rpcUrl) {
      logger.warn({ network }, 'Unsupported network for on-chain balance query');
      return null;
    }

    return await getEvmBalance(rpcUrl, address);
  } catch (err) {
    logger.error({ err, network, address }, 'Failed to query on-chain balance');
    return null;
  }
}

// ─── EVM (Ethereum + L2s) ───────────────────────────────────────────────────

async function getEvmBalance(rpcUrl: string, address: string): Promise<OnChainBalanceResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    // Batch: eth_getBalance + eth_blockNumber in one request
    const body = JSON.stringify([
      { jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] },
      { jsonrpc: '2.0', id: 2, method: 'eth_blockNumber', params: [] },
    ]);

    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ rpcUrl, status: res.status }, 'EVM RPC returned non-OK status');
      return null;
    }

    const json = await res.json() as any[];

    // Some RPCs don't support batching — fall back to individual calls
    if (!Array.isArray(json)) {
      return await getEvmBalanceSingle(rpcUrl, address);
    }

    const balanceResult = json.find((r: any) => r.id === 1);
    const blockResult = json.find((r: any) => r.id === 2);

    if (balanceResult?.error) {
      logger.warn({ rpcUrl, error: balanceResult.error }, 'EVM eth_getBalance error');
      return null;
    }

    const balanceWei = BigInt(balanceResult.result);
    const balanceEth = weiToEther(balanceWei);
    const blockNumber = blockResult?.result ? parseInt(blockResult.result, 16) : undefined;

    return { balance: balanceEth, blockNumber };
  } finally {
    clearTimeout(timeout);
  }
}

async function getEvmBalanceSingle(rpcUrl: string, address: string): Promise<OnChainBalanceResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const balanceRes = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_getBalance', params: [address, 'latest'] }),
      signal: controller.signal,
    });

    if (!balanceRes.ok) return null;
    const balanceJson = await balanceRes.json() as any;
    if (balanceJson.error) return null;

    const balanceWei = BigInt(balanceJson.result);
    return { balance: weiToEther(balanceWei) };
  } finally {
    clearTimeout(timeout);
  }
}

function weiToEther(wei: bigint): string {
  const whole = wei / 1_000_000_000_000_000_000n;
  const remainder = wei % 1_000_000_000_000_000_000n;
  const decimals = remainder.toString().padStart(18, '0');
  return `${whole}.${decimals}`;
}

// ─── Bitcoin ────────────────────────────────────────────────────────────────

async function getBitcoinBalance(address: string): Promise<OnChainBalanceResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${BITCOIN_API}${encodeURIComponent(address)}`, {
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Bitcoin API returned non-OK status');
      return null;
    }

    const json = await res.json() as Record<string, { final_balance: number }>;
    const entry = json[address];
    if (!entry) {
      logger.warn({ address }, 'Bitcoin address not found in API response');
      return null;
    }

    // final_balance is in satoshis (1 BTC = 100,000,000 satoshis)
    const satoshis = BigInt(entry.final_balance);
    const whole = satoshis / 100_000_000n;
    const remainder = satoshis % 100_000_000n;
    const decimals = remainder.toString().padStart(8, '0');

    return { balance: `${whole}.${decimals}` };
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Solana ─────────────────────────────────────────────────────────────────

async function getSolanaBalance(address: string): Promise<OnChainBalanceResult | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(RPC_URLS.SOLANA, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getBalance',
        params: [address],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      logger.warn({ status: res.status }, 'Solana RPC returned non-OK status');
      return null;
    }

    const json = await res.json() as any;
    if (json.error) {
      logger.warn({ error: json.error }, 'Solana getBalance error');
      return null;
    }

    // value is in lamports (1 SOL = 1,000,000,000 lamports)
    const lamports = BigInt(json.result.value);
    const whole = lamports / 1_000_000_000n;
    const remainder = lamports % 1_000_000_000n;
    const decimals = remainder.toString().padStart(9, '0');
    const slot = json.result.context?.slot;

    return { balance: `${whole}.${decimals}`, blockNumber: slot };
  } finally {
    clearTimeout(timeout);
  }
}
