import {
  formatCaseNotificationReference,
  formatIntakeNotificationReference,
} from './reference-label';

describe('notification reference labels', () => {
  it('uses the black and red case numbers together when available', () => {
    expect(
      formatCaseNotificationReference({
        ownRef: 'TSBREF20260001',
        blackCaseNumber: 'ผบ.123/2569',
        redCaseNumber: 'ผบ.456/2569',
      }),
    ).toBe('หมายเลขคดีดำ ผบ.123/2569 · หมายเลขคดีแดง ผบ.456/2569');
  });

  it('falls back to the internal reference only before a court number exists', () => {
    expect(
      formatCaseNotificationReference({
        ownRef: 'TSBREF20260001',
        blackCaseNumber: null,
        redCaseNumber: null,
      }),
    ).toBe('Our Ref: TSBREF20260001');
  });

  it('uses Our Ref for intake notifications', () => {
    expect(formatIntakeNotificationReference('TSBREF20260002')).toBe('Our Ref: TSBREF20260002');
  });
});
