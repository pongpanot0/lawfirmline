import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DocumentsService } from './documents.service';
import { DocRequestStatus } from '@lawfirm/shared';

describe('case document waiting list', () => {
  const user = { id: 'worker', firmId: 'firm' } as any;
  let prisma: any;
  let service: DocumentsService;
  beforeEach(() => {
    prisma = { case: { findFirst: jest.fn().mockResolvedValue({ id: 'case', intakeId: 'intake' }) },
      document: { findFirst: jest.fn().mockResolvedValue(null) },
      intakeDocumentRequest: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() } };
    service = new DocumentsService(prisma, {} as any, {} as any, { getCaseFilterForUser: () => ({ firmId: 'firm' }) } as any, {} as any);
  });
  it('binds both case and converted-intake rows to accessible cases', async () => {
    await service.listRequests(user, 'case');
    expect(prisma.intakeDocumentRequest.findMany.mock.calls[0][0].where).toEqual({ OR: [
      { case: { AND: [{ id: 'case' }, { firmId: 'firm' }] } },
      { intake: { case: { AND: [{ id: 'case' }, { firmId: 'firm' }] } } },
    ] });
  });
  it('rejects inaccessible cases and file IDs belonging elsewhere', async () => {
    prisma.case.findFirst.mockResolvedValueOnce(null);
    await expect(service.listRequests(user, 'other')).rejects.toThrow(NotFoundException);
    await expect(service.saveRequest(user, 'case', { name: 'สัญญา', requestedFrom: 'ลูกความ', documentId: 'foreign-file' })).rejects.toThrow(NotFoundException);
    expect(prisma.intakeDocumentRequest.create).not.toHaveBeenCalled();
  });
  it('requires a source and clears receivedAt on reopening without changing the original request time', async () => {
    await expect(service.saveRequest(user, 'case', { name: 'สัญญา' })).rejects.toThrow(BadRequestException);
    prisma.intakeDocumentRequest.findFirst.mockResolvedValue({ id: 'request', status: 'RECEIVED', receivedAt: new Date() });
    await service.saveRequest(user, 'case', { status: DocRequestStatus.REQUESTED, dueDate: null }, 'request');
    expect(prisma.intakeDocumentRequest.update).toHaveBeenCalledWith({ where: { id: 'request' }, data: { status: 'REQUESTED', dueDate: null, receivedAt: null } });
  });
});
