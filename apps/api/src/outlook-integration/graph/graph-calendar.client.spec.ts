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
});
