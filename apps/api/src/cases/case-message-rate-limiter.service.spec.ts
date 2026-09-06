import { CaseMessageRateLimiterService } from './case-message-rate-limiter.service';

describe('CaseMessageRateLimiterService', () => {
  let service: CaseMessageRateLimiterService;

  beforeEach(() => {
    service = new CaseMessageRateLimiterService();
  });

  it('allows the first attempt', () => {
    expect(service.recordSend('user-1')).toBe(true);
  });

  it('allows up to 10 sends within the window', () => {
    for (let i = 0; i < 10; i++) {
      expect(service.recordSend('user-1')).toBe(true);
    }
  });

  it('denies the 11th send within the window', () => {
    for (let i = 0; i < 10; i++) service.recordSend('user-1');
    expect(service.recordSend('user-1')).toBe(false);
  });

  it('tracks sends independently per key', () => {
    for (let i = 0; i < 10; i++) service.recordSend('user-1');
    expect(service.recordSend('user-2')).toBe(true);
  });
});
