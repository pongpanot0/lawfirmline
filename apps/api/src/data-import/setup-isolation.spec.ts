import { NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PracticeSetupService } from '../practice-setup/practice-setup.service';

describe('SETUP batch isolation from generic imports', () => {
  const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
  function setup() {
    const prisma = {
      $queryRaw: jest.fn(),
      firmMember: { count: jest.fn().mockResolvedValue(1) }, invitation: { count: jest.fn().mockResolvedValue(0) },
      client: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]) },
      case: { count: jest.fn().mockResolvedValue(0), findMany: jest.fn().mockResolvedValue([]), deleteMany: jest.fn() },
      dataImportBatch: {
        findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ id: 'setup-1' }), update: jest.fn(),
      },
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation((callback: (tx: unknown) => unknown) => callback(prisma));
    const service = new PracticeSetupService(prisma as never, {} as never, {} as never, {} as never, {} as never, {} as never);
    return { service, prisma };
  }

  it('lists only SETUP batches in practice setup progress', async () => {
    const { service, prisma } = setup();
    await service.progress(user);
    expect(prisma.dataImportBatch.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: user.firmId, kind: 'SETUP' } }));
  });

  it.each(['commitImport', 'undoImport'] as const)('%s cannot load a generic import batch', async method => {
    const { service, prisma } = setup();
    await expect(service[method](user, 'generic-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.dataImportBatch.findFirst).toHaveBeenCalledWith({ where: { id: 'generic-1', firmId: user.firmId, kind: 'SETUP' } });
    expect(prisma.dataImportBatch.update).not.toHaveBeenCalled(); expect(prisma.case.deleteMany).not.toHaveBeenCalled();
  });

  it('keeps preview creation on the database SETUP default', async () => {
    const { service, prisma } = setup();
    await service.previewImport(user, [{ clientName: 'ลูกความ', caseRef: '', caseTitle: '' }]);
    const data = prisma.dataImportBatch.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ firmId: user.firmId, createdById: user.id });
    expect(data).not.toHaveProperty('kind');
  });
});
