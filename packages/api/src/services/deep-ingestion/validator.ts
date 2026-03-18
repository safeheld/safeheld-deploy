import { prisma } from '../../utils/prisma';
import { logger } from '../../utils/logger';
import type { ExtractedObligation } from './extractor';
import { FRAMEWORK_CODE_PREFIX } from './sources';

export interface ValidationResult {
  ruleCode: string | null;
  validationStatus: 'VERIFIED' | 'UPDATED' | 'CREATED' | 'UNVERIFIED';
  sourceArticle: string;
  extractedObligation: string;
  confidenceScore: number;
  detail: string;
}

/**
 * Validate extracted obligations against existing framework rules.
 * Returns validation results for each obligation plus checks for unmatched existing rules.
 */
export async function validateObligations(
  framework: string,
  documentId: string,
  obligations: ExtractedObligation[]
): Promise<ValidationResult[]> {
  // Load all existing rules for frameworks that map to this source framework
  const frameworkPrefixes = getFrameworkPrefixes(framework);
  const existingRules = await prisma.frameworkRule.findMany({
    where: {
      framework: { in: frameworkPrefixes },
      active: true,
    },
  });

  const results: ValidationResult[] = [];
  const matchedRuleCodes = new Set<string>();

  for (const obligation of obligations) {
    const match = findBestMatch(obligation, existingRules);

    if (match) {
      matchedRuleCodes.add(match.ruleCode);

      // Check if rule description needs updating
      const descSimilarity = textSimilarity(obligation.rule_description, match.ruleDescription);

      if (descSimilarity > 0.7) {
        results.push({
          ruleCode: match.ruleCode,
          validationStatus: 'VERIFIED',
          sourceArticle: obligation.source_article,
          extractedObligation: obligation.rule_description,
          confidenceScore: obligation.confidence_score,
          detail: `Rule verified against ${obligation.source_article}. Similarity: ${(descSimilarity * 100).toFixed(0)}%`,
        });
      } else {
        // Rule exists but description materially differs — update if high confidence
        if (obligation.confidence_score >= 70) {
          await prisma.frameworkRule.update({
            where: { id: match.id },
            data: {
              ruleDescription: obligation.rule_description,
              sourceArticle: obligation.source_article,
              version: match.version + 1,
            },
          });

          results.push({
            ruleCode: match.ruleCode,
            validationStatus: 'UPDATED',
            sourceArticle: obligation.source_article,
            extractedObligation: obligation.rule_description,
            confidenceScore: obligation.confidence_score,
            detail: `Rule updated. Previous: "${match.ruleDescription.substring(0, 100)}..." → New: "${obligation.rule_description.substring(0, 100)}..."`,
          });
        } else {
          results.push({
            ruleCode: match.ruleCode,
            validationStatus: 'UNVERIFIED',
            sourceArticle: obligation.source_article,
            extractedObligation: obligation.rule_description,
            confidenceScore: obligation.confidence_score,
            detail: `Low confidence update — requires admin review. Similarity: ${(descSimilarity * 100).toFixed(0)}%`,
          });
        }
      }
    } else {
      // No matching rule — create new if high confidence
      if (obligation.confidence_score >= 70) {
        const newCode = await generateRuleCode(framework);

        await prisma.frameworkRule.create({
          data: {
            framework: frameworkPrefixes[0],
            ruleCode: newCode,
            ruleName: obligation.rule_description.substring(0, 100),
            ruleDescription: obligation.rule_description,
            severity: obligation.severity,
            sourceRegulation: `${framework} — Deep Ingestion`,
            sourceArticle: obligation.source_article,
            effectiveFrom: new Date(),
            version: 1,
          },
        });

        results.push({
          ruleCode: newCode,
          validationStatus: 'CREATED',
          sourceArticle: obligation.source_article,
          extractedObligation: obligation.rule_description,
          confidenceScore: obligation.confidence_score,
          detail: `New rule created: ${newCode}`,
        });
      } else {
        results.push({
          ruleCode: null,
          validationStatus: 'UNVERIFIED',
          sourceArticle: obligation.source_article,
          extractedObligation: obligation.rule_description,
          confidenceScore: obligation.confidence_score,
          detail: 'New obligation with low confidence — requires admin review before rule creation',
        });
      }
    }
  }

  // Check for existing rules that had no matching obligation
  for (const rule of existingRules) {
    if (!matchedRuleCodes.has(rule.ruleCode)) {
      results.push({
        ruleCode: rule.ruleCode,
        validationStatus: 'UNVERIFIED',
        sourceArticle: rule.sourceArticle,
        extractedObligation: rule.ruleDescription,
        confidenceScore: 0,
        detail: 'Existing rule not found in source legislation — may be outdated or from a different source document',
      });
    }
  }

  // Persist validation results
  for (const result of results) {
    await prisma.ingestionValidationResult.create({
      data: {
        documentId,
        framework: frameworkPrefixes[0],
        ruleCode: result.ruleCode,
        validationStatus: result.validationStatus,
        sourceArticle: result.sourceArticle,
        extractedObligation: result.extractedObligation,
        confidenceScore: result.confidenceScore,
        detail: result.detail,
      },
    });
  }

  return results;
}

function getFrameworkPrefixes(sourceFramework: string): string[] {
  const map: Record<string, string[]> = {
    PS25: ['PS25'],
    CASS: ['CASS5', 'CASS6', 'CASS7', 'CASS10'],
    CD: ['CD'],
    PS213: ['PS213'],
    MICA: ['MICA'],
    DORA: ['DORA'],
    PSD2: ['PSD2'],
    GENIUS: ['GENIUS'],
    SRA: ['SRA'],
    GC: ['GC'],
    '15C33': ['15C33'],
    CDS: ['CDS'],
    INS: ['INS'],
  };
  return map[sourceFramework] || [sourceFramework];
}

function findBestMatch(
  obligation: ExtractedObligation,
  rules: Array<{ id: string; ruleCode: string; ruleDescription: string; sourceArticle: string }>
): { id: string; ruleCode: string; ruleDescription: string; version: number } | null {
  let bestMatch: any = null;
  let bestScore = 0;

  for (const rule of rules) {
    // Check article reference match first (strong signal)
    const articleMatch = obligation.source_article &&
      rule.sourceArticle &&
      normalizeArticle(obligation.source_article) === normalizeArticle(rule.sourceArticle);

    // Check text similarity
    const similarity = textSimilarity(obligation.rule_description, rule.ruleDescription);

    const score = (articleMatch ? 0.4 : 0) + similarity * 0.6;

    if (score > bestScore && score > 0.35) {
      bestScore = score;
      bestMatch = rule;
    }
  }

  return bestMatch;
}

function normalizeArticle(article: string): string {
  return article.toLowerCase().replace(/\s+/g, '').replace(/[^a-z0-9.()]/g, '');
}

/**
 * Simple text similarity using word overlap (Jaccard-like).
 */
function textSimilarity(a: string, b: string): number {
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 3));

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersection++;
  }

  const union = wordsA.size + wordsB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Generate next rule code for a framework by finding the highest existing number.
 */
async function generateRuleCode(framework: string): Promise<string> {
  const prefix = FRAMEWORK_CODE_PREFIX[framework] || framework;

  const existing = await prisma.frameworkRule.findMany({
    where: { ruleCode: { startsWith: prefix } },
    select: { ruleCode: true },
    orderBy: { ruleCode: 'desc' },
  });

  let maxNum = 0;
  for (const rule of existing) {
    const match = rule.ruleCode.match(/-(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) maxNum = num;
    }
  }

  return `${prefix}-${String(maxNum + 1).padStart(3, '0')}`;
}
