import { config } from '../../config';
import { logger } from '../../utils/logger';

export interface ExtractedObligation {
  rule_description: string;
  source_article: string;
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  obligation_type: string;
  applies_to: string;
  threshold: string | null;
  deadline_type: string;
  confidence_score: number;
}

const SYSTEM_PROMPT = `You are a regulatory compliance expert. Extract every specific compliance obligation, requirement, threshold, deadline, and prohibition from the following regulatory text. For each requirement return JSON with: rule_description (precise, actionable), source_article (exact article/section reference), severity (CRITICAL for breach/enforcement risk, HIGH for material obligation, MEDIUM for procedural, LOW for guidance), obligation_type (CALCULATION/SEGREGATION/DOCUMENTATION/REPORTING/NOTIFICATION/MONITORING/GOVERNANCE), applies_to (which firm types this applies to), threshold (any specific number, percentage, or timeframe), deadline_type (ongoing/daily/weekly/monthly/annual/one-time), confidence_score (0-100: 90-100 explicit and unambiguous, 70-89 clear but requires interpretation, 50-69 inferred from context, below 50 uncertain). Return only a JSON array of obligations. No preamble.`;

/**
 * Extract regulatory obligations from a chunk of legislative text using Claude API.
 * Retries up to 3 times with exponential backoff on failure.
 */
export async function extractObligations(
  framework: string,
  chunk: string,
  chunkIndex: number,
  totalChunks: number
): Promise<ExtractedObligation[]> {
  if (!config.ANTHROPIC_API_KEY) {
    logger.warn('ANTHROPIC_API_KEY not configured — skipping AI extraction');
    return [];
  }

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
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
              content: `Framework: ${framework}\nChunk ${chunkIndex + 1} of ${totalChunks}\n\nRegulatory text:\n\n${chunk}`,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(`Anthropic API error ${response.status}: ${errBody.substring(0, 500)}`);
      }

      const data = await response.json() as { content?: Array<{ text?: string }> };
      const text = data.content?.[0]?.text || '';

      // Extract JSON array from response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        logger.warn({ framework, chunkIndex }, 'No JSON array in AI response');
        return [];
      }

      const obligations = JSON.parse(jsonMatch[0]) as ExtractedObligation[];

      logger.info({
        framework,
        chunkIndex,
        obligationsExtracted: obligations.length,
        attempt,
      }, 'Obligations extracted from chunk');

      return obligations;
    } catch (err) {
      lastError = err as Error;
      logger.warn({ err, framework, chunkIndex, attempt }, `Extraction attempt ${attempt} failed`);

      if (attempt < maxRetries) {
        // Exponential backoff: 2s, 8s, 32s
        const delay = Math.pow(4, attempt) * 500;
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  logger.error({ framework, chunkIndex, error: lastError?.message }, 'All extraction attempts failed');
  return [];
}
