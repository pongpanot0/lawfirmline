import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConversationSession } from './line-conversation.types';

const SESSION_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class LineConversationStoreService {
  private readonly logger = new Logger(LineConversationStoreService.name);
  private readonly sessions = new Map<string, ConversationSession>();

  start(session: Omit<ConversationSession, 'createdAt' | 'updatedAt'>): ConversationSession {
    const now = Date.now();
    const full: ConversationSession = { ...session, createdAt: now, updatedAt: now };
    this.sessions.set(session.lineUserId, full);
    return full;
  }

  get(lineUserId: string): ConversationSession | undefined {
    const session = this.sessions.get(lineUserId);
    if (!session) return undefined;
    if (Date.now() - session.updatedAt > SESSION_TTL_MS) {
      this.sessions.delete(lineUserId);
      return undefined;
    }
    return session;
  }

  update(lineUserId: string, patch: Partial<ConversationSession>): ConversationSession | undefined {
    const existing = this.get(lineUserId);
    if (!existing) return undefined;
    const updated: ConversationSession = { ...existing, ...patch, updatedAt: Date.now() };
    this.sessions.set(lineUserId, updated);
    return updated;
  }

  clear(lineUserId: string): void {
    this.sessions.delete(lineUserId);
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  pruneExpired(): void {
    const now = Date.now();
    let pruned = 0;
    for (const [key, session] of this.sessions.entries()) {
      if (now - session.updatedAt > SESSION_TTL_MS) {
        this.sessions.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) this.logger.debug(`Pruned ${pruned} expired LINE conversation session(s)`);
  }
}
