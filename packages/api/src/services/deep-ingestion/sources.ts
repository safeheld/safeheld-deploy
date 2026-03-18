export interface LegislativeSource {
  framework: string;
  sourceName: string;
  sourceUrl: string;
  type: 'pdf' | 'html';
  fallbackUrl?: string;
}

export const LEGISLATIVE_SOURCES: LegislativeSource[] = [
  // PS25
  { framework: 'PS25', sourceName: 'FCA CASS 15 — Payment Services Safeguarding', sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS/15.pdf', type: 'pdf', fallbackUrl: 'https://www.handbook.fca.org.uk/handbook/CASS/15' },
  { framework: 'PS25', sourceName: 'FCA PS24/9 — Safeguarding Policy Statement', sourceUrl: 'https://www.fca.org.uk/publication/policy/ps24-9.pdf', type: 'pdf' },
  { framework: 'PS25', sourceName: 'FCA CP23/28 — Safeguarding Consultation', sourceUrl: 'https://www.fca.org.uk/publication/consultation/cp23-28.pdf', type: 'pdf' },

  // CASS
  { framework: 'CASS', sourceName: 'FCA Client Assets Sourcebook (Full)', sourceUrl: 'https://www.handbook.fca.org.uk/handbook/CASS.pdf', type: 'pdf', fallbackUrl: 'https://www.handbook.fca.org.uk/handbook/CASS' },

  // Consumer Duty
  { framework: 'CD', sourceName: 'FCA PS22/9 — Consumer Duty', sourceUrl: 'https://www.fca.org.uk/publication/policy/ps22-9.pdf', type: 'pdf' },

  // Operational Resilience
  { framework: 'PS213', sourceName: 'FCA PS21/3 — Operational Resilience', sourceUrl: 'https://www.fca.org.uk/publication/policy/ps21-3.pdf', type: 'pdf' },

  // MiCA
  { framework: 'MICA', sourceName: 'MiCA Regulation (EU) 2023/1114', sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32023R1114', type: 'pdf' },

  // DORA
  { framework: 'DORA', sourceName: 'DORA Regulation (EU) 2022/2554', sourceUrl: 'https://eur-lex.europa.eu/legal-content/EN/TXT/PDF/?uri=CELEX:32022R2554', type: 'pdf' },

  // EBA Guidelines
  { framework: 'PSD2', sourceName: 'EBA Guidelines on Safeguarding', sourceUrl: 'https://www.eba.europa.eu/sites/default/files/2024-12/bcf09058-5a2f-4e2d-8b3e-c72a46e9bde0/EBA%20Final%20Report%20on%20GL%20on%20safeguarding.pdf', type: 'pdf' },

  // GENIUS Act
  { framework: 'GENIUS', sourceName: 'GENIUS Act — S.394', sourceUrl: 'https://www.congress.gov/bill/119th-congress/senate-bill/394/text', type: 'html' },

  // SRA
  { framework: 'SRA', sourceName: 'SRA Accounts Rules 2019', sourceUrl: 'https://www.sra.org.uk/solicitors/standards-regulations/accounts-rules', type: 'html' },

  // Gambling Commission
  { framework: 'GC', sourceName: 'Gambling Commission LCCP', sourceUrl: 'https://www.gamblingcommission.gov.uk/licensees-and-businesses/guide/page/licence-conditions-and-codes-of-practice', type: 'html' },

  // SEC 15c3-3
  { framework: '15C33', sourceName: 'SEC Rule 15c3-3', sourceUrl: 'https://www.ecfr.gov/current/title-17/chapter-II/part-240/section-240.15c3-3', type: 'html' },

  // RICS
  { framework: 'CDS', sourceName: 'RICS Client Money Handling', sourceUrl: 'https://www.rics.org/profession-standards/rics-standards-and-guidance/sector-standards/real-estate/client-money-handling', type: 'html' },
];

// Map frameworks to their rule code prefix pattern
export const FRAMEWORK_CODE_PREFIX: Record<string, string> = {
  PS25: 'PS25',
  CASS: 'CASS7', // CASS covers CASS5/6/7/10
  CD: 'CD',
  PS213: 'PS213',
  MICA: 'MICA',
  DORA: 'DORA',
  PSD2: 'PSD2',
  GENIUS: 'GENIUS',
  SRA: 'SRA',
  GC: 'GC',
  '15C33': '15C33',
  CDS: 'CDS',
  INS: 'INS',
};
