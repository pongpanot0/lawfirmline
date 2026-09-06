import { Injectable } from '@nestjs/common';

const WINDOW_MS = 60 * 1000;
const MAX_MESSAGES = 10;

@Injectable()
export class CaseMessageRateLimiterService {
  private sends = new Map<string, number[]>();

  recordSend(key: string): boolean {
    const now = Date.now();
    const existing = (this.sends.get(key) ?? []).filter((t) => now - t < WINDOW_MS);

    if (existing.length >= MAX_MESSAGES) {
      this.sends.set(key, existing);
      return false;
    }

    existing.push(now);
    this.sends.set(key, existing);
    return true;
  }
}
