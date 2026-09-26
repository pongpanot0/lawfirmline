import { eventPeopleIds, eventForUserWhere } from './event-people';

describe('eventPeopleIds', () => {
  it('rows win over the lead lawyer', () => {
    const ids = eventPeopleIds({
      assignees: [{ userId: 'u1' }, { userId: 'u2' }],
      case: { leadLawyerId: 'lead' },
    });
    expect(ids).toEqual(['u1', 'u2']);
  });

  it('no rows returns [leadLawyerId]', () => {
    const ids = eventPeopleIds({ assignees: [], case: { leadLawyerId: 'lead' } });
    expect(ids).toEqual(['lead']);
  });

  it('no rows and no lead returns []', () => {
    const ids = eventPeopleIds({ assignees: [], case: { leadLawyerId: null } });
    expect(ids).toEqual([]);
  });
});

describe('eventForUserWhere', () => {
  it('returns the exact where clause', () => {
    expect(eventForUserWhere('u1')).toEqual({
      OR: [
        { assignees: { some: { userId: 'u1' } } },
        { assignees: { none: {} }, case: { leadLawyerId: 'u1' } },
      ],
    });
  });
});
