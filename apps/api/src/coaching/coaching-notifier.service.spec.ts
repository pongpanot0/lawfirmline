import { CoachingNotifierService } from './coaching-notifier.service';

const notification = { id: 'n1', firmId: 'f1', userId: 'u1', category: 'COACHING', title: 'คำแนะนำ', path: '/coaching/mine', appPath: null, body: null } as any;
function build(pushEnabled = true) {
  const center = { channelsFor: jest.fn().mockResolvedValue(new Map([['u1', { push: pushEnabled }]])), unreadCounts: jest.fn().mockResolvedValue(new Map([['u1', 3]])) };
  const push = { send: jest.fn().mockResolvedValue(true) };
  return { center, push, svc: new CoachingNotifierService(center as never, push as never) };
}
describe('CoachingNotifierService', () => {
  it.each(['COACHING', 'STANDUP'])('records %s even when push is muted, with no mobile screen', async (category) => {
    const { svc } = build(false); const db = { notification: { create: jest.fn().mockResolvedValue(notification) } };
    await svc.record(db as never, 'f1', 'u1', category as never, 'หัวข้อ', '/my-day');
    expect(db.notification.create).toHaveBeenCalledWith({ data: { firmId: 'f1', userId: 'u1', category, title: 'หัวข้อ', path: '/my-day', appPath: null } });
  });
  it('sends a recipient-only push with notification badge and inbox fallback', async () => {
    const { svc, center, push } = build(); await svc.send(notification);
    expect(center.channelsFor).toHaveBeenCalledWith(['u1'], 'COACHING');
    expect(push.send).toHaveBeenCalledWith([{ userId: 'u1', title: 'คำแนะนำ', body: '', data: { url: '/notifications', notificationId: 'n1' }, badge: 3 }]);
  });
  it.each(['COACHING', 'STANDUP'])('respects muted %s push', async (category) => {
    const { svc, push } = build(false); await svc.send({ ...notification, category }); expect(push.send).not.toHaveBeenCalled();
  });
  it('does not fail a saved note when push fails', async () => {
    const { svc, push } = build(); push.send.mockRejectedValue(new Error('offline')); await expect(svc.send(notification)).resolves.toBeUndefined();
  });
});
