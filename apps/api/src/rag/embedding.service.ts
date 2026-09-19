import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface EmbeddingResult {
  vectors: number[][];
  model: string;
  inputTokens: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);

  constructor(private config: ConfigService) {}

  get enabled(): boolean {
    return !!this.config.get<string>('OPENAI_API_KEY');
  }

  /** Embed a batch of texts. Caller is responsible for redacting PII first. */
  async embed(texts: string[]): Promise<EmbeddingResult> {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured');
    const model = this.config.get<string>('OPENAI_EMBED_MODEL') ?? 'text-embedding-3-small';

    const res = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, input: texts }),
    });
    if (!res.ok) {
      this.logger.error(`OpenAI embeddings error: ${res.status}`);
      throw new Error('Embedding failed');
    }
    const data = (await res.json()) as {
      data: Array<{ index: number; embedding: number[] }>;
      usage?: { prompt_tokens?: number };
    };
    const vectors = [...data.data].sort((a, b) => a.index - b.index).map((d) => d.embedding);
    return { vectors, model, inputTokens: data.usage?.prompt_tokens ?? 0 };
  }
}
