import { GraphCalendarClient } from './graph-calendar.client';

describe('GraphCalendarClient', () => {
  const http = { request: jest.fn() };
  const client = new GraphCalendarClient(http as any);
  beforeEach(() => http.request.mockReset());

  it('createEvent POSTs to /me/events with the transactionId', async () => {
    http.request.mockResolvedValue({ id: 'g1' });
    await client.createEvent('tok', { subject: 's', transactionId: 'e1:u1' } as any);
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events', { method: 'POST', body: JSON.stringify({ subject: 's', transactionId: 'e1:u1' }) });
  });
  it('updateEvent PATCHes without transactionId', async () => {
    http.request.mockResolvedValue({ id: 'g1' });
    await client.updateEvent('tok', 'g/1', { subject: 's', transactionId: 'x' } as any);
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events/g%2F1', { method: 'PATCH', body: JSON.stringify({ subject: 's' }) });
  });
  it('deleteEvent DELETEs', async () => {
    http.request.mockResolvedValue(undefined);
    await client.deleteEvent('tok', 'g1');
    expect(http.request).toHaveBeenCalledWith('tok', '/me/events/g1', { method: 'DELETE' });
  });
  it('calendarViewDelta follows nextLink to the deltaLink, parses UTC times and flags removals', async () => {
    http.request
      .mockResolvedValueOnce({ value: [{ id: 'a', start: { dateTime: '2026-11-01T03:00:00.0000000' }, end: { dateTime: '2026-11-01T04:00:00.0000000' } }], '@odata.nextLink': 'https://graph/next' })
      .mockResolvedValueOnce({ value: [{ id: 'b', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': 'DL' });
    const res = await client.calendarViewDelta('tok', { start: new Date('2026-10-13T00:00:00Z'), end: new Date('2026-11-13T00:00:00Z') });
    expect(http.request.mock.calls[0][1]).toBe('/me/calendarView/delta?startDateTime=2026-10-13T00%3A00%3A00.000Z&endDateTime=2026-11-13T00%3A00%3A00.000Z');
    expect(http.request.mock.calls[0][2].headers.Prefer).toContain('outlook.timezone="UTC"');
    expect(http.request.mock.calls[1][1]).toBe('https://graph/next');
    expect(res.deltaLink).toBe('DL');
    expect(res.events[0].start).toEqual(new Date('2026-11-01T03:00:00Z'));
    expect(res.events[1]).toEqual(expect.objectContaining({ id: 'b', removed: true }));
  });
  it('calendarViewDelta resumes from a deltaLink', async () => {
    http.request.mockResolvedValue({ value: [], '@odata.deltaLink': 'DL2' });
    await client.calendarViewDelta('tok', { deltaLink: 'DL1' });
    expect(http.request.mock.calls[0][1]).toBe('DL1');
  });
});
