import { toAppRoute } from './app-route';

const ID = '11111111-2222-3333-4444-555555555555';

describe('toAppRoute', () => {
  it.each([
    [`/cases/${ID}`, `/case/${ID}`],
    [`/cases/${ID}?tab=comments`, `/case/${ID}`],
    ['/todos', '/(tabs)/tasks'],
    ['/expenses/claim', '/expenses/claims'],
    [`/expenses/claim/${ID}`, `/expenses/claim/${ID}`],
    [`/court-day/${ID}`, `/court-day/${ID}`],
    ['/leaves', '/leaves'],
  ])('%s → %s', (web, app) => expect(toAppRoute(web)).toBe(app));

  it('returns null where the app has no screen', () => {
    expect(toAppRoute(`/intake/${ID}`)).toBeNull();
    expect(toAppRoute('/cases/not-a-uuid')).toBeNull();
  });
});
