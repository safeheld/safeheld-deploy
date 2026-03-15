import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { getStablecoinPrices } from '../../utils/priceFeed';

type PegStatus = 'ON_PEG' | 'MINOR_DEVIATION' | 'MAJOR_DEVIATION' | 'DEPEGGED';

function classifyDeviation(absDeviationPct: number): PegStatus {
  if (absDeviationPct < 0.5) return 'ON_PEG';
  if (absDeviationPct < 2) return 'MINOR_DEVIATION';
  if (absDeviationPct < 5) return 'MAJOR_DEVIATION';
  return 'DEPEGGED';
}

/**
 * Check peg status for all StablecoinTokens belonging to a firm.
 * Fetches live prices, creates PegSnapshot records, updates token status,
 * and creates breach alerts for MAJOR_DEVIATION or DEPEGGED tokens.
 */
export async function checkPegStatus(firmId: string) {
  const tokens = await prisma.stablecoinToken.findMany({
    where: { firmId },
  });

  if (tokens.length === 0) {
    logger.info({ firmId }, 'No stablecoin tokens found for firm, skipping peg check');
    return { checked: 0, snapshots: [] };
  }

  const prices = await getStablecoinPrices();
  if (Object.keys(prices).length === 0) {
    logger.warn({ firmId }, 'No prices available, skipping peg check');
    return { checked: 0, snapshots: [] };
  }

  const snapshots = [];
  const now = new Date();

  for (const token of tokens) {
    const price = prices[token.symbol.toUpperCase()];
    if (price === undefined) {
      logger.debug({ firmId, symbol: token.symbol }, 'No price data for token, skipping');
      continue;
    }

    const pegTarget = Number(token.pegTarget);
    const deviationPct = ((price - pegTarget) / pegTarget) * 100;
    const absDeviation = Math.abs(deviationPct);
    const pegStatus = classifyDeviation(absDeviation);

    // Create peg snapshot
    const snapshot = await prisma.pegSnapshot.create({
      data: {
        firmId,
        tokenId: token.id,
        price,
        pegTarget,
        deviationPct,
        pegStatus: pegStatus as any,
        snapshotAt: now,
      },
      include: { token: { select: { symbol: true, name: true } } },
    });

    // Update token with latest price and status
    await prisma.stablecoinToken.update({
      where: { id: token.id },
      data: { currentPrice: price, pegStatus: pegStatus as any },
    });

    snapshots.push(snapshot);

    logger.info(
      { firmId, symbol: token.symbol, price, deviationPct: deviationPct.toFixed(4), pegStatus },
      'Peg snapshot recorded',
    );

    // Create breach alert for significant deviations
    if (pegStatus === 'MAJOR_DEVIATION' || pegStatus === 'DEPEGGED') {
      const severity = pegStatus === 'DEPEGGED' ? 'CRITICAL' : 'HIGH';
      const description =
        `Stablecoin ${token.symbol} (${token.name}) has ${pegStatus === 'DEPEGGED' ? 'depegged' : 'a major deviation'} ` +
        `from its $${pegTarget.toFixed(2)} peg. Current price: $${price.toFixed(6)}, ` +
        `deviation: ${deviationPct.toFixed(4)}%.`;

      await prisma.breach.create({
        data: {
          firmId,
          breachType: 'SHORTFALL',
          severity: severity as any,
          isNotifiable: pegStatus === 'DEPEGGED',
          description,
          currency: token.pegCurrency,
          shortfallPercentage: absDeviation,
        },
      });

      logger.warn(
        { firmId, symbol: token.symbol, pegStatus, severity },
        'Breach alert created for stablecoin peg deviation',
      );
    }
  }

  return { checked: snapshots.length, snapshots };
}

/**
 * Calculate the reserve ratio for a firm's stablecoin tokens.
 * Returns total reserve asset value / total circulating supply value.
 */
export async function getReserveRatio(firmId: string) {
  const [reserveAgg, tokens] = await Promise.all([
    prisma.reserveAsset.aggregate({
      where: { firmId, status: 'ACTIVE' },
      _sum: { marketValue: true, faceValue: true },
    }),
    prisma.stablecoinToken.findMany({
      where: { firmId },
      select: { circulatingSupply: true, totalSupply: true, pegTarget: true, symbol: true },
    }),
  ]);

  const totalReserveValue =
    Number(reserveAgg._sum.marketValue || 0) || Number(reserveAgg._sum.faceValue || 0);

  let totalCirculatingValue = 0;
  for (const token of tokens) {
    const supply = Number(token.circulatingSupply || token.totalSupply || 0);
    const peg = Number(token.pegTarget);
    totalCirculatingValue += supply * peg;
  }

  const ratio = totalCirculatingValue > 0 ? totalReserveValue / totalCirculatingValue : null;

  return {
    totalReserveValue,
    totalCirculatingValue,
    reserveRatio: ratio,
    tokenCount: tokens.length,
  };
}
