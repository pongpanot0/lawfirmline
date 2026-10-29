import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { OutlookAddinService } from './outlook-addin.service';
import { OutlookConnectionsService } from './outlook-connections.service';
import { OutlookGraphClient } from './outlook-graph.client';
import { OutlookSyncService } from './outlook-sync.service';
import { CaseEmailService } from '../email-intake/case-email.service';

describe('OutlookAddinService', () => {
  let service: OutlookAddinService;
  const user = { id: 'user-1', firmId: 'firm-1' } as AuthUser;
  const connection = { id: 'conn-1', firmId: 'firm-1', mailboxAddress: 'lawyer@firm.co.th' };
  const message = { id: 'graph-1', conversationId: 'conv-1', from: { emailAddress: { address: 'client@example.com' } } };

  const mockConnections = { findActiveForUser: jest.fn(), getValidAccessToken: jest.fn() };
  const mockGraph = { getMessage: jest.fn() };
  const mockSync = { upsertGraphMessage: jest.fn() };
  const mockCaseEmail = { linkThread: jest.fn(), suggestCasesForThread: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockConnections.findActiveForUser.mockResolvedValue(connection);
    mockConnections.getValidAccessToken.mockResolvedValue('token-1');
    mockGraph.getMessage.mockResolvedValue(message);
    mockSync.upsertGraphMessage.mockResolvedValue({ threadId: 'thread-1', messageId: 'msg-1', created: true, caseId: null });
    mockCaseEmail.linkThread.mockImplementation(async (_u: AuthUser, threadId: string, caseId: string) => ({ threadId, caseId }));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutlookAddinService,
        { provide: OutlookConnectionsService, useValue: mockConnections },
        { provide: OutlookGraphClient, useValue: mockGraph },
        { provide: OutlookSyncService, useValue: mockSync },
        { provide: CaseEmailService, useValue: mockCaseEmail },
      ],
    }).compile();
    service = module.get(OutlookAddinService);
  });

  describe('file', () => {
    it('throws 404 when the caller has no active Microsoft 365 connection', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      await expect(service.file(user, { graphMessageId: 'graph-1', caseId: 'case-1' })).rejects.toThrow(NotFoundException);
      expect(mockGraph.getMessage).not.toHaveBeenCalled();
      expect(mockCaseEmail.linkThread).not.toHaveBeenCalled();
    });

    it('reads the message only through the caller own connection', async () => {
      await service.file(user, { graphMessageId: 'graph-1', caseId: 'case-1' });
      expect(mockConnections.findActiveForUser).toHaveBeenCalledWith('user-1');
      expect(mockConnections.getValidAccessToken).toHaveBeenCalledWith('conn-1');
      expect(mockGraph.getMessage).toHaveBeenCalledWith('token-1', 'graph-1');
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(
        expect.objectContaining({ firmId: 'firm-1', connectionId: 'conn-1', accessToken: 'token-1', direction: 'INBOUND', createThreadIfMissing: true }),
      );
    });

    it('marks own sent messages as OUTBOUND', async () => {
      mockGraph.getMessage.mockResolvedValue({ ...message, from: { emailAddress: { address: 'Lawyer@firm.co.th' } } });
      await service.file(user, { graphMessageId: 'graph-1', caseId: 'case-1' });
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(expect.objectContaining({ direction: 'OUTBOUND' }));
    });

    it('links the thread through CaseEmailService and reports alreadyLinked=false for a new link', async () => {
      const result = await service.file(user, { graphMessageId: 'graph-1', caseId: 'case-1' });
      expect(mockCaseEmail.linkThread).toHaveBeenCalledWith(user, 'thread-1', 'case-1');
      expect(result).toEqual({ threadId: 'thread-1', caseId: 'case-1', alreadyLinked: false });
    });

    it('reports alreadyLinked=true when the thread is already on this case', async () => {
      mockSync.upsertGraphMessage.mockResolvedValue({ threadId: 'thread-1', messageId: 'msg-1', created: false, caseId: 'case-1' });
      const result = await service.file(user, { graphMessageId: 'graph-1', caseId: 'case-1' });
      expect(result).toEqual({ threadId: 'thread-1', caseId: 'case-1', alreadyLinked: true });
    });

    it('propagates case-access denial from linkThread', async () => {
      mockCaseEmail.linkThread.mockRejectedValue(new NotFoundException('ไม่พบคดี หรือคุณไม่มีสิทธิ์ในคดีนี้'));
      await expect(service.file(user, { graphMessageId: 'graph-1', caseId: 'case-x' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('suggest', () => {
    it('syncs the message unlinked and returns case suggestions for its thread', async () => {
      const suggestions = [{ caseId: 'case-1', ownRef: 'OR-1', title: 'คดี A', reasons: ['CONTACT_EMAIL'] }];
      mockCaseEmail.suggestCasesForThread.mockResolvedValue(suggestions);
      const result = await service.suggest(user, { graphMessageId: 'graph-1' });
      expect(mockSync.upsertGraphMessage).toHaveBeenCalledWith(expect.objectContaining({ createThreadIfMissing: true }));
      expect(mockCaseEmail.suggestCasesForThread).toHaveBeenCalledWith(user, 'thread-1');
      expect(mockCaseEmail.linkThread).not.toHaveBeenCalled();
      expect(result).toEqual(suggestions);
    });

    it('throws 404 when the caller has no active connection', async () => {
      mockConnections.findActiveForUser.mockResolvedValue(null);
      await expect(service.suggest(user, { graphMessageId: 'graph-1' })).rejects.toThrow(NotFoundException);
    });
  });
});
