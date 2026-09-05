import { Test, TestingModule } from '@nestjs/testing';
import { ClientPortalIntegrationsController } from './client-portal-integrations.controller';
import { ContactLineLinkService } from '../notifications/contact-line-link.service';
import { ContactNotificationPreferenceService } from '../notifications/contact-notification-preference.service';
import { ClientPortalGuard } from './client-portal.guard';

describe('ClientPortalIntegrationsController', () => {
  let controller: ClientPortalIntegrationsController;
  const mockLineLink = { getPersonalStatus: jest.fn(), createLinkCode: jest.fn(), disconnect: jest.fn() };
  const mockPrefs = { getForContact: jest.fn(), setForContact: jest.fn() };
  const portalUser = { clientContactId: 'contact-1', clientId: 'client-1', firmId: 'firm-1', name: 'x', email: 'x@x.com' };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ClientPortalIntegrationsController],
      providers: [
        { provide: ContactLineLinkService, useValue: mockLineLink },
        { provide: ContactNotificationPreferenceService, useValue: mockPrefs },
      ],
    })
      .overrideGuard(ClientPortalGuard)
      .useValue({ canActivate: () => true })
      .compile();
    controller = module.get(ClientPortalIntegrationsController);
  });

  it('delegates line status to ContactLineLinkService.getPersonalStatus using the portal contact id', async () => {
    mockLineLink.getPersonalStatus.mockResolvedValue({ connected: false });
    const result = await controller.getLineStatus(portalUser);
    expect(mockLineLink.getPersonalStatus).toHaveBeenCalledWith('contact-1');
    expect(result).toEqual({ connected: false });
  });

  it('delegates preference updates to ContactNotificationPreferenceService.setForContact', async () => {
    mockPrefs.setForContact.mockResolvedValue({ channel: 'LINE', isEnabled: false });
    const result = await controller.updatePreference(portalUser, { channel: 'LINE', isEnabled: false });
    expect(mockPrefs.setForContact).toHaveBeenCalledWith('contact-1', 'LINE', false);
    expect(result).toEqual({ channel: 'LINE', isEnabled: false });
  });
});
