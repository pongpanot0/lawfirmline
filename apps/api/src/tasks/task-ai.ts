export type TaskAiResult =
  | { status: 'clear' | 'insufficient' }
  | { status: 'blocker'; sourceCommentId: string; quote: string; blocker: string; title: string; description: string };

export const TASK_AI_RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'task_update_analysis', strict: true,
    schema: {
      type: 'object', additionalProperties: false,
      properties: {
        status: { type: 'string', enum: ['blocker', 'clear', 'insufficient'] },
        ...Object.fromEntries(['sourceCommentId', 'quote', 'blocker', 'title', 'description'].map((key) => [key, { type: ['string', 'null'] }])),
      },
      required: ['status', 'sourceCommentId', 'quote', 'blocker', 'title', 'description'],
    },
  },
};

export function parseTaskAiResult(raw: string, comments: Array<{ id: string; body: string }>): TaskAiResult {
  let value: Record<string, unknown>;
  try {
    value = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { status: 'insufficient' };
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { status: 'insufficient' };
  if (value.status === 'clear') return { status: 'clear' };
  if (value.status !== 'blocker') return { status: 'insufficient' };
  const fields = ['sourceCommentId', 'quote', 'blocker', 'title', 'description'] as const;
  if (fields.some((key) => typeof value[key] !== 'string' || !(value[key] as string).trim())) return { status: 'insufficient' };
  const sourceCommentId = (value.sourceCommentId as string).trim();
  const quote = (value.quote as string).trim();
  const source = comments.find((comment) => comment.id === sourceCommentId);
  if (!source || quote.length > 500 || !source.body.includes(quote)) return { status: 'insufficient' };
  return {
    status: 'blocker', sourceCommentId, quote,
    blocker: (value.blocker as string).trim().slice(0, 300),
    title: (value.title as string).trim().slice(0, 200),
    description: (value.description as string).trim().slice(0, 2000),
  };
}
