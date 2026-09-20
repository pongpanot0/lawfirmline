import { Injectable, Logger } from '@nestjs/common';
import { EmbeddingService } from './embedding.service';

export interface RelevanceFile {
  /** Short display label (filename) put in front of each selected excerpt. */
  label: string;
  /** Already-redacted text — embeddings leave the PII boundary. */
  text: string;
}

export interface RelevanceSelection {
  /** Labeled excerpts, most relevant first, within the char budget. */
  text: string;
  /** Labels of files that contributed only part of their text. */
  truncatedLabels: string[];
}

// Finer than ChunkingService's 4000-char chunks: the intake prompt budget is
// ~6000 chars, so selection needs pieces small enough to mix several files.
const CHUNK_CHARS = 1200;
const OVERLAP_CHARS = 150;
const MAX_CHUNKS_PER_FILE = 40;
const EMBED_BATCH = 64;

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/**
 * Ephemeral RAG for one-shot analyses (intake): chunk + embed in memory, pick
 * the chunks most similar to the query, no persistence. Case Q&A keeps using
 * the pgvector-backed RagService; an intake analysis is a single paid action
 * over ≤10 files, so re-embedding per run is cheaper than another chunk table.
 */
@Injectable()
export class RelevanceService {
  private readonly logger = new Logger(RelevanceService.name);

  constructor(private embedding: EmbeddingService) {}

  splitText(text: string): string[] {
    const chunks: string[] = [];
    let start = 0;
    while (start < text.length && chunks.length < MAX_CHUNKS_PER_FILE) {
      const piece = text.slice(start, start + CHUNK_CHARS).trim();
      if (piece) chunks.push(piece);
      start += CHUNK_CHARS - OVERLAP_CHARS;
    }
    return chunks;
  }

  /**
   * Most relevant excerpts across all files, within `budgetChars`. Returns
   * null when embeddings are disabled or the call fails — the caller keeps
   * its non-RAG fallback.
   */
  async selectRelevant(
    files: RelevanceFile[],
    query: string,
    budgetChars: number,
  ): Promise<RelevanceSelection | null> {
    if (!this.embedding.enabled || !query.trim()) return null;
    const chunks = files.flatMap((file) =>
      this.splitText(file.text).map((content) => ({ label: file.label, content })),
    );
    if (!chunks.length) return null;

    try {
      const texts = [query, ...chunks.map((c) => c.content)];
      const vectors: number[][] = [];
      for (let i = 0; i < texts.length; i += EMBED_BATCH) {
        const result = await this.embedding.embed(texts.slice(i, i + EMBED_BATCH));
        vectors.push(...result.vectors);
      }
      const queryVector = vectors[0];
      const scored = chunks
        .map((chunk, i) => ({ ...chunk, score: cosine(queryVector, vectors[i + 1]) }))
        .sort((a, b) => b.score - a.score);

      const picked: typeof scored = [];
      let used = 0;
      for (const chunk of scored) {
        const cost = chunk.content.length + chunk.label.length + 20;
        if (used + cost > budgetChars) continue;
        picked.push(chunk);
        used += cost;
      }
      if (!picked.length) return null;

      const pickedLabels = new Set(picked.map((c) => c.label));
      const chunkCounts = new Map<string, number>();
      for (const c of chunks) chunkCounts.set(c.label, (chunkCounts.get(c.label) ?? 0) + 1);
      const truncatedLabels = [...pickedLabels].filter(
        (label) => picked.filter((c) => c.label === label).length < (chunkCounts.get(label) ?? 0),
      );

      return {
        text: picked
          .map((chunk) => `[ไฟล์: ${chunk.label}]\n${chunk.content}`)
          .join('\n\n'),
        truncatedLabels,
      };
    } catch (err) {
      this.logger.warn(`Relevance selection failed, falling back: ${err}`);
      return null;
    }
  }
}
