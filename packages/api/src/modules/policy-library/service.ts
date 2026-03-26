import crypto from 'crypto';
import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import { config } from '../../config';
import { NotFoundError } from '../../utils/errors';
import { PolicyDocumentType, PolicyDocumentStatus, Prisma } from '@prisma/client';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PolicyFilters {
  type?: PolicyDocumentType;
  status?: PolicyDocumentStatus;
  overdue?: boolean;
}

interface UploadPolicyData {
  documentType: PolicyDocumentType;
  title: string;
  reviewFrequencyMonths?: number;
  boardApproved?: boolean;
  boardApprovalDate?: string;
  textContent?: string;
  status?: PolicyDocumentStatus;
}

interface ChecklistItem {
  type: PolicyDocumentType;
  title: string;
  status: 'PRESENT' | 'MISSING' | 'DRAFT' | 'OVERDUE';
}

// ─── Required documents definition ─────────────────────────────────────────

const REQUIRED_DOCUMENTS: Array<{ type: PolicyDocumentType; title: string; required: boolean }> = [
  { type: 'SAFEGUARDING_POLICY', title: 'Safeguarding Policy', required: true },
  { type: 'RECONCILIATION_PROCEDURE', title: 'Reconciliation Procedure', required: true },
  { type: 'BREACH_PROCEDURE', title: 'Breach Procedure', required: true },
  { type: 'WIND_DOWN_PLAN', title: 'Wind-Down Plan', required: true },
  { type: 'CLIENT_CONTRACT_TEMPLATE', title: 'Client Contract Template', required: false },
];

// ─── Service Functions ──────────────────────────────────────────────────────

export async function getPolicies(firmId: string, filters: PolicyFilters = {}) {
  const where: Prisma.PolicyDocumentWhereInput = { firmId };

  if (filters.type) {
    where.documentType = filters.type;
  }
  if (filters.status) {
    where.status = filters.status;
  }
  if (filters.overdue) {
    where.annualReviewDue = { lt: new Date() };
    where.status = 'CURRENT';
  }

  const policies = await prisma.policyDocument.findMany({
    where,
    orderBy: [{ documentType: 'asc' }, { version: 'desc' }],
    include: {
      uploader: { select: { id: true, name: true, email: true } },
    },
  });

  return policies.map((p) => ({
    id: p.id,
    documentType: p.documentType,
    title: p.title,
    version: p.version,
    status: p.status,
    boardApproved: p.boardApproved,
    boardApprovalDate: p.boardApprovalDate,
    annualReviewDue: p.annualReviewDue,
    reviewFrequencyMonths: p.reviewFrequencyMonths,
    lastReviewedAt: p.lastReviewedAt,
    lastReviewedBy: p.lastReviewedBy,
    hasTextContent: !!p.textContent,
    fileStoragePath: p.fileStoragePath,
    fileHash: p.fileHash,
    uploadedBy: p.uploader,
    createdAt: p.createdAt,
  }));
}

export async function uploadPolicy(
  firmId: string,
  userId: string,
  data: UploadPolicyData,
  fileBuffer: Buffer,
) {
  // Calculate file hash
  const fileHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

  // Auto-increment version: find latest version for this document type
  const latestVersion = await prisma.policyDocument.findFirst({
    where: { firmId, documentType: data.documentType },
    orderBy: { version: 'desc' },
    select: { version: true },
  });
  const newVersion = (latestVersion?.version ?? 0) + 1;

  // Mark previous CURRENT versions as SUPERSEDED
  await prisma.policyDocument.updateMany({
    where: { firmId, documentType: data.documentType, status: 'CURRENT' },
    data: { status: 'SUPERSEDED' },
  });

  // Calculate annualReviewDue based on reviewFrequencyMonths
  let annualReviewDue: Date | null = null;
  if (data.reviewFrequencyMonths) {
    annualReviewDue = new Date();
    annualReviewDue.setMonth(annualReviewDue.getMonth() + data.reviewFrequencyMonths);
  }

  // Store file - using local path convention; in production this would go to S3/MinIO
  const fileStoragePath = `policies/${firmId}/${data.documentType}_v${newVersion}_${Date.now()}.pdf`;

  const policy = await prisma.policyDocument.create({
    data: {
      firmId,
      documentType: data.documentType,
      title: data.title,
      version: newVersion,
      fileStoragePath,
      fileHash,
      boardApproved: data.boardApproved ?? false,
      boardApprovalDate: data.boardApprovalDate ? new Date(data.boardApprovalDate) : null,
      annualReviewDue,
      reviewFrequencyMonths: data.reviewFrequencyMonths ?? null,
      textContent: data.textContent ?? null,
      lastReviewedAt: new Date(),
      lastReviewedBy: userId,
      status: data.status ?? 'CURRENT',
      uploadedBy: userId,
    },
  });

  logger.info({ firmId, documentType: data.documentType, version: newVersion }, 'Policy document uploaded');

  return policy;
}

export async function getPolicyVersionHistory(firmId: string, documentType: PolicyDocumentType) {
  const versions = await prisma.policyDocument.findMany({
    where: { firmId, documentType },
    orderBy: { version: 'desc' },
    include: {
      uploader: { select: { id: true, name: true, email: true } },
    },
  });

  return versions.map((v) => ({
    id: v.id,
    version: v.version,
    title: v.title,
    status: v.status,
    boardApproved: v.boardApproved,
    boardApprovalDate: v.boardApprovalDate,
    annualReviewDue: v.annualReviewDue,
    reviewFrequencyMonths: v.reviewFrequencyMonths,
    lastReviewedAt: v.lastReviewedAt,
    lastReviewedBy: v.lastReviewedBy,
    fileHash: v.fileHash,
    uploadedBy: v.uploader,
    createdAt: v.createdAt,
  }));
}

