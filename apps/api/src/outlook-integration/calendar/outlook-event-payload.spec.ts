import { buildOutlookEvent } from './outlook-event-payload';

const base = {
  id: 'e1', title: 'สืบพยานโจทก์', description: 'นำพยาน 2 ปาก', courtName: 'ศาลแพ่ง',
  startAt: new Date('2026-11-01T02:00:00Z'), endAt: null, type: 'COURT_DATE', reminderMinutes: [4320, 1440, 60],
  case: { ownRef: 'TSB2569-014', title: 'บจ.สยาม v. นาย ก', blackCaseNumber: 'พ.123/2569', redCaseNumber: null },
};
const opts = { caseUrl: 'https://firm.samnuan.com/cases/c1', transactionId: 'e1:u1' };

describe('buildOutlookEvent', () => {
  it('prefixes the subject by type and uses UTC times', () => {
    const g = buildOutlookEvent(base, opts);
    expect(g.subject).toBe('[นัดศาล] สืบพยานโจทก์');
    expect(g.start).toEqual({ dateTime: '2026-11-01T02:00:00.000', timeZone: 'UTC' });
    expect(g.end).toEqual({ dateTime: '2026-11-01T03:00:00.000', timeZone: 'UTC' }); // court/client default 60 min
  });
  it('deadlines default to 30 minutes and keep an explicit endAt', () => {
    expect(buildOutlookEvent({ ...base, type: 'DEADLINE' }, opts).end.dateTime).toBe('2026-11-01T02:30:00.000');
    expect(buildOutlookEvent({ ...base, endAt: new Date('2026-11-01T05:00:00Z') }, opts).end.dateTime).toBe('2026-11-01T05:00:00.000');
  });
  it('puts case references, description and a link in an escaped HTML body', () => {
    const g = buildOutlookEvent({ ...base, description: '<b>x</b>' }, opts);
    expect(g.body.contentType).toBe('HTML');
    expect(g.body.content).toContain('TSB2569-014');
    expect(g.body.content).toContain('พ.123/2569');
    expect(g.body.content).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(g.body.content).toContain('href="https://firm.samnuan.com/cases/c1"');
  });
  it('sets location, category, reminder = smallest offset, transactionId', () => {
    const g = buildOutlookEvent(base, opts);
    expect(g.location).toEqual({ displayName: 'ศาลแพ่ง' });
    expect(g.categories).toEqual(['Samnuan']);
    expect(g.reminderMinutesBeforeStart).toBe(60);
    expect(g.transactionId).toBe('e1:u1');
  });
  it('no reminders → reminder off; no court → no location', () => {
    const g = buildOutlookEvent({ ...base, reminderMinutes: [], courtName: null, type: 'OTHER' }, opts);
    expect(g.isReminderOn).toBe(false);
    expect(g.location).toBeUndefined();
    expect(g.subject).toBe('สืบพยานโจทก์');
  });
  it('includes a Teams link in the body when the event has one', () => {
    const g = buildOutlookEvent({ ...base, type: 'CLIENT_MEETING', onlineMeetingUrl: 'https://teams.microsoft.com/l/x' }, opts);
    expect(g.subject).toBe('[นัดลูกความ] สืบพยานโจทก์');
    expect(g.body.content).toContain('https://teams.microsoft.com/l/x');
  });
});
