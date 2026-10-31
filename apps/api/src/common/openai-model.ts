import { ConfigService } from '@nestjs/config';

/** Chat model for every OpenAI completion call; override per deploy with OPENAI_MODEL_MAIN. */
export function chatModel(config: ConfigService): string {
  return config.get<string>('OPENAI_MODEL_MAIN') ?? 'gpt-4o-mini';
}
