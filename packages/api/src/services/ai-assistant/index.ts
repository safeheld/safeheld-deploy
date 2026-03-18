import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { config } from '../../config';

function toNum(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return val;
  return Number(val.toString());
}

// ─── Context Builder ─────────────────────────────────────────────────────────

async function buildFirmContext(firmId: string): Promise<string> {
  const firm = await prisma.firm.findUnique({
    where: { id: firmId },
    select: {
      name: true,
      fcaFrn: true,
      regime: true,
      billingStatus: true,
      trialEndsAt: true,
    },
  });

  if (!firm) return 'Firm not found.';

  // Latest reconciliation
  const lastRecon = await prisma.reconciliationRun.findFirst({
    where: { firmId, reconciliationType: 'INTERNAL' },
    orderBy: { reconciliationDate: 'desc' },
    select: { status: true, reconciliationDate: true, totalRequirement: true, totalResource: true, variance: true, variancePercentage: true, complianceScore: true },
  });

  // Compliance score trend (last 5 runs)
  const recentRuns = await prisma.reconciliationRun.findMany({
    where: { firmId, reconciliationType: 'INTERNAL', complianceScore: { not: null } },
    orderBy: { reconciliationDate: 'desc' },
    take: 5,
    select: { complianceScore: true, reconciliationDate: true },
  });

  // Critical/High findings
  const criticalFindings = await prisma.complianceFinding.findMany({
    where: { reconciliationRun: { firmId }, severity: { in: ['CRITICAL', 'HIGH'] }, status: 'FAIL' },
    orderBy: { createdAt: 'desc' },
    take: 10,
    select: { ruleCode: true, framework: true, severity: true, detail: true, remediationGuidance: true },
  });

  // Open remediations
  const remediations = await prisma.remediationAction.findMany({
    where: { firmId, status: { in: ['OPEN', 'IN_PROGRESS', 'OVERDUE'] } },
    orderBy: [{ status: 'asc' }, { deadline: 'asc' }],
    take: 10,
    select: { actionDescription: true, severity: true, status: true, deadline: true, escalationPath: true },
  });

  // Active breaches
  const breaches = await prisma.breach.findMany({
    where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
    orderBy: { createdAt: 'asc' },
    select: { breachType: true, severity: true, status: true, createdAt: true },
  });

  // Acknowledgement letters
  const letters = await prisma.acknowledgementLetter.findMany({
    where: { safeguardingAccount: { firmId } },
    orderBy: { expiryDate: 'asc' },
    take: 5,
    select: { status: true, expiryDate: true },
  });

  // Framework rules
  const frameworks = await prisma.frameworkRule.groupBy({
    by: ['framework'],
    where: { active: true },
    _count: true,
  });

  // Build context string
  const score = lastRecon?.complianceScore ? toNum(lastRecon.complianceScore) : null;
  const scoreTrend = recentRuns.length >= 2
    ? `${toNum(recentRuns[recentRuns.length - 1].complianceScore)} → ${toNum(recentRuns[0].complianceScore)} over last ${recentRuns.length} runs`
    : 'Insufficient data for trend';

  const overdueCount = remediations.filter(r => r.status === 'OVERDUE').length;
  const criticalBreaches = breaches.filter(b => b.severity === 'CRITICAL').length;

  const expiredLetters = letters.filter(l => l.status === 'EXPIRED').length;
  const missingLetters = letters.filter(l => l.status === 'MISSING').length;
  const letterStatus = expiredLetters > 0 ? `${expiredLetters} expired` : missingLetters > 0 ? `${missingLetters} missing` : letters.length > 0 ? 'All current' : 'None recorded';

  const trialDays = firm.billingStatus === 'TRIAL' && firm.trialEndsAt
    ? Math.max(0, Math.ceil((new Date(firm.trialEndsAt).getTime() - Date.now()) / 86400000))
    : null;

  let context = `You are the Safeheld AI Compliance Assistant — an expert in FCA, MiCA, GENIUS Act, CASS, SRA, and all regulatory frameworks Safeheld supports. You are speaking with a compliance officer at ${firm.name}${firm.fcaFrn ? ` (FRN: ${firm.fcaFrn})` : ''}.

FIRM CONTEXT:
- Regulatory regime: ${firm.regime}
- Active frameworks: ${frameworks.map(f => `${f.framework} (${f._count} rules)`).join(', ')}
- Current compliance score: ${score !== null ? `${score}/100` : 'Not yet scored'}
- Score trend: ${scoreTrend}
- Last reconciliation: ${lastRecon ? `${lastRecon.status} on ${new Date(lastRecon.reconciliationDate).toISOString().split('T')[0]} — Coverage: ${lastRecon.totalResource && lastRecon.totalRequirement ? Math.round(toNum(lastRecon.totalResource) / Math.max(toNum(lastRecon.totalRequirement), 1) * 100) : 'N/A'}% — Variance: ${lastRecon.variance ? `£${toNum(lastRecon.variance).toLocaleString()}` : 'N/A'}` : 'No reconciliation runs yet'}
- Open remediation actions: ${remediations.length} (${overdueCount} overdue)
- Active breaches: ${breaches.length} (${criticalBreaches} critical)
- Acknowledgement letters: ${letterStatus}`;

  if (trialDays !== null) {
    context += `\n- Trial status: ${trialDays} days remaining`;
  }

  if (criticalFindings.length > 0) {
    context += '\n\nCRITICAL/HIGH FINDINGS (requiring immediate attention):';
    for (const f of criticalFindings) {
      context += `\n- [${f.severity}] ${f.ruleCode} (${f.framework}): ${f.detail}`;
      if (f.remediationGuidance) context += `\n  Remediation: ${f.remediationGuidance}`;
    }
  }

  if (remediations.filter(r => r.status === 'OVERDUE').length > 0) {
    context += '\n\nOVERDUE REMEDIATION ACTIONS:';
    for (const r of remediations.filter(r => r.status === 'OVERDUE')) {
      context += `\n- [${r.severity}] ${r.actionDescription} — Due: ${r.deadline ? new Date(r.deadline).toISOString().split('T')[0] : 'No deadline'}`;
    }
  }

  context += `

Your role:
- Answer compliance questions accurately based on the firm's actual data above
- Explain findings in plain English — not regulatory jargon
- Provide specific, actionable remediation guidance
- Reference specific rule codes (e.g. PS25-003) when relevant
- Flag urgent issues proactively
- Never give legal advice — recommend consulting a solicitor for legal questions
- Always be concise, direct, and practical
- If asked about something outside your knowledge, say so clearly

Tone: Professional but approachable. You are a trusted compliance expert, not a chatbot.`;

  return context;
}

