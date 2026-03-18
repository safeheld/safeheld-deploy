import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sources = [
  { framework: 'PS25', sourceName: 'FCA Handbook — Payment Services (CASS)', sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS', jurisdiction: 'UK', monitorFrequency: 'DAILY' as const },
  { framework: 'CASS', sourceName: 'FCA Handbook — Client Assets Sourcebook', sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS', jurisdiction: 'UK', monitorFrequency: 'DAILY' as const },
  { framework: 'PS213', sourceName: 'FCA Operational Resilience', sourceUrl: 'https://www.fca.org.uk/firms/operational-resilience', jurisdiction: 'UK', monitorFrequency: 'WEEKLY' as const },
  { framework: 'CD', sourceName: 'FCA Consumer Duty', sourceUrl: 'https://www.fca.org.uk/firms/consumer-duty', jurisdiction: 'UK', monitorFrequency: 'WEEKLY' as const },
  { framework: 'MICA', sourceName: 'ESMA — Markets in Crypto Assets (MiCA)', sourceUrl: 'https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica', jurisdiction: 'EU', monitorFrequency: 'DAILY' as const },
  { framework: 'PSD2', sourceName: 'EBA Guidelines — Payment Services & E-Money', sourceUrl: 'https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money', jurisdiction: 'EU', monitorFrequency: 'WEEKLY' as const },
  { framework: 'DORA', sourceName: 'EIOPA — Digital Operational Resilience Act', sourceUrl: 'https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en', jurisdiction: 'EU', monitorFrequency: 'WEEKLY' as const },
  { framework: 'GENIUS', sourceName: 'US Federal Register — Stablecoin Regulation', sourceUrl: 'https://www.federalregister.gov', jurisdiction: 'US', monitorFrequency: 'DAILY' as const },
  { framework: 'SRA', sourceName: 'SRA Standards and Regulations', sourceUrl: 'https://www.sra.org.uk/solicitors/standards-regulations', jurisdiction: 'UK', monitorFrequency: 'WEEKLY' as const },
  { framework: 'GC', sourceName: 'Gambling Commission — LCCP', sourceUrl: 'https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/licence-conditions-and-codes-of-practice', jurisdiction: 'UK', monitorFrequency: 'WEEKLY' as const },
  { framework: 'CDS', sourceName: 'RICS Standards and Guidance', sourceUrl: 'https://www.rics.org/profession-standards/rics-standards-and-guidance', jurisdiction: 'UK', monitorFrequency: 'MONTHLY' as const },
];

async function main() {
  console.log('Seeding regulatory sources...\n');

  let created = 0;
  let existing = 0;

  for (const source of sources) {
    const exists = await prisma.regulatorySource.findFirst({
      where: { sourceUrl: source.sourceUrl, framework: source.framework },
    });

    if (exists) {
      existing++;
      console.log(`  [EXISTS] ${source.framework}: ${source.sourceName}`);
    } else {
      await prisma.regulatorySource.create({ data: source });
      created++;
      console.log(`  [CREATED] ${source.framework}: ${source.sourceName}`);
    }
  }

  console.log(`\nSeed complete: ${created} created, ${existing} already existed`);
  console.log(`Total sources: ${sources.length}`);

  // Summary by jurisdiction
  const byJurisdiction: Record<string, number> = {};
  const byFrequency: Record<string, number> = {};
  for (const s of sources) {
    byJurisdiction[s.jurisdiction] = (byJurisdiction[s.jurisdiction] || 0) + 1;
    byFrequency[s.monitorFrequency] = (byFrequency[s.monitorFrequency] || 0) + 1;
  }
  console.log('\nBy jurisdiction:', byJurisdiction);
  console.log('By frequency:', byFrequency);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
