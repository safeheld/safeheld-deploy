/**
 * Regulatory source registry — seed data for all monitored regulatory URLs.
 */

export interface SourceSeed {
  framework: string;
  sourceName: string;
  sourceUrl: string;
  jurisdiction: string;
  monitorFrequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
}

export const REGULATORY_SOURCES: SourceSeed[] = [
  {
    framework: 'PS25',
    sourceName: 'FCA Handbook — Payment Services (CASS)',
    sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS',
    jurisdiction: 'UK',
    monitorFrequency: 'DAILY',
  },
  {
    framework: 'CASS',
    sourceName: 'FCA Handbook — Client Assets Sourcebook',
    sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS',
    jurisdiction: 'UK',
    monitorFrequency: 'DAILY',
  },
  {
    framework: 'PS213',
    sourceName: 'FCA Operational Resilience',
    sourceUrl: 'https://www.fca.org.uk/firms/operational-resilience',
    jurisdiction: 'UK',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'CD',
    sourceName: 'FCA Consumer Duty',
    sourceUrl: 'https://www.fca.org.uk/firms/consumer-duty',
    jurisdiction: 'UK',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'MICA',
    sourceName: 'ESMA — Markets in Crypto Assets (MiCA)',
    sourceUrl: 'https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/markets-crypto-assets-regulation-mica',
    jurisdiction: 'EU',
    monitorFrequency: 'DAILY',
  },
  {
    framework: 'PSD2',
    sourceName: 'EBA Guidelines — Payment Services & E-Money',
    sourceUrl: 'https://www.eba.europa.eu/regulation-and-policy/payment-services-and-electronic-money',
    jurisdiction: 'EU',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'DORA',
    sourceName: 'EIOPA — Digital Operational Resilience Act',
    sourceUrl: 'https://www.eiopa.europa.eu/digital-operational-resilience-act-dora_en',
    jurisdiction: 'EU',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'GENIUS',
    sourceName: 'US Federal Register — Stablecoin Regulation',
    sourceUrl: 'https://www.federalregister.gov',
    jurisdiction: 'US',
    monitorFrequency: 'DAILY',
  },
  {
    framework: 'SRA',
    sourceName: 'SRA Standards and Regulations',
    sourceUrl: 'https://www.sra.org.uk/solicitors/standards-regulations',
    jurisdiction: 'UK',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'GC',
    sourceName: 'Gambling Commission — LCCP',
    sourceUrl: 'https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/licence-conditions-and-codes-of-practice',
    jurisdiction: 'UK',
    monitorFrequency: 'WEEKLY',
  },
  {
    framework: 'CDS',
    sourceName: 'RICS Standards and Guidance',
    sourceUrl: 'https://www.rics.org/profession-standards/rics-standards-and-guidance',
    jurisdiction: 'UK',
    monitorFrequency: 'MONTHLY',
  },
];
