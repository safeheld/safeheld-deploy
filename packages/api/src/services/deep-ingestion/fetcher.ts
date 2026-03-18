import crypto from 'crypto';
import { logger } from '../../utils/logger';
import type { LegislativeSource } from './sources';

/**
 * Fetch content from a URL. Handles both PDF and HTML sources.
 */
export async function fetchDocument(source: LegislativeSource): Promise<{
  content: string;
  hash: string;
  pageCount: number | null;
}> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(source.sourceUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'SafeheldDeepIngestion/1.0 (compliance verification; contact: admin@safeheld.com)',
        'Accept': source.type === 'pdf' ? 'application/pdf' : 'text/html,application/xhtml+xml,text/plain',
      },
    });

    if (!response.ok) {
      // Try fallback URL if available
      if (source.fallbackUrl) {
        logger.warn({ url: source.sourceUrl, status: response.status }, 'Primary URL failed, trying fallback');
        return fetchHtmlFallback(source.fallbackUrl);
      }
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    if (source.type === 'pdf') {
      return extractPdf(response);
    } else {
      return extractHtml(response);
    }
  } catch (err) {
    // Try fallback on any error
    if (source.fallbackUrl) {
      logger.warn({ err, url: source.sourceUrl }, 'Primary fetch failed, trying fallback');
      try {
        return await fetchHtmlFallback(source.fallbackUrl);
      } catch (fallbackErr) {
        logger.error({ fallbackErr, url: source.fallbackUrl }, 'Fallback also failed');
      }
    }
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

async function extractPdf(response: Response): Promise<{ content: string; hash: string; pageCount: number | null }> {
  const buffer = Buffer.from(await response.arrayBuffer());
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');

  try {
    // pdf-parse v2.x exports a PDFParse class, not a callable function
    const mod = await import('pdf-parse');
    const PDFParse = (mod as any).PDFParse || (mod as any).default?.PDFParse || (mod as any).default;

    if (typeof PDFParse === 'function' && PDFParse.prototype) {
      // v2.x class-based API
      const parser = new PDFParse({ data: buffer });
      const result = await parser.getText();
      const info = await parser.getInfo().catch(() => ({})) as any;
      return {
        content: result?.text || '',
        hash,
        pageCount: info?.numPages || info?.numpages || null,
      };
    }

    // v1.x fallback — callable function
    const parseFn = typeof mod === 'function' ? mod : (mod as any).default;
    if (typeof parseFn === 'function') {
      const data = await parseFn(buffer);
      return {
        content: data.text || '',
        hash,
        pageCount: data.numpages || null,
      };
    }

    throw new Error('pdf-parse module: no compatible API found');
  } catch (err) {
    logger.warn({ err: (err as Error).message }, 'PDF parsing unavailable — attempting text extraction from binary');
    // Basic text extraction from PDF binary as fallback
    const text = extractTextFromPdfBuffer(buffer);
    return {
      content: text || `[PDF document: ${(buffer.length / 1024).toFixed(0)}KB — text extraction limited]`,
      hash,
      pageCount: null,
    };
  }
}

/**
 * Basic text extraction from PDF buffer by finding text streams.
 * This is a minimal fallback when pdf-parse is unavailable.
 */
function extractTextFromPdfBuffer(buffer: Buffer): string {
  const str = buffer.toString('latin1');
  const textParts: string[] = [];

  // Extract text between BT and ET markers (PDF text objects)
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  while ((match = btEtRegex.exec(str)) !== null) {
    const block = match[1];
    // Extract text from Tj and TJ operators
    const tjRegex = /\(([^)]*)\)\s*Tj/g;
    let tjMatch;
    while ((tjMatch = tjRegex.exec(block)) !== null) {
      textParts.push(tjMatch[1]);
    }
  }

  return textParts.join(' ').replace(/\s+/g, ' ').trim();
}

async function extractHtml(response: Response): Promise<{ content: string; hash: string; pageCount: number | null }> {
  // Limit response to 2MB to prevent OOM on large pages
  const MAX_HTML_SIZE = 2 * 1024 * 1024;
  const buffer = await response.arrayBuffer();
  const rawBytes = Buffer.from(buffer);
  const html = rawBytes.length > MAX_HTML_SIZE
    ? rawBytes.subarray(0, MAX_HTML_SIZE).toString('utf-8')
    : rawBytes.toString('utf-8');
  const hash = crypto.createHash('sha256').update(rawBytes).digest('hex');

  // Strip HTML using safe iterative approach (avoids catastrophic backtracking)
  const text = stripHtmlSafe(html);

  return { content: text, hash, pageCount: null };
}

/**
 * Safely strip HTML tags and extract text content.
 * Uses iterative tag removal instead of complex regex to avoid
 * catastrophic backtracking on large/complex HTML documents.
 */
function stripHtmlSafe(html: string): string {
  // Remove block elements we don't want (script, style, nav, header, footer)
  // Use simple start/end tag matching with indexOf — no regex backtracking
  const tagsToRemove = ['script', 'style', 'nav', 'header', 'footer', 'noscript', 'svg'];

  let result = html;
  for (const tag of tagsToRemove) {
    let output = '';
    let pos = 0;
    while (pos < result.length) {
      const openIdx = result.toLowerCase().indexOf(`<${tag}`, pos);
      if (openIdx === -1) {
        output += result.substring(pos);
        break;
      }
      output += result.substring(pos, openIdx);
      const closeTag = `</${tag}>`;
      const closeIdx = result.toLowerCase().indexOf(closeTag, openIdx);
      if (closeIdx === -1) {
        // No closing tag — skip just the opening tag
        const tagEnd = result.indexOf('>', openIdx);
        pos = tagEnd === -1 ? result.length : tagEnd + 1;
      } else {
        pos = closeIdx + closeTag.length;
      }
    }
    result = output;
  }

  // Strip remaining HTML tags
  result = result.replace(/<[^>]+>/g, ' ');

  // Decode common HTML entities
  result = result
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, n) => String.fromCharCode(parseInt(n, 16)));

  // Collapse whitespace
  return result.replace(/\s+/g, ' ').trim();
}

async function fetchHtmlFallback(url: string): Promise<{ content: string; hash: string; pageCount: number | null }> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'SafeheldDeepIngestion/1.0',
      'Accept': 'text/html,application/xhtml+xml,text/plain',
    },
  });

  if (!response.ok) {
    throw new Error(`Fallback HTTP ${response.status}: ${response.statusText}`);
  }

  return extractHtml(response);
}

/**
 * Split content into chunks with overlap for context preservation.
 * Targets ~4000 tokens per chunk (~16000 chars), 200 token overlap (~800 chars).
 */
export function chunkContent(content: string, maxChars = 16000, overlapChars = 800): string[] {
  if (content.length <= maxChars) return [content];

  const chunks: string[] = [];
  let start = 0;

  while (start < content.length) {
    let end = Math.min(start + maxChars, content.length);

    // Try to break at a sentence boundary
    if (end < content.length) {
      const lastPeriod = content.lastIndexOf('. ', end);
      const lastNewline = content.lastIndexOf('\n', end);
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > start + maxChars * 0.7) {
        end = breakPoint + 1;
      }
    }

    chunks.push(content.substring(start, end));
    start = end - overlapChars;
    if (start < 0) start = 0;
    if (start >= content.length) break;
  }

  return chunks;
}
