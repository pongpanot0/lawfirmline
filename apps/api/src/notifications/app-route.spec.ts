import { toAppRoute } from './app-route';

const ID = '11111111-2222-3333-4444-555555555555';

describe('toAppRoute', () => {
  it.each([
    [`/cases/${ID}`, `/case/${ID}`],
    // D6: the web tab becomes the app section the case screen opens.
    [`/cases/${ID}?tab=calendar`, `/case/${ID}?section=deadlines`],
    [`/cases/${ID}?tab=calendar&eventId=e1`, `/case/${ID}?section=deadlines`],
    [`/cases/${ID}?tab=documents`, `/case/${ID}?section=documents`],
    [`/cases/${ID}?tab=comments`, `/case/${ID}?section=comments`],
    // Tabs the app has no section for still open the case.
    [`/cases/${ID}?tab=tasks`, `/case/${ID}`],
    [`/cases/${ID}?tab=constructor`, `/case/${ID}`],
    [`/cases/${ID}#top`, `/case/${ID}`],
    ['/todos', '/(tabs)/tasks'],
    ['/todos?view=review', '/(tabs)/tasks'],
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
