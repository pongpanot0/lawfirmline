import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole, REQUIRED_VAT_BLOCKS, STANDARD_V1_LAYOUT, validateTemplateLayout } from '@lawfirm/shared';
import { DocumentTemplatesService, resolveTemplate } from './document-templates.service';
import { CollectionsService } from '../billing/collections.service';
import { ReceiptsService } from '../billing/receipts.service';
import { BillingService } from '../billing/billing.service';

const owner = { id: 'u1', firmId: 'f1', firmRole: FirmRole.OWNER } as AuthUser;
const manager = { ...owner, firmRole: FirmRole.OFFICE_MANAGER };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

describe('document templates and issue snapshots', () => {
  let db: any, service: DocumentTemplatesService, templates: any[], clients: any[], firm: any;
  let invoice: any, payments: any[], receipts: any[], collections: CollectionsService;
  let receiptService: ReceiptsService;
  const matches = (row: any, where: any) => Object.entries(where).every(([k, v]) => row[k] === v);
  beforeEach(() => {
    templates = []; clients = [{ id: 'c1', firmId: 'f1', invoiceTemplateId: null, receiptTemplateId: null }];
    firm = { id: 'f1', vatRegistered: false, logoKey: 'old-logo', legalName: 'Law' };
    invoice = { id: 'i1', firmId: 'f1', billToCustomerId: 'c1', status: 'DRAFT', totalAmount: 100, vatAmount: 0, discountAmount: 0, vatRate: 0.07 };
    payments = []; receipts = [];
    let number = 0;
    db = {
      firm: { findUnique: jest.fn(async () => firm) },
      billingDocumentTemplate: {
        findFirst: jest.fn(async ({ where }) => templates.find(t => matches(t, where)) ?? null),
        findMany: jest.fn(async ({ where }) => templates.filter(t => matches(t, where))),
        create: jest.fn(async ({ data }) => {
          const t = { id: `t${templates.length + 1}`, isDefault: false, version: 1, archivedAt: null, logoKey: null, ...clone(data) };
          templates.push(t); return clone(t);
        }),
        updateMany: jest.fn(async ({ where, data }) => { const rows = templates.filter(t => matches(t, where)); rows.forEach(t => Object.assign(t, data)); return { count: rows.length }; }),
        update: jest.fn(async ({ where, data }) => {
          const t = templates.find(t => matches(t, where));
          for (const [k, v] of Object.entries(data)) if (v !== undefined) t[k] = k === 'version' ? t.version + 1 : clone(v);
          return clone(t);
        }),
      },
      client: {
        findFirst: jest.fn(async ({ where }) => clients.find(c => matches(c, where)) ?? null),
        update: jest.fn(async ({ where, data }) => Object.assign(clients.find(c => matches(c, where)), Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined)))),
      },
      invoice: {
        findFirst: jest.fn(async ({ where, include }) => matches(invoice, where) ? { ...invoice, ...(include?.payments ? { payments } : {}), ...(include?.lineItems ? { lineItems: [] } : {}) } : null),
        update: jest.fn(async ({ data }) => Object.assign(invoice, clone(data))),
      },
      invoiceLineItem: { findMany: jest.fn(async () => [{ amount: 100, taxClass: 'LITIGATION_EXEMPT' }]) },
      invoicePayment: {
        findMany: jest.fn(async () => payments.filter(p => p.clearedAt)),
        create: jest.fn(async ({ data }) => { const p = { id: `p${payments.length + 1}`, whtAmount: 0, createdAt: new Date(), method: 'TRANSFER', ...data }; payments.push(p); return p; }),
        findFirst: jest.fn(async ({ where }) => { const p = payments.find(p => matches(p, where)); return p ? { ...p, receipts: receipts.filter(r => r.paymentId === p.id && !r.voidedAt) } : null; }),
        update: jest.fn(async ({ where, data }) => Object.assign(payments.find(p => matches(p, where)), data)),
      },
      receipt: {
        create: jest.fn(async ({ data }) => { const r = { id: `r${receipts.length + 1}`, voidedAt: null, ...data }; receipts.push(r); return r; }),
        findMany: jest.fn(async ({ where }) => receipts.filter(r => matches(r, where))),
        findFirst: jest.fn(async ({ where, include }) => { const r = receipts.find(r => matches(r, where)); return r ? { ...r, ...(include ? { invoice: { ...invoice, lineItems: [], billToCustomer: clients[0] }, payment: payments.find(p => p.id === r.paymentId) } : {}) } : null; }),
        update: jest.fn(async ({ where, data }) => Object.assign(receipts.find(r => matches(r, where)), data)),
      },
      $queryRaw: jest.fn(async () => [{ n: BigInt(++number) }]),
    };
    db.$transaction = jest.fn((fn: any) => fn(db));
    service = new DocumentTemplatesService(db);
    collections = new CollectionsService(db, {} as any, {} as any);
    receiptService = new ReceiptsService(db);
  });

  const create = (type: 'INVOICE' | 'RECEIPT' = 'INVOICE') => service.create(owner, { name: 'Original', docType: type });

  it('CRUD scopes reads and excludes archived templates; copy clones the layout', async () => {
    const t = await create();
    expect(t.layout).toEqual(STANDARD_V1_LAYOUT);
    await service.update(owner, t.id, { name: 'Updated', layout: { version: 1, blocks: [{ id: 'note', type: 'note', column: 'full', settings: { text: 'Hello' } }] } });
    expect((await service.get(owner, t.id)).version).toBe(2);
    const copy = await service.create(owner, { name: 'Copy', docType: 'INVOICE', copyFromId: t.id });
    expect(copy).toMatchObject({ version: 1, layout: (await service.get(owner, t.id)).layout });
    await service.archive(owner, t.id);
    expect(await service.list(owner, 'INVOICE')).toEqual([expect.objectContaining({ id: copy.id })]);
    await expect(service.get(owner, t.id)).rejects.toThrow(NotFoundException);
    await expect(service.get({ ...owner, firmId: 'other' }, copy.id)).rejects.toThrow(NotFoundException);
  });

  it('only the owner can create, edit, archive and bind; managers may read and resolve', async () => {
    const t = await create();
    expect(() => service.create(manager, { name: 'x', docType: 'INVOICE' })).toThrow(ForbiddenException);
    expect(() => service.update(manager, t.id, { name: 'x' })).toThrow(ForbiddenException);
    expect(() => service.archive(manager, t.id)).toThrow(ForbiddenException);
    expect(() => service.bind(manager, 'c1', {})).toThrow(ForbiddenException);
    expect(await service.get(manager, t.id)).toMatchObject({ id: t.id });
    expect(await service.resolve(manager, 'INVOICE')).toMatchObject({ templateId: null });
    expect(() => service.list({ ...owner, firmRole: FirmRole.LAWYER })).toThrow(ForbiddenException);
  });

  it('sets a new default in one transaction, independently per document type; refuses archiving defaults', async () => {
    const a = await create(), b = await create(), r = await create('RECEIPT');
    await service.update(owner, a.id, { isDefault: true });
    await service.update(owner, r.id, { isDefault: true });
    await service.update(owner, b.id, { isDefault: true });
    expect(templates.filter(t => t.isDefault).map(t => t.id)).toEqual([b.id, r.id]);
    await expect(service.archive(owner, b.id)).rejects.toThrow(BadRequestException);
    await service.update(owner, b.id, { isDefault: false });
    expect((await service.archive(owner, b.id)).archivedAt).toBeTruthy();
    expect(db.$transaction).toHaveBeenCalled();
  });

  it('resolves explicit override > customer > firm default > standard', async () => {
    expect((await service.resolve(owner, 'INVOICE', 'c1')).name).toBe('standard-v1');
    const a = await create(), b = await create();
    await service.update(owner, a.id, { isDefault: true });
    expect((await service.resolve(owner, 'INVOICE', 'c1')).templateId).toBe(a.id);
    await service.bind(owner, 'c1', { invoiceTemplateId: b.id });
    expect((await service.resolve(owner, 'INVOICE', 'c1')).templateId).toBe(b.id);
    expect((await resolveTemplate(db, 'f1', 'INVOICE', 'c1', a.id)).templateId).toBe(a.id);
    await service.archive(owner, b.id);
    expect((await service.resolve(owner, 'INVOICE', 'c1')).templateId).toBe(a.id);
    await service.bind(owner, 'c1', { invoiceTemplateId: null });
    expect(clients[0].invoiceTemplateId).toBeNull();
  });

  it.each(['foreign', 'wrong-type', 'archived'])('rejects %s template on send, payment, clear, reissue and binding', async mode => {
    const t = await create(mode === 'wrong-type' ? 'RECEIPT' : 'INVOICE');
    if (mode === 'foreign') templates[0].firmId = 'other';
    if (mode === 'archived') templates[0].archivedAt = new Date();
    await expect(collections.markSent(owner, 'i1', t.id)).rejects.toThrow(NotFoundException);
    await expect(service.bind(owner, 'c1', { invoiceTemplateId: t.id })).rejects.toThrow(NotFoundException);
    templates[0].docType = mode === 'wrong-type' ? 'INVOICE' : 'RECEIPT';
    invoice.status = 'SENT';
    await expect(collections.recordPayment(owner, 'i1', { amount: 10, receivedAt: '2026-11-01', templateId: t.id })).rejects.toThrow(NotFoundException);
    expect(db.invoicePayment.create).not.toHaveBeenCalled();
    payments.push({ id: 'p1', firmId: 'f1', invoiceId: 'i1', amount: 10, whtAmount: 0, method: 'CHEQUE', receivedAt: new Date('2026-11-01'), clearedAt: null });
    await expect(collections.clearCheque(owner, 'i1', 'p1', { clearedAt: '2026-11-02', templateId: t.id })).rejects.toThrow(NotFoundException);
    payments[0].clearedAt = new Date('2026-11-02');
    receipts.push({ id: 'r1', firmId: 'f1', invoiceId: 'i1', paymentId: 'p1', voidedAt: new Date() });
    await expect(receiptService.reissue(owner, 'r1', t.id)).rejects.toThrow(NotFoundException);
  });

  it('rejects foreign customers, wrong-type copies and foreign logo overrides', async () => {
    const t = await create();
    await expect(service.bind(owner, 'other', { invoiceTemplateId: t.id })).rejects.toThrow(NotFoundException);
    await expect(service.resolve(owner, 'INVOICE', 'other')).rejects.toThrow(NotFoundException);
    await expect(service.create(owner, { name: 'copy', docType: 'RECEIPT', copyFromId: t.id })).rejects.toThrow(NotFoundException);
    await expect(service.update(owner, t.id, { logoKey: 'firms/other/billing/logos/11111111-1111-4111-8111-111111111111.png' })).rejects.toThrow(BadRequestException);
  });

  it('VAT save rejects hidden/removed required blocks; resolver repairs templates made before registration', async () => {
    const t = await service.create(owner, { name: 'Minimal', docType: 'RECEIPT', layout: { version: 1, blocks: [{ id: 'firm', type: 'firm', column: 'left', hidden: true }] } });
    await service.update(owner, t.id, { isDefault: true });
    firm.vatRegistered = true;
    await expect(service.update(owner, t.id, { name: 'Still hidden' })).rejects.toThrow(BadRequestException);
    await expect(service.create(owner, { name: 'invalid', docType: 'INVOICE', layout: { version: 1, blocks: [] } })).rejects.toThrow(BadRequestException);
    const snapshot = await service.resolve(owner, 'RECEIPT');
    for (const type of REQUIRED_VAT_BLOCKS) expect(snapshot.layout.blocks.some(b => b.type === type && !b.hidden)).toBe(true);
    expect(templates[0].layout.blocks).toHaveLength(1);
  });

  it('invoice send freezes the layout and effective firm logo; print never resolves a newer template', async () => {
    const t = await create();
    await collections.markSent(owner, 'i1', t.id);
    const before = clone(invoice.templateSnapshot);
    await service.update(owner, t.id, { name: 'New', layout: { version: 1, blocks: [] } });
    firm.logoKey = 'new-logo';
    const billing = new BillingService(db, {} as any, {} as any, {} as any, {} as any, {} as any, {} as any);
    expect((await billing.getInvoicePrintData(owner, 'i1')).templateSnapshot).toEqual(before);
    expect(before).toMatchObject({ name: 'Original', version: 1, logoKey: 'old-logo' });
    await expect(collections.markSent(owner, 'i1')).rejects.toThrow(BadRequestException);
  });

  it('payment, cheque clear and reissue freeze receipt templates; an edit cannot change a reprint', async () => {
    const t = await create('RECEIPT'); invoice.status = 'SENT';
    const result = await collections.recordPayment(owner, 'i1', { amount: 25, receivedAt: '2026-11-01', templateId: t.id });
    const frozen = clone(result.receipt!.templateSnapshot);
    await service.update(owner, t.id, { name: 'Second', layout: { version: 1, blocks: [] } });
    expect((await receiptService.print(owner, result.receipt!.id)).templateSnapshot).toEqual(frozen);
    const pending = await collections.recordPayment(owner, 'i1', { amount: 25, method: 'CHEQUE' as any, receivedAt: '2026-11-01', templateId: t.id });
    expect(pending.receipt).toBeNull();
    const cleared = await collections.clearCheque(owner, 'i1', pending.payment.id, { clearedAt: '2026-11-02', templateId: t.id });
    expect(cleared.receipt!.templateSnapshot).toMatchObject({ version: 2, name: 'Second' });
    await receiptService.void(owner, result.receipt!.id, 'replace');
    expect((await receiptService.reissue(owner, result.receipt!.id, t.id)).templateSnapshot).toMatchObject({ version: 2 });
  });
});

describe('layout validator hardening', () => {
  const opts = { vatRegistered: false, docType: 'INVOICE' as const };
  it('rejects block ids that could break the preview markup', () => {
    expect(validateTemplateLayout({ version: 1, blocks: [{ id: 'x</style>', type: 'note', column: 'full' }] } as any, opts)).not.toHaveLength(0);
    expect(validateTemplateLayout({ version: 1, blocks: [{ id: 'note-1', type: 'note', column: 'full' }] } as any, opts)).toHaveLength(0);
  });
  it('caps logo size to 32–256 px', () => {
    expect(validateTemplateLayout({ version: 1, blocks: [{ id: 'l', type: 'logo', column: 'left', settings: { logoSize: 5000 } }] } as any, opts)).not.toHaveLength(0);
    expect(validateTemplateLayout({ version: 1, blocks: [{ id: 'l', type: 'logo', column: 'left', settings: { logoSize: 96 } }] } as any, opts)).toHaveLength(0);
  });
});
