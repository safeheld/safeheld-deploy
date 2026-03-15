import { logger } from './logger';

const COINGECKO_IDS: Record<string, string> = {
  USDT: 'tether',
  USDC: 'usd-coin',
  DAI: 'dai',
  TUSD: 'trueusd',
  BUSD: 'binance-usd',
  FRAX: 'frax',
  FDUSD: 'first-digital-usd',
};

const COINGECKO_BASE_URL = 'https://api.coingecko.com/api/v3';

/**
 * Fetch current USD prices for common stablecoins from CoinGecko's free API.
 * Returns a map of symbol → price, e.g. { "USDT": 0.9998, "USDC": 1.0001, ... }
 */
export async function getStablecoinPrices(): Promise<Record<string, number>> {
  const ids = Object.values(COINGECKO_IDS).join(',');
  const url = `${COINGECKO_BASE_URL}/simple/price?ids=${ids}&vs_currencies=usd`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'Accept': 'application/json' },
    });

    if (response.status === 429) {
      logger.warn('CoinGecko rate limit hit, skipping price fetch');
      return {};
    }

    if (!response.ok) {
      logger.error({ status: response.status }, 'CoinGecko API error');
      return {};
    }

    const data = await response.json() as Record<string, { usd?: number }>;

    // Reverse map: CoinGecko ID → symbol
    const idToSymbol: Record<string, string> = {};
    for (const [symbol, geckoId] of Object.entries(COINGECKO_IDS)) {
      idToSymbol[geckoId] = symbol;
    }

    const prices: Record<string, number> = {};
    for (const [geckoId, values] of Object.entries(data)) {
      const symbol = idToSymbol[geckoId];
      if (symbol && values.usd !== undefined) {
        prices[symbol] = values.usd;
      }
    }

    logger.info({ symbolCount: Object.keys(prices).length }, 'Fetched stablecoin prices from CoinGecko');
    return prices;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      logger.error('CoinGecko price fetch timed out after 10s');
    } else {
      logger.error({ err }, 'Failed to fetch stablecoin prices');
    }
    return {};
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Get the CoinGecko ID for a given token symbol, if known.
 */
export function getCoinGeckoId(symbol: string): string | undefined {
  return COINGECKO_IDS[symbol.toUpperCase()];
}