export async function getRequiredDocumentsChecklist(firmId: string): Promise<ChecklistItem[]> {
  const checklist: ChecklistItem[] = [];

  for (const doc of REQUIRED_DOCUMENTS) {
    const latest = await prisma.policyDocument.findFirst({
      where: { firmId, documentType: doc.type },
      orderBy: { version: 'desc' },
      select: { status: true, annualReviewDue: true },
    });

    let status: ChecklistItem['status'];
    if (!latest) {
      status = 'MISSING';
    } else if (latest.status === 'DRAFT') {
      status = 'DRAFT';
    } else if (
      latest.status === 'CURRENT' &&
      latest.annualReviewDue &&
      latest.annualReviewDue < new Date()
    ) {
      status = 'OVERDUE';
    } else {
      status = 'PRESENT';
    }

    checklist.push({ type: doc.type, title: doc.title, status });
  }

  return checklist;
}

export async function getReviewAlerts(firmId: string) {
  const now = new Date();
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

  // Overdue reviews
  const overdue = await prisma.policyDocument.findMany({
    where: {
      firmId,
      status: 'CURRENT',
      annualReviewDue: { lt: now },
    },
    orderBy: { annualReviewDue: 'asc' },
    select: {
      id: true,
      documentType: true,
      title: true,
      version: true,
      annualReviewDue: true,
      lastReviewedAt: true,
    },
  });

  // Upcoming reviews (next 30 days)
  const upcoming = await prisma.policyDocument.findMany({
    where: {
      firmId,
      status: 'CURRENT',
      annualReviewDue: { gte: now, lte: thirtyDaysFromNow },
    },
    orderBy: { annualReviewDue: 'asc' },
    select: {
      id: true,
      documentType: true,
      title: true,
      version: true,
      annualReviewDue: true,
      lastReviewedAt: true,
    },
  });

  return {
    overdue: overdue.map((p) => ({
      ...p,
      daysOverdue: Math.ceil((now.getTime() - (p.annualReviewDue?.getTime() ?? now.getTime())) / 86400000),
    })),
    upcoming: upcoming.map((p) => ({
      ...p,
      daysUntilDue: Math.ceil(((p.annualReviewDue?.getTime() ?? now.getTime()) - now.getTime()) / 86400000),
    })),
    totalOverdue: overdue.length,
    totalUpcoming: upcoming.length,
  };
}

// ─── AI Chat with Policies ──────────────────────────────────────────────────

export async function chatWithPolicies(
  firmId: string,
  userId: string,
  sessionId: string,
  question: string,
  onChunk: (chunk: string) => void,
  onDone: (fullResponse: string, tokensUsed: number) => void,
  onError: (err: Error) => void,
) {
  try {
    if (!config.ANTHROPIC_API_KEY) {
      onError(new Error('AI policy chat is not configured — ANTHROPIC_API_KEY not set'));
      return;
    }

    // Gather all current policy texts for the firm
    const policies = await prisma.policyDocument.findMany({
      where: { firmId, status: 'CURRENT', textContent: { not: null } },
      select: { documentType: true, title: true, version: true, textContent: true },
    });

    if (policies.length === 0) {
      onError(new Error('No policy documents with extracted text found. Upload policies with text content to enable AI chat.'));
      return;
    }

    // Build policy context
    let policyContext = 'POLICY DOCUMENTS FOR THIS FIRM:\n\n';
    for (const p of policies) {
      policyContext += `--- ${p.title} (${p.documentType}, v${p.version}) ---\n`;
      policyContext += `${p.textContent}\n\n`;
    }

    const systemPrompt = `You are Safeheld's Policy AI Assistant. You help compliance officers understand, query, and interpret their firm's safeguarding policies and procedures.

${policyContext}

INSTRUCTIONS:
- Answer questions based ONLY on the policy documents provided above
- Always cite the specific document and section when referencing policy content
- If the answer is not found in the policies, say so clearly
- Suggest improvements or gaps when appropriate
- Be concise and practical
- Never fabricate policy content that doesn't exist in the documents
- Format responses clearly with headings and bullet points where appropriate`;

    // Save user message
    await prisma.aiConversation.create({
      data: { firmId, userId, sessionId, role: 'user', content: question, contextType: 'policy_library' },
    });

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
        max_tokens: 2048,
        stream: true,
        system: systemPrompt,
        messages: [{ role: 'user', content: question }],
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
      data: { firmId, userId, sessionId, role: 'assistant', content: fullResponse, contextType: 'policy_library', tokensUsed },
    });

    onDone(fullResponse, tokensUsed);
  } catch (err) {
    logger.error({ err, firmId }, 'Policy chat failed');
    onError(err instanceof Error ? err : new Error(String(err)));
  }
}

export async function getPolicyChatHistory(firmId: string, userId: string) {
  const messages = await prisma.aiConversation.findMany({
    where: { firmId, userId, contextType: 'policy_library' },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      sessionId: true,
      role: true,
      content: true,
      tokensUsed: true,
      createdAt: true,
    },
  });

  return messages;
}
