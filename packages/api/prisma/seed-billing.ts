import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding billing data...\n');

  // Set all existing firms to TRIAL with 30-day trial
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + 30);

  const firms = await prisma.firm.findMany({
    select: { id: true, name: true },
  });

  for (const firm of firms) {
    await prisma.firm.update({
      where: { id: firm.id },
      data: {
        billingStatus: 'TRIAL',
        trialEndsAt: trialEnd,
        baseMonthlyFee: 1500,
        basisPointsRate: 0.0000025,
      },
    });
    console.log(`  ${firm.name}: TRIAL (expires ${trialEnd.toISOString().split('T')[0]})`);
  }

  // Create mock invoice history for first 2 firms
  const invoiceFirms = firms.slice(0, 2);
  const now = new Date();

  for (const firm of invoiceFirms) {
    // Set these firms to ACTIVE for demo purposes
    await prisma.firm.update({
      where: { id: firm.id },
      data: { billingStatus: 'ACTIVE' },
    });

    for (let monthsAgo = 3; monthsAgo >= 1; monthsAgo--) {
      const periodEnd = new Date(now.getFullYear(), now.getMonth() - monthsAgo + 1, 0);
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

      // Simulate different balances each month
      const balances = [12_500_000, 14_200_000, 15_800_000];
      const monthEndBalance = balances[3 - monthsAgo] + Math.floor(Math.random() * 1_000_000);
      const baseFee = 1500;
      const basisPointsAmount = Math.round(monthEndBalance * 0.0000025 * 100) / 100;
      const totalAmount = Math.round((baseFee + basisPointsAmount) * 100) / 100;

      await prisma.billingInvoice.create({
        data: {
          firmId: firm.id,
          periodStart,
          periodEnd,
          monthEndBalance,
          baseFee,
          basisPointsAmount,
          totalAmount,
          currency: 'GBP',
          status: 'PAID',
          paidAt: new Date(periodEnd.getTime() + 5 * 86400000), // Paid 5 days after period end
        },
      });

      console.log(`  ${firm.name}: Invoice ${periodStart.toISOString().split('T')[0]} — ${totalAmount.toFixed(2)} GBP (PAID)`);
    }
  }

  console.log(`\n=== BILLING SEED COMPLETE ===`);
  console.log(`Firms configured: ${firms.length}`);
  console.log(`Demo invoices created: ${invoiceFirms.length * 3}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
