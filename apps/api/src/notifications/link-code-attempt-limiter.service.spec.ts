import { LinkCodeAttemptLimiterService } from './link-code-attempt-limiter.service';

describe('LinkCodeAttemptLimiterService', () => {
  let service: LinkCodeAttemptLimiterService;

  beforeEach(() => {
    service = new LinkCodeAttemptLimiterService();
  });

  it('allows the first attempt', () => {
    expect(service.recordAttempt('U123')).toBe(true);
  });

  it('allows up to 5 attempts within the window', () => {
    for (let i = 0; i < 5; i++) {
      expect(service.recordAttempt('U123')).toBe(true);
    }
  });

  it('denies the 6th attempt within the window', () => {
    for (let i = 0; i < 5; i++) service.recordAttempt('U123');
    expect(service.recordAttempt('U123')).toBe(false);
  });

  it('tracks attempts independently per lineUserId', () => {
    for (let i = 0; i < 5; i++) service.recordAttempt('U123');
    expect(service.recordAttempt('U456')).toBe(true);
  });

  it('reset clears the counter for that lineUserId', () => {
    for (let i = 0; i < 5; i++) service.recordAttempt('U123');
    service.reset('U123');
    expect(service.recordAttempt('U123')).toBe(true);
  });
});
