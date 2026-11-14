import type { ConfigService } from '@nestjs/config';

/** Chat model for every OpenAI completion call; override per deploy with OPENAI_MODEL_MAIN. */
export function chatModel(config: ConfigService, overrideKey?: string): string {
  return (overrideKey ? config.get<string>(overrideKey) : undefined)
    ?? config.get<string>('OPENAI_MODEL_MAIN') ?? 'gpt-6-luna';
}

interface ChatBody {
  model?: string;
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  max_completion_tokens?: number;
  reasoning_effort?: string;
  [key: string]: unknown;
}

export function openAiChatBody(config: ConfigService, body: ChatBody): ChatBody {
  const request = { ...body, model: body.model ?? chatModel(config) };
  if (request.model.startsWith('gpt-6')) {
    delete request.temperature;
    delete request.top_p;
    // Completion tokens include reasoning; leave 2,000 beyond the visible-output budget.
    request.max_completion_tokens = Math.max(body.max_completion_tokens ?? 0, (body.max_tokens ?? 6000) + 2000);
    delete request.max_tokens;
    // Chat Completions rejects function tools with any reasoning effort above 'none' on gpt-6 models.
    request.reasoning_effort = Array.isArray(body.tools) && body.tools.length ? 'none' : 'low';
  }
  return request;
}
