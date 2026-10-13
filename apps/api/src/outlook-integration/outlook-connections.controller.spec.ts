import { Test } from '@nestjs/testing';
import { OutlookConnectionsController } from './outlook-connections.controller';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookSyncService } from './outlook-sync.service';
import { OutlookSubscriptionService } from './outlook-subscription.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';

describe('OutlookConnectionsController settings', () => {
  const connections = { updateSettings: jest.fn(), listForFirm: jest.fn().mockResolvedValue([{ id: 'c1' }]) };
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
  });
});
