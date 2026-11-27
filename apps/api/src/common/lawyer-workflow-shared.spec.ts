import { answerDaysFor, answerDueDate, effectiveIntakeDecision, IntakeDecision, ServiceMethod } from '@lawfirm/shared';

describe('shared lawyer workflow rules', () => {
  it.each([
    ['PERSONAL', 15, '2026-12-13'],
    ['POSTED', 30, '2026-12-28'],
    ['POSTED_ABROAD', 60, '2027-01-27'],
  ] as const)('counts %s as %i calendar days on the Bangkok calendar', (method, days, day) => {
    expect(answerDaysFor(ServiceMethod[method])).toBe(days);
    // Already 28 November in Bangkok, although it is 27 November in UTC.
    const due = answerDueDate(new Date('2026-11-27T18:00:00Z'), ServiceMethod[method]);
    expect(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Bangkok' }).format(due)).toBe(day);
  });

  it.each([
    ['PENDING', 'PENDING'],
    ['FILE', 'SEND_NOTICE'],
    ['DROP', 'DO_NOT_FILE'],
    [undefined, 'PENDING'],
    ['ข้อความเดิม', 'PENDING'],
  ] as const)('resolves NOT_WORTH_FILING with %s to %s', (clientDecision, decision) => {
    expect(effectiveIntakeDecision(IntakeDecision.NOT_WORTH_FILING, clientDecision)).toBe(decision);
  });

  it('preserves other decisions', () => {
    expect(effectiveIntakeDecision(IntakeDecision.FILE_SUIT, 'DROP')).toBe(IntakeDecision.FILE_SUIT);
  });
});