// ─── Chat (Streaming via SSE using raw fetch) ───────────────────────────────

export async function streamChat(
  firmId: string,
  userId: string,
  sessionId: string,
  messages: Array<{ role: 'user' | 'assistant'; content: string }>,
  contextType: string,
  onChunk: (chunk: string) => void,
  onDone: (fullResponse: string, tokensUsed: number) => void,
  onError: (err: Error) => void,
) {
  try {
    const systemPrompt = await buildFirmContext(firmId);

    // Save user message
    const lastUserMsg = messages[messages.length - 1];
    if (lastUserMsg?.role === 'user') {
      await prisma.aiConversation.create({
        data: { firmId, userId, sessionId, role: 'user', content: lastUserMsg.content, contextType },
      });
    }

    // Call Claude API with streaming via raw fetch
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        stream: true,
        system: systemPrompt,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 200)}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body reader');

    const decoder = new TextDecoder();
    let fullResponse = '';
    let tokensUsed = 0;
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const event = JSON.parse(data);
          if (event.type === 'content_block_delta' && event.delta?.text) {
            fullResponse += event.delta.text;
            onChunk(event.delta.text);
          }
          if (event.type === 'message_delta' && event.usage) {
            tokensUsed = (event.usage.input_tokens || 0) + (event.usage.output_tokens || 0);
          }
        } catch {}
      }
    }

    // Save assistant response
    await prisma.aiConversation.create({
      data: { firmId, userId, sessionId, role: 'assistant', content: fullResponse, contextType, tokensUsed },
    });

    onDone(fullResponse, tokensUsed);
  } catch (err) {
    logger.error({ err, firmId }, 'AI assistant chat failed');
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

// ─── Proactive Alert ─────────────────────────────────────────────────────────

export async function getProactiveAlert(firmId: string): Promise<string | null> {
  // Check overdue remediations
  const overdueCount = await prisma.remediationAction.count({
    where: { firmId, status: 'OVERDUE' },
  });

  if (overdueCount > 0) {
    const topOverdue = await prisma.remediationAction.findFirst({
      where: { firmId, status: 'OVERDUE' },
      orderBy: { deadline: 'asc' },
      select: { actionDescription: true, deadline: true },
    });
    const daysOverdue = topOverdue?.deadline ? Math.ceil((Date.now() - new Date(topOverdue.deadline).getTime()) / 86400000) : 0;
    return `You have **${overdueCount} overdue remediation action${overdueCount > 1 ? 's' : ''}**. The most urgent is: "${topOverdue?.actionDescription}" which was due ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago. Shall I walk you through fixing it?`;
  }

  // Check active breaches
  const breachCount = await prisma.breach.count({
    where: { firmId, status: { notIn: ['RESOLVED', 'CLOSED'] } },
  });

  if (breachCount > 0) {
    return `You have **${breachCount} active breach${breachCount > 1 ? 'es' : ''}** that need${breachCount === 1 ? 's' : ''} attention. Would you like me to summarise them?`;
  }

  return null;
}

// ─── Rate Limiting ───────────────────────────────────────────────────────────

export async function checkRateLimit(firmId: string, userId: string): Promise<{ allowed: boolean; message?: string }> {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const hourAgo = new Date(Date.now() - 3600000);

  const [firmToday, userHour] = await Promise.all([
    prisma.aiConversation.count({ where: { firmId, role: 'user', createdAt: { gte: todayStart } } }),
    prisma.aiConversation.count({ where: { userId, role: 'user', createdAt: { gte: hourAgo } } }),
  ]);

  if (firmToday >= 50) return { allowed: false, message: "You've reached your daily message limit (50/day). Upgrade your plan for unlimited AI assistance." };
  if (userHour >= 10) return { allowed: false, message: "You've sent too many messages. Please wait a few minutes before trying again." };

  return { allowed: true };
}

// ─── History & Admin ─────────────────────────────────────────────────────────

export async function getConversationHistory(firmId: string, page = 1, pageSize = 50) {
  const skip = (page - 1) * pageSize;
  const [messages, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where: { firmId },
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { name: true } } },
    }),
    prisma.aiConversation.count({ where: { firmId } }),
  ]);
  return { messages, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}

