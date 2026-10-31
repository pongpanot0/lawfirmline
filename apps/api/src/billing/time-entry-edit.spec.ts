import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BillingService } from './billing.service';
import { ConfirmTimeEntryDto } from './dto/billing.dto';

const lawyer = { id: 'u1', firmId: 'firm-1', firmRole: FirmRole.LAWYER } as AuthUser;
const manager = { id: 'mgr', firmId: 'firm-1', firmRole: FirmRole.OFFICE_MANAGER } as AuthUser;

describe('BillingService — manual time entry, edit, delete', () => {
  const mockPrisma = {
    timeEntry: { create: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn(), deleteMany: jest.fn() },
    firmMember: { findUnique: jest.fn() },
    auditLog: { create: jest.fn() },
  } as any;
  let billing: BillingService;
  const entry = { id: 'te-1', userId: 'u1', invoiceId: null, writtenOffAt: null, hours: 2, rate: 1000 };

  beforeEach(() => {
    jest.clearAllMocks();
    billing = new BillingService(mockPrisma, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    mockPrisma.timeEntry.findFirst.mockResolvedValue(entry);
    mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 1 });
    mockPrisma.timeEntry.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.timeEntry.create.mockImplementation(async ({ data }: any) => ({ id: 'new', ...data }));
  });

  describe('createTimeEntry', () => {
    it('uses the member default rate when rate is omitted', async () => {
      mockPrisma.firmMember.findUnique.mockResolvedValue({ defaultHourlyRate: 3500 });
      await billing.createTimeEntry(lawyer, 'case-1', { hours: 1 } as any);
      expect(mockPrisma.timeEntry.create.mock.calls[0][0].data.rate).toBe(3500);
    });

    it('keeps an explicit rate (even 0) without looking up the default', async () => {
      await billing.createTimeEntry(lawyer, 'case-1', { hours: 1, rate: 0 } as any);
      expect(mockPrisma.timeEntry.create.mock.calls[0][0].data.rate).toBe(0);
      expect(mockPrisma.firmMember.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('updateTimeEntry', () => {
    it('lets the owner edit their own unbilled entry', async () => {
      await billing.updateTimeEntry(lawyer, 'case-1', 'te-1', { hours: 3, description: ' แก้ไข ', rate: 2000, date: '2026-10-30' } as any);
      expect(mockPrisma.timeEntry.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'te-1', caseId: 'case-1', case: { firmId: 'firm-1' } } }),
      );
      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalledWith({
        where: { id: 'te-1', invoiceId: null, writtenOffAt: null },
        data: { hours: 3, description: ' แก้ไข ', rate: 2000, date: new Date('2026-10-30') },
      });
    });

    it('rejects another lawyer without manageInvoices', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, userId: 'someone-else' });
      await expect(billing.updateTimeEntry(lawyer, 'case-1', 'te-1', { hours: 3 } as any)).rejects.toThrow(ForbiddenException);
      expect(mockPrisma.timeEntry.updateMany).not.toHaveBeenCalled();
    });

    it("allows a manageInvoices user to edit someone else's entry", async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, userId: 'someone-else' });
      await billing.updateTimeEntry(manager, 'case-1', 'te-1', { hours: 3 } as any);
      expect(mockPrisma.timeEntry.updateMany).toHaveBeenCalled();
    });

    it('rejects an invoiced entry', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, invoiceId: 'inv-1' });
      await expect(billing.updateTimeEntry(lawyer, 'case-1', 'te-1', { hours: 3 } as any)).rejects.toThrow(ConflictException);
    });

    it('rejects a written-off entry', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, writtenOffAt: new Date() });
      await expect(billing.updateTimeEntry(lawyer, 'case-1', 'te-1', { hours: 3 } as any)).rejects.toThrow(ConflictException);
    });

    it('404s when the entry is not on this case/firm', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue(null);
      await expect(billing.updateTimeEntry(lawyer, 'case-1', 'te-1', {} as any)).rejects.toThrow(NotFoundException);
    });

    it('409s when the entry was invoiced between read and write', async () => {
      mockPrisma.timeEntry.updateMany.mockResolvedValue({ count: 0 });
      await expect(billing.updateTimeEntry(lawyer, 'case-1', 'te-1', { hours: 3 } as any)).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteTimeEntry', () => {
    it('deletes an unbilled own entry and writes TIME_ENTRY_DELETED audit', async () => {
      await billing.deleteTimeEntry(lawyer, 'case-1', 'te-1');
      expect(mockPrisma.timeEntry.deleteMany).toHaveBeenCalledWith({
        where: { id: 'te-1', invoiceId: null, writtenOffAt: null },
      });
      expect(mockPrisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          firmId: 'firm-1',
          userId: 'u1',
          action: 'TIME_ENTRY_DELETED',
          metadata: expect.objectContaining({ timeEntryId: 'te-1', caseId: 'case-1', hours: 2, rate: 1000 }),
        }),
      });
    });

    it('rejects another lawyer, invoiced and written-off entries without deleting', async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ ...entry, userId: 'someone-else' });
      await expect(billing.deleteTimeEntry(lawyer, 'case-1', 'te-1')).rejects.toThrow(ForbiddenException);
      mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ ...entry, invoiceId: 'inv-1' });
      await expect(billing.deleteTimeEntry(lawyer, 'case-1', 'te-1')).rejects.toThrow(ConflictException);
      mockPrisma.timeEntry.findFirst.mockResolvedValueOnce({ ...entry, writtenOffAt: new Date() });
      await expect(billing.deleteTimeEntry(lawyer, 'case-1', 'te-1')).rejects.toThrow(ConflictException);
      expect(mockPrisma.timeEntry.deleteMany).not.toHaveBeenCalled();
      expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
    });

    it("lets a manageInvoices user delete someone else's entry", async () => {
      mockPrisma.timeEntry.findFirst.mockResolvedValue({ ...entry, userId: 'someone-else' });
      await billing.deleteTimeEntry(manager, 'case-1', 'te-1');
      expect(mockPrisma.timeEntry.deleteMany).toHaveBeenCalled();
    });
  });
});

describe('ConfirmTimeEntryDto.sourceKey', () => {
  const errorsFor = (sourceKey: string) =>
    validateSync(
      plainToInstance(ConfirmTimeEntryDto, {
        caseId: '11111111-1111-4111-8111-111111111111',
        hours: 1,
        description: 'x',
        date: '2026-10-31',
        sourceKey,
      }),
    ).filter((e) => e.property === 'sourceKey');

  it('accepts 200 characters and rejects 201', () => {
    expect(errorsFor('k'.repeat(200))).toHaveLength(0);
    expect(errorsFor('k'.repeat(201))).toHaveLength(1);
  });
});
