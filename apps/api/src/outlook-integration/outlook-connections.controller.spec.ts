import { Test } from '@nestjs/testing';
import { OutlookConnectionsController } from './outlook-connections.controller';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';
import { OutlookCalendarSyncService } from './calendar/outlook-calendar-sync.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('OutlookConnectionsController settings', () => {
  const connections = { updateSettings: jest.fn(), recordError: jest.fn().mockResolvedValue(undefined), listForFirm: jest.fn().mockResolvedValue([{ id: 'c1' }]), assertCanManage: jest.fn().mockResolvedValue(undefined), disconnect: jest.fn().mockResolvedValue({ ok: true }), caseLinkSummary: jest.fn().mockResolvedValue({ caseLinks: 1 }) };
  const calendarSync = { removeAllForConnection: jest.fn().mockResolvedValue(undefined) };
  const subscriptions = { ensureSubscription: jest.fn(), removeSubscription: jest.fn() };
  let controller: OutlookConnectionsController;
  const user = { id: 'u1', firmId: 'f1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const mod = await Test.createTestingModule({
      controllers: [OutlookConnectionsController],
      providers: [
        { provide: OutlookConnectionsService, useValue: connections },
        { provide: OutlookSyncService, useValue: {} },
        { provide: OutlookSubscriptionService, useValue: subscriptions },
        { provide: OutlookCalendarSyncService, useValue: calendarSync },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = mod.get(OutlookConnectionsController);
  });

  it('turning inbox intake on creates the webhook subscription', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: false }, after: { syncInboxToIntake: true } });
    await controller.updateSettings(user, 'c1', { syncInboxToIntake: true });
    expect(subscriptions.ensureSubscription).toHaveBeenCalledWith('c1');
  });

  it('turning it off removes the subscription; a failure still returns the saved row', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: true }, after: { syncInboxToIntake: false } });
    subscriptions.removeSubscription.mockRejectedValue(new Error('graph down'));
    await expect(controller.updateSettings(user, 'c1', { syncInboxToIntake: false })).resolves.toEqual({ id: 'c1' });
    expect(subscriptions.removeSubscription).toHaveBeenCalledWith('c1');
  });

  it('records the error on the connection when creating the subscription fails, and still responds', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: false }, after: { syncInboxToIntake: true } });
    subscriptions.ensureSubscription.mockRejectedValue(new Error('graph down'));
    await expect(controller.updateSettings(user, 'c1', { syncInboxToIntake: true })).resolves.toEqual({ id: 'c1' });
    expect(connections.recordError).toHaveBeenCalledWith('c1', expect.stringContaining('graph down'));
  });

  it('a failed subscription change does not skip the calendar cleanup', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: false, syncCalendar: true }, after: { syncInboxToIntake: true, syncCalendar: false } });
    subscriptions.ensureSubscription.mockRejectedValue(new Error('graph down'));
    await controller.updateSettings(user, 'c1', { syncInboxToIntake: true, syncCalendar: false });
    expect(calendarSync.removeAllForConnection).toHaveBeenCalledWith('c1');
    expect(connections.recordError).toHaveBeenCalledWith('c1', expect.stringContaining('Subscription follow-up failed'));
  });

  it('an unchanged flag triggers neither ensure nor remove', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncInboxToIntake: true }, after: { syncInboxToIntake: true } });
    await controller.updateSettings(user, 'c1', { syncCalendar: true });
    expect(subscriptions.ensureSubscription).not.toHaveBeenCalled();
    expect(subscriptions.removeSubscription).not.toHaveBeenCalled();
  });

  it('turning calendar sync off removes that account’s Outlook copies', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncCalendar: true, syncInboxToIntake: false }, after: { syncCalendar: false, syncInboxToIntake: false } });
    await controller.updateSettings(user, 'c1', { syncCalendar: false });
    expect(calendarSync.removeAllForConnection).toHaveBeenCalledWith('c1');
  });

  it('turning calendar sync on removes nothing', async () => {
    connections.updateSettings.mockResolvedValue({ before: { syncCalendar: false }, after: { syncCalendar: true } });
    await controller.updateSettings(user, 'c1', { syncCalendar: true });
    expect(calendarSync.removeAllForConnection).not.toHaveBeenCalled();
  });

  it('disconnect removes the Outlook copies before the tokens are wiped', async () => {
    await controller.disconnect(user, 'c1');
    expect(calendarSync.removeAllForConnection.mock.invocationCallOrder[0]).toBeLessThan(connections.disconnect.mock.invocationCallOrder[0]);
    expect(connections.disconnect).toHaveBeenCalledWith('f1', 'c1');
  });

  it('disconnect still disconnects when the cleanup fails', async () => {
    calendarSync.removeAllForConnection.mockRejectedValue(new Error('graph down'));
    await expect(controller.disconnect(user, 'c1')).resolves.toEqual({ ok: true });
    expect(connections.disconnect).toHaveBeenCalledWith('f1', 'c1');
  });

  it('case-links checks manage permission before summarising', async () => {
    await expect(controller.caseLinks(user, 'c1')).resolves.toEqual({ caseLinks: 1 });
    expect(connections.assertCanManage).toHaveBeenCalledWith(user, 'c1');
    expect(connections.caseLinkSummary).toHaveBeenCalledWith('f1', 'c1');
  });
});
