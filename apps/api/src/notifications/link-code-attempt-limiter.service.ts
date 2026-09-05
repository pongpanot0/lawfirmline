import { Injectable } from '@nestjs/common';

const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

@Injectable()
export class LinkCodeAttemptLimiterService {
  private attempts = new Map<string, number[]>();

  recordAttempt(lineUserId: string): boolean {
    const now = Date.now();
    const existing = (this.attempts.get(lineUserId) ?? []).filter(
      (t) => now - t < WINDOW_MS,
    );

    if (existing.length >= MAX_ATTEMPTS) {
      this.attempts.set(lineUserId, existing);
      return false;
    }

    existing.push(now);
    this.attempts.set(lineUserId, existing);
    return true;
  }

  reset(lineUserId: string): void {
    this.attempts.delete(lineUserId);
  }
}
