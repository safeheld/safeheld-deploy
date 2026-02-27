import { prisma } from '../../utils/prisma';
import { ResolutionPackHealth } from '@prisma/client';

interface HealthComponent {
  name: string;
  status: 'GREEN' | 'AMBER' | 'RED';
  detail: string;
}

interface ResolutionPackHealthResult {
  overallStatus: ResolutionPackHealth;
  components: HealthComponent[];
  missingComponents: string[];
}

export async function computeResolutionPackHealth(firmId: string): Promise<ResolutionPackHealthResult> {
  const today = new Date();
  const in30Days = new Date(today.getTime() + 30 * 86400000);
  const in60Days = new Date(today.getTime() + 60 * 86400000);

  const [
    accounts,
    policies,
    responsibilities,
    ddRecords,
    insurance,
    openBreaches,
  ] = await Promise.all([
    prisma.safeguardingAccount.findMany({
      where: { firmId, status: 'ACTIVE' },
      include: {
        acknowledgementLetters: { where: { status: 'CURRENT' }, take: 1, orderBy: { version: 'desc' } },
      },
    }),
    prisma.policyDocument.findMany({ where: { firmId, status: 'CURRENT' } }),
    prisma.responsibilityAssignment.findMany({ where: { firmId, effectiveTo: null } }),
    prisma.thirdPartyDueDiligence.findMany({ where: { firmId } }),
    prisma.insuranceGuarantee.findMany({ where: { firmId, status: { in: ['ACTIVE', 'EXPIRING'] } } }),
    prisma.breach.count({ where: { firmId, isNotifiable: true, status: { notIn: ['RESOLVED', 'CLOSED'] } } }),
  ]);

  const components: HealthComponent[] = [];
  const missingComponents: string[] = [];

  // 1. Acknowledgement Letters
  const accountsWithCurrentLetter = accounts.filter(a => a.acknowledgementLetters.length > 0);
  const accountsWithExpiringLetter = accountsWithCurrentLetter.filter(a => {
    const letter = a.acknowledgementLetters[0];
    return letter.expiryDate && letter.expiryDate < in60Days;
  });

  if (accountsWithCurrentLetter.length === accounts.length && accounts.length > 0 && accountsWithExpiringLetter.length === 0) {
    components.push({ name: 'Acknowledgement Letters', status: 'GREEN', detail: `All ${accounts.length} accounts have current letters.` });
  } else if (accountsWithCurrentLetter.length < accounts.length) {
    const missing = accounts.length - accountsWithCurrentLetter.length;
    components.push({ name: 'Acknowledgement Letters', status: 'RED', detail: `${missing} account(s) missing acknowledgement letters.` });
    missingComponents.push('Acknowledgement Letters');
  } else {
    components.push({ name: 'Acknowledgement Letters', status: 'AMBER', detail: `${accountsWithExpiringLetter.length} letter(s) expiring within 60 days.` });
  }

  // 2. Safeguarding Policy
  const safeguardingPolicy = policies.find(p => p.documentType === 'SAFEGUARDING_POLICY');
  if (!safeguardingPolicy) {
    components.push({ name: 'Safeguarding Policy', status: 'RED', detail: 'No current safeguarding policy on file.' });
    missingComponents.push('Safeguarding Policy');
  } else if (safeguardingPolicy.annualReviewDue && safeguardingPolicy.annualReviewDue < in30Days) {
    components.push({ name: 'Safeguarding Policy', status: 'AMBER', detail: `Policy annual review due by ${safeguardingPolicy.annualReviewDue.toISOString().split('T')[0]}.` });
  } else {
    components.push({ name: 'Safeguarding Policy', status: 'GREEN', detail: 'Safeguarding policy current.' });
  }

  // 3. Reconciliation Procedure
  const reconProc = policies.find(p => p.documentType === 'RECONCILIATION_PROCEDURE');
  if (!reconProc) {
    components.push({ name: 'Reconciliation Procedure', status: 'RED', detail: 'No reconciliation procedure on file.' });
    missingComponents.push('Reconciliation Procedure');
  } else {
    components.push({ name: 'Reconciliation Procedure', status: 'GREEN', detail: 'Reconciliation procedure on file.' });
  }

  // 4. Wind-Down Plan
  const windDownPlan = policies.find(p => p.documentType === 'WIND_DOWN_PLAN');
  if (!windDownPlan) {
    components.push({ name: 'Wind-Down Plan', status: 'RED', detail: 'No wind-down plan on file.' });
    missingComponents.push('Wind-Down Plan');
  } else {
    components.push({ name: 'Wind-Down Plan', status: 'GREEN', detail: 'Wind-down plan on file.' });
  }

  // 5. Responsibility Assignments
  const requiredRoles: string[] = ['SAFEGUARDING_OWNER', 'MLRO', 'DIRECTOR_RESPONSIBLE'];
  const assignedRoles = responsibilities.map(r => r.roleType);
  const missingRoles = requiredRoles.filter(r => !assignedRoles.includes(r as never));

  if (missingRoles.length === 0) {
    components.push({ name: 'Responsibility Assignments', status: 'GREEN', detail: 'All required roles assigned.' });
  } else {
    components.push({ name: 'Responsibility Assignments', status: 'RED', detail: `Missing roles: ${missingRoles.join(', ')}.` });
    missingComponents.push('Responsibility Assignments');
  }

  // 6. Due Diligence
  const overdueDd = ddRecords.filter(dd => dd.reviewStatus === 'OVERDUE');
  const dueDd = ddRecords.filter(dd => dd.reviewStatus === 'DUE');

  if (ddRecords.length === 0) {
    components.push({ name: 'Due Diligence', status: 'RED', detail: 'No due diligence records on file.' });
    missingComponents.push('Due Diligence');
  } else if (overdueDd.length > 0) {
    components.push({ name: 'Due Diligence', status: 'RED', detail: `${overdueDd.length} overdue review(s).` });
  } else if (dueDd.length > 0) {
    components.push({ name: 'Due Diligence', status: 'AMBER', detail: `${dueDd.length} review(s) due soon.` });
  } else {
    components.push({ name: 'Due Diligence', status: 'GREEN', detail: 'All due diligence reviews current.' });
  }

  // 7. Open Notifiable Breaches
  if (openBreaches > 0) {
    components.push({ name: 'Open Notifiable Breaches', status: 'RED', detail: `${openBreaches} open notifiable breach(es).` });
  } else {
    components.push({ name: 'Open Notifiable Breaches', status: 'GREEN', detail: 'No open notifiable breaches.' });
  }

  // Overall status
  const hasRed = components.some(c => c.status === 'RED');
  const hasAmber = components.some(c => c.status === 'AMBER');
  const overallStatus: ResolutionPackHealth = hasRed ? 'RED' : hasAmber ? 'AMBER' : 'GREEN';

  return { overallStatus, components, missingComponents };
}
