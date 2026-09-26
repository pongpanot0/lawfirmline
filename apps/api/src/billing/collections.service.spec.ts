import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CollectionsService } from './collections.service';
import { PrismaService } from '../prisma/prisma.module';
import { InvoiceStatus, PaymentMethod } from '../generated/prisma';

const owner = { id: 'owner-1', firmId: 'firm-1', firmRole: FirmRole.OWNER } as AuthUser;

describe('CollectionsService', () => {
  const mockPrisma = {
    invoice: { findFirst: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    invoicePayment: { create: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(async (arg: any) => (typeof arg === 'function' ? arg(mockPrisma) : Promise.all(arg))),
  } as any;
  let service: CollectionsService;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [CollectionsService, { provide: PrismaService, useValue: mockPrisma }],
    }).compile();
    service = module.get(CollectionsService);
  });

  describe('markSent', () => {
    it('sets SENT, issuedAt and dueAt+30 on a DRAFT invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'i1', firmId: 'firm-1', status: InvoiceStatus.DRAFT, dueAt: null });
      mockPrisma.invoice.update.mockImplementation(({ data }: any) => Promise.resolve({ id: 'i1', ...data }));
      const result = await service.markSent(owner, 'i1');
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({ status: InvoiceStatus.SENT, issuedAt: expect.any(Date), dueAt: expect.any(Date) }),
      }));
      const call = mockPrisma.invoice.update.mock.calls[0][0];
      const expectedDue = new Date(call.data.issuedAt.getTime() + 30 * 86400000);
      expect(call.data.dueAt.toDateString()).toBe(expectedDue.toDateString());
      expect(result.status).toBe(InvoiceStatus.SENT);
    });

    it('throws BadRequest when the invoice is already SENT', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue({ id: 'i1', firmId: 'firm-1', status: InvoiceStatus.SENT });
      await expect(service.markSent(owner, 'i1')).rejects.toThrow(BadRequestException);
    });

    it('throws NotFound for another firm\'s invoice', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(null);
      await expect(service.markSent(owner, 'i1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('recordPayment', () => {
    const baseInvoice = (overrides: any = {}) => ({
      id: 'i1',
      firmId: 'firm-1',
      status: InvoiceStatus.SENT,
      totalAmount: 1000,
      payments: [],
      ...overrides,
    });

    it('keeps SENT and returns outstanding on a partial payment', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice());
      mockPrisma.invoicePayment.create.mockResolvedValue({ id: 'p1', amount: 400 });
      const dto = { amount: 400, receivedAt: '2026-09-26' } as any;
      const result = await service.recordPayment(owner, 'i1', dto);
      expect(mockPrisma.invoice.update).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: InvoiceStatus.PAID }) }));
      expect(result.outstanding).toBe(600);
    });

    it('locks the invoice row with FOR UPDATE before reading it or creating the payment', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice());
      mockPrisma.invoicePayment.create.mockResolvedValue({ id: 'p1', amount: 400 });
      const dto = { amount: 400, receivedAt: '2026-09-26' } as any;
      await service.recordPayment(owner, 'i1', dto);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      const lockOrder = mockPrisma.$queryRaw.mock.invocationCallOrder[0];
      const findOrder = mockPrisma.invoice.findFirst.mock.invocationCallOrder[0];
      const createOrder = mockPrisma.invoicePayment.create.mock.invocationCallOrder[0];
      expect(lockOrder).toBeLessThan(findOrder);
      expect(lockOrder).toBeLessThan(createOrder);
      const [strings, ...values] = mockPrisma.$queryRaw.mock.calls[0];
      expect(strings.join('?')).toContain('FOR UPDATE');
      expect(values).toContain('i1');
    });

    it('flips to PAID on an exact payment', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ payments: [{ amount: 400 }] }));
      mockPrisma.invoicePayment.create.mockResolvedValue({ id: 'p2', amount: 600 });
      const dto = { amount: 600, receivedAt: '2026-09-26' } as any;
      const result = await service.recordPayment(owner, 'i1', dto);
      expect(mockPrisma.invoice.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'i1' },
        data: expect.objectContaining({ status: InvoiceStatus.PAID }),
      }));
      expect(result.outstanding).toBe(0);
    });

    it('throws when amount exceeds outstanding', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice());
      const dto = { amount: 1000.01, receivedAt: '2026-09-26' } as any;
      await expect(service.recordPayment(owner, 'i1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice is DRAFT', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ status: InvoiceStatus.DRAFT }));
      const dto = { amount: 100, receivedAt: '2026-09-26' } as any;
      await expect(service.recordPayment(owner, 'i1', dto)).rejects.toThrow(BadRequestException);
    });

    it('throws when invoice is already PAID', async () => {
      mockPrisma.invoice.findFirst.mockResolvedValue(baseInvoice({ status: InvoiceStatus.PAID, payments: [{ amount: 1000 }] }));
      const dto = { amount: 100, receivedAt: '2026-09-26' } as any;
      await expect(service.recordPayment(owner, 'i1', dto)).rejects.toThrow(BadRequestException);
    });
  });

  describe('getReceivables', () => {
    const d = (s: string) => new Date(s + 'T00:00:00+07:00');

    it('excludes zero-outstanding invoices and computes buckets', async () => {
      const today = d('2026-09-26');
      mockPrisma.invoice.findMany.mockResolvedValue([
        {
          id: 'i1', invoiceNumber: 'INV-1', totalAmount: 1000, payments: [{ amount: 1000 }],
          issuedAt: d('2026-08-01'), dueAt: d('2026-08-31'), lastReminderAt: null,
          billToCustomer: null, case: null, caseId: null,
        },
        {
          id: 'i2', invoiceNumber: 'INV-2', totalAmount: 500, payments: [{ amount: 100 }],
          issuedAt: d('2026-06-01'), dueAt: d('2026-06-24'), lastReminderAt: null,
          billToCustomer: { name: 'Acme' }, case: { ownRef: 'CASE-1', client: { name: 'Client X' } }, caseId: 'case-2',
        },
      ]);
      const result = await service.getReceivables(owner, today);
      expect(result.rows).toHaveLength(1);
      expect(result.rows[0].id).toBe('i2');
      expect(result.rows[0].outstanding).toBe(400);
      expect(result.rows[0].customerName).toBe('Acme');
      expect(result.rows[0].caseRef).toBe('CASE-1');
      expect(result.rows[0].daysOverdue).toBe(94);
      expect(result.rows[0].bucket).toBe('90+');
      expect(result.buckets).toEqual({ '0-30': 0, '31-60': 0, '61-90': 0, '90+': 400 });
    });
  });
});
