import { ConfigService } from '@nestjs/config';
import { chatModel, openAiChatBody } from './openai-model';

const config = (values: Record<string, string> = {}) => ({ get: (key: string) => values[key] }) as ConfigService;

describe('OpenAI chat body', () => {
  it('defaults to luna, keeping JSON, messages and tools while reserving reasoning tokens', () => {
    const body = Object.freeze({
      temperature: 0.2, top_p: 0.9, max_tokens: 4000,
      response_format: { type: 'json_object' }, messages: [{ role: 'user', content: 'JSON please' }], tools: [],
    });
    expect(chatModel(config())).toBe('gpt-6-luna');
    expect(openAiChatBody(config(), body)).toEqual({
      model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 6000,
      response_format: body.response_format, messages: body.messages, tools: body.tools,
    });
    expect(body.max_tokens).toBe(4000);
  });

  it('uses 8,000 completion tokens when no visible-output budget was set', () => {
    expect(openAiChatBody(config(), {})).toEqual({ model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 8000 });
  });

  it('applies reasoning rules to every gpt-6 id and preserves a larger completion budget', () => {
    expect(openAiChatBody(config({ OPENAI_MODEL_MAIN: 'gpt-6-other' }), {
      temperature: 0, top_p: 1, max_tokens: 10000, max_completion_tokens: 16000, reasoning_effort: 'high',
    })).toEqual({ model: 'gpt-6-other', reasoning_effort: 'low', max_completion_tokens: 16000 });
  });

  it('keeps legacy sampling and token limits when switching back by env', () => {
    const body = { temperature: 0, top_p: 1, max_tokens: 500, response_format: { type: 'json_schema' } };
    expect(openAiChatBody(config({ OPENAI_MODEL_MAIN: 'gpt-4o-mini' }), body))
      .toEqual({ ...body, model: 'gpt-4o-mini' });
  });

  it('honors explicit models and the OCR override before the main model', () => {
    const cfg = config({ OPENAI_MODEL_MAIN: 'gpt-4o', OPENAI_OCR_MODEL: 'gpt-4o-mini' });
    expect(chatModel(cfg, 'OPENAI_OCR_MODEL')).toBe('gpt-4o-mini');
    expect(chatModel(config({ OPENAI_MODEL_MAIN: 'gpt-4o' }), 'OPENAI_OCR_MODEL')).toBe('gpt-4o');
    expect(openAiChatBody(cfg, { model: 'gpt-6-luna', temperature: 0 })).toEqual({
      model: 'gpt-6-luna', reasoning_effort: 'low', max_completion_tokens: 8000,
    });
  });
});
