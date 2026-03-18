import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface AffectedRule {
  rule_code: string;
  framework: string;
  change_type: 'UPDATE' | 'CREATE' | 'DEPRECATE';
  proposed_text: string;
  rationale: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  effective_date?: string;
}

export interface AIAnalysisResult {
  summary: string;
  affected_rules: AffectedRule[];
  new_rules_needed: boolean;
  overall_impact: string;
}

const SYSTEM_PROMPT = `You are a regulatory compliance expert specialising in financial services regulation. Analyse the following regulatory update and determine:

1) Which Safeheld framework rules are affected (use rule codes like PS25-001, CASS7-001, MICA-001, GENIUS-001, SRA-001, GC-001, INS-001, CDS-001, DORA-001, PS213-001, 15C33-001, CD-001, PSD2-001, CASS5-001, CASS6-001, CASS10-001)
2) What specific changes are required to each affected rule
3) Severity of the change (CRITICAL/HIGH/MEDIUM/LOW)
4) Effective date of the change if stated
5) Whether any new rules need to be created

Return structured JSON only with this schema:
{
  "summary": "Brief summary of the regulatory change",
  "affected_rules": [
    {
      "rule_code": "PS25-001",
      "framework": "PS25",
      "change_type": "UPDATE|CREATE|DEPRECATE",
      "proposed_text": "New rule description text",
      "rationale": "Why this change is needed",
      "severity": "CRITICAL|HIGH|MEDIUM|LOW",
      "effective_date": "YYYY-MM-DD or null"
    }
  ],
  "new_rules_needed": false,
  "overall_impact": "Brief assessment of overall impact"
}`;

/**
 * Send regulatory content to Claude API for analysis.
 * Falls back to a structured placeholder if API key is not configured.
 */
export async function analyseRegulatoryChange(
  framework: string,
  content: string
): Promise<AIAnalysisResult> {
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not configured — using placeholder analysis');
    return {
      summary: `Content change detected on ${framework} regulatory source. Manual review required.`,
      affected_rules: [],
      new_rules_needed: false,
      overall_impact: 'Unable to perform AI analysis — API key not configured. Manual review required.',
    };
  }

  // Truncate content to ~100K chars to fit within context
  const truncatedContent = content.length > 100_000
    ? content.substring(0, 100_000) + '\n\n[Content truncated]'
    : content;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content: `Framework: ${framework}\n\nRegulatory source content:\n\n${truncatedContent}`,
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`Anthropic API error ${response.status}: ${errBody}`);
    }

    const data = await response.json() as { content?: Array<{ text?: string }> };
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]) as AIAnalysisResult;

    logger.info({
      framework,
      affectedRules: parsed.affected_rules?.length || 0,
      newRulesNeeded: parsed.new_rules_needed,
    }, 'AI regulatory analysis completed');

    return parsed;
  } catch (err) {
    logger.error({ err, framework }, 'AI analysis failed');

    // Return safe fallback
    return {
      summary: `Content change detected on ${framework} regulatory source. AI analysis failed — manual review required.`,
      affected_rules: [],
      new_rules_needed: false,
      overall_impact: `AI analysis error: ${(err as Error).message}. Manual review required.`,
    };
  }
}
