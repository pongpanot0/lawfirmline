import type { SecretaryCard } from '@lawfirm/shared';

export interface SecretaryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function secretaryMessages(history: readonly SecretaryMessage[]): SecretaryMessage[] {
  const last = history.at(-1);
  if (last?.role !== 'user' || !last.content.trim()) throw new Error('กรุณาพิมพ์หรือพูดคำถามก่อนส่ง');
  return history.slice(-10).map(({ role, content }) => ({ role, content }));
}

export function secretaryCardPath(card: SecretaryCard): string | null {
  return card.type === 'document' ? null : `/${card.type}/${encodeURIComponent(card.id)}`;
}
