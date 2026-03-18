import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const demoConversations = [
  {
    messages: [
      { role: 'user', content: 'Why did my compliance score drop?' },
      { role: 'assistant', content: 'Your compliance score dropped from 92 to 85 in the last reconciliation run. The main causes are:\n\n1. **PS25-003** (HIGH): Your safeguarding coverage ratio fell below 100% — you have a shortfall of £12,450 in your segregated account.\n2. **PS25-007** (MEDIUM): Your acknowledgement letter from Barclays expired 3 days ago and hasn\'t been renewed.\n\nI\'d recommend addressing the coverage shortfall first, as this is a regulatory requirement under FCA PS25. Would you like me to walk through the remediation steps?' },
    ],
  },
  {
    messages: [
      { role: 'user', content: 'What are my most urgent actions?' },
      { role: 'assistant', content: 'You have **3 overdue remediation actions**:\n\n1. **CRITICAL** — Restore safeguarding coverage to 100% (due 2 days ago)\n   - Current shortfall: £12,450\n   - Action: Transfer funds to segregated account or reduce client balances\n\n2. **HIGH** — Renew Barclays acknowledgement letter (due 3 days ago)\n   - Contact your Barclays relationship manager\n   - Template available in Governance → Letters\n\n3. **MEDIUM** — Complete Q1 board report (due 5 days ago)\n   - Draft available in Reports → Board Pack\n\nShall I explain any of these in more detail?' },
    ],
  },
  {
    messages: [
      { role: 'user', content: 'Am I compliant with PS25?' },
      { role: 'assistant', content: 'Based on your latest reconciliation, you are **partially compliant** with PS25. Here\'s your status across the 10 PS25 rules:\n\n**Passing (7/10):**\n- PS25-001: Relevant funds calculation ✓\n- PS25-002: Safeguarding method (segregation) ✓\n- PS25-004: Record keeping ✓\n- PS25-005: Daily reconciliation frequency ✓\n- PS25-006: Segregation of funds ✓\n- PS25-009: Regulatory notifications ✓\n- PS25-010: Resolution planning ✓\n\n**Failing (3/10):**\n- PS25-003: Coverage ratio — 99.2% (must be ≥100%)\n- PS25-007: Acknowledgement letter expired\n- PS25-008: Third-party due diligence review overdue\n\nYour compliance score for PS25 is **70/100**. Fixing the coverage shortfall would bring it to approximately 85.' },
    ],
  },
  {
    messages: [
      { role: 'user', content: 'When is my next reconciliation due?' },
      { role: 'assistant', content: 'Your next scheduled reconciliation is **tomorrow morning at 06:00 UTC**.\n\nYour firm is configured for daily reconciliation (Monday–Friday). The reconciliation will:\n- Compare client balances against safeguarding ledger balances (internal)\n- Compare ledger balances against bank statement balances (external)\n- Run all 10 PS25 framework rules and update your compliance score\n\nTo ensure accurate results, please make sure yesterday\'s bank statement data and client balance data have been uploaded before 06:00 UTC.' },
    ],
  },
  {
    messages: [
      { role: 'user', content: 'Explain the PS25-003 finding' },
      { role: 'assistant', content: '**PS25-003: Safeguarding Coverage Ratio**\n\nThis rule checks that your total safeguarded resources (funds held in segregated accounts) are **equal to or greater than** your total safeguarding requirement (client funds you\'re obligated to protect).\n\n**Your current position:**\n- Total requirement (client funds): £5,012,450\n- Total resource (segregated funds): £5,000,000\n- Shortfall: **£12,450** (0.25%)\n\n**Why this matters:**\nUnder FCA PS25, payment service providers must safeguard 100% of relevant funds at all times. A shortfall means clients\' money is not fully protected.\n\n**What to do:**\n1. Transfer at least £12,450 into your designated safeguarding account\n2. Confirm the transfer with your bank\n3. Upload the updated bank statement\n4. Run a manual reconciliation to verify the shortfall is resolved\n\nThis is classified as **HIGH severity** because it represents a direct regulatory breach. The FCA expects shortfalls to be rectified within 1 business day of detection.' },
    ],
  },
];

async function main() {
  console.log('Seeding demo AI conversations...\n');

  const firms = await prisma.firm.findMany({
    take: 2,
    select: { id: true, name: true, users: { where: { status: 'ACTIVE' }, select: { id: true }, take: 1 } },
  });

  let count = 0;
  for (const firm of firms) {
    if (!firm.users[0]) continue;
    const userId = firm.users[0].id;
    const sessionId = `demo_${firm.id.slice(0, 8)}`;

    for (const conv of demoConversations) {
      for (const msg of conv.messages) {
        await prisma.aiConversation.create({
          data: {
            firmId: firm.id,
            userId,
            sessionId,
            role: msg.role,
            content: msg.content,
            contextType: 'compliance',
            tokensUsed: msg.role === 'assistant' ? Math.floor(msg.content.length / 4) : 0,
            createdAt: new Date(Date.now() - Math.random() * 7 * 86400000),
          },
        });
        count++;
      }
    }
    console.log(`  ${firm.name}: ${demoConversations.length} conversations seeded`);
  }

  console.log(`\n=== AI CONVERSATIONS SEED COMPLETE ===`);
  console.log(`Total messages: ${count}`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