export async function clearHistory(firmId: string) {
  const deleted = await prisma.aiConversation.deleteMany({ where: { firmId } });
  return { deleted: deleted.count };
}

export async function getAdminUsageStats() {
  const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
  const weekStart = new Date(); weekStart.setDate(weekStart.getDate() - 7); weekStart.setHours(0, 0, 0, 0);
  const monthStart = new Date(); monthStart.setDate(1); monthStart.setHours(0, 0, 0, 0);

  const [today, week, month, byFirm, totalTokens] = await Promise.all([
    prisma.aiConversation.count({ where: { role: 'user', createdAt: { gte: todayStart } } }),
    prisma.aiConversation.count({ where: { role: 'user', createdAt: { gte: weekStart } } }),
    prisma.aiConversation.count({ where: { role: 'user', createdAt: { gte: monthStart } } }),
    prisma.aiConversation.groupBy({
      by: ['firmId'],
      where: { role: 'user', createdAt: { gte: monthStart } },
      _count: true,
    }),
    prisma.aiConversation.aggregate({
      where: { createdAt: { gte: monthStart } },
      _sum: { tokensUsed: true },
    }),
  ]);

  // Get firm names
  const firmIds = byFirm.map(f => f.firmId);
  const firms = await prisma.firm.findMany({
    where: { id: { in: firmIds } },
    select: { id: true, name: true },
  });
  const firmMap = new Map(firms.map(f => [f.id, f.name]));

  const firmUsage = byFirm.map(f => ({
    firmId: f.firmId,
    firmName: firmMap.get(f.firmId) || 'Unknown',
    messagesThisMonth: f._count,
  })).sort((a, b) => b.messagesThisMonth - a.messagesThisMonth);

  return {
    conversationsToday: today,
    conversationsThisWeek: week,
    conversationsThisMonth: month,
    totalTokensThisMonth: totalTokens._sum.tokensUsed || 0,
    estimatedCost: Math.round(((totalTokens._sum.tokensUsed || 0) / 1000000) * 3 * 100) / 100, // ~$3/MTok estimate
    firmUsage,
  };
}

export async function getAdminConversations(filters: { firmId?: string; page?: number; pageSize?: number }) {
  const where: any = {};
  if (filters.firmId) where.firmId = filters.firmId;

  const page = filters.page || 1;
  const pageSize = filters.pageSize || 50;
  const skip = (page - 1) * pageSize;

  const [conversations, total] = await Promise.all([
    prisma.aiConversation.findMany({
      where,
      skip,
      take: pageSize,
      orderBy: { createdAt: 'desc' },
      include: { firm: { select: { name: true } }, user: { select: { name: true } } },
    }),
    prisma.aiConversation.count({ where }),
  ]);

  return { conversations, total, page, pageSize, totalPages: Math.ceil(total / pageSize) };
}
