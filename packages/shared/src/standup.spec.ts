import { standupRequired } from './standup';

const required = (over: Partial<Parameters<typeof standupRequired>[0]> = {}) => standupRequired({ firmRole: 'LAWYER', day: '2026-11-13', onLeave: false, isHoliday: false, ...over });
describe('standupRequired shared contract', () => {
  it.each(['LAWYER', 'SENIOR_LAWYER'])('requires %s on a working day', (firmRole) => expect(required({ firmRole })).toBe(true));
  it.each(['OWNER', 'OFFICE_MANAGER', 'ASSISTANT', 'EXTERNAL'])('does not require %s', (firmRole) => expect(required({ firmRole })).toBe(false));
  it.each(['2026-11-14', '2026-11-15'])('does not require weekends: %s', (day) => expect(required({ day })).toBe(false));
  it('does not require approved leave', () => expect(required({ onLeave: true })).toBe(false));
  it('does not require holidays', () => expect(required({ isHoliday: true })).toBe(false));
  it('uses Bangkok midnight when given an instant', () => {
    expect(required({ day: new Date('2026-11-15T16:59:59Z') })).toBe(false);
    expect(required({ day: new Date('2026-11-15T17:00:00Z') })).toBe(true);
  });
  it('does not require an invalid Date', () => expect(required({ day: new Date(NaN) })).toBe(false));
  it.each(['2026-02-30', 'bad', '2026-11-13T00:00:00Z'])('rejects invalid calendar day %s', (day) => expect(required({ day })).toBe(false));
});
