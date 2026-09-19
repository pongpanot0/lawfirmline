import { Injectable } from '@nestjs/common';

export interface TextChunk {
  chunkIndex: number;
  pageStart: number | null;
  pageEnd: number | null;
  content: string;
}

const MAX_CHUNK_CHARS = 4000;
const OVERLAP_CHARS = 400;

/**
 * Page-aware chunking of text produced by DocumentIntelligenceService.extractText(),
 * which labels pages with standalone `[หน้า N]` lines. Each chunk records the page
 * range it spans so answers can cite document + page.
 */
@Injectable()
export class ChunkingService {
  chunk(text: string): TextChunk[] {
    const lines = text.split('\n');
    const chunks: TextChunk[] = [];
    let current = '';
    let pageStart: number | null = null;
    let pageEnd: number | null = null;
    let page: number | null = null;

    const flush = () => {
      const content = current.trim();
      if (content) {
        chunks.push({ chunkIndex: chunks.length, pageStart, pageEnd, content });
      }
      // ponytail: char-based overlap, token-accurate splitting if retrieval quality demands it
      current = content ? content.slice(-OVERLAP_CHARS) : '';
      pageStart = page;
      pageEnd = page;
    };

    for (const line of lines) {
      const marker = /^\[หน้า (\d+)\]\s*$/.exec(line.trim());
      if (marker) {
        page = parseInt(marker[1], 10);
        if (pageStart === null) pageStart = page;
        pageEnd = page;
        continue;
      }
      if (current.length + line.length + 1 > MAX_CHUNK_CHARS) flush();
      current += (current ? '\n' : '') + line;
      if (page !== null) pageEnd = page;
      if (pageStart === null && page !== null) pageStart = page;
    }
    const content = current.trim();
    if (content) chunks.push({ chunkIndex: chunks.length, pageStart, pageEnd, content });
    return chunks;
  }
}
