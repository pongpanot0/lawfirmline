import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BindDocumentTemplatesDto, CreateDocumentTemplateDto, ResolveTemplateDto, TemplateChoiceDto, UpdateDocumentTemplateDto } from './dto/document-templates.dto';
import { InvoiceLineItemDto, RecordPaymentDto, ClearChequeDto } from '../billing/dto/billing.dto';
import { DocumentTemplatesController } from './document-templates.controller';
import { ClientsController } from '../clients/clients.controller';
import { REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';

const id = '11111111-1111-4111-8111-111111111111';
const errors = (Type: new () => object, value: object) => validateSync(plainToInstance(Type, value));

describe('document template API boundary', () => {
  it('validates required docType and trims the template name', () => {
    expect(errors(CreateDocumentTemplateDto, { name: '  ', docType: 'INVOICE' }).length).toBeGreaterThan(0);
    expect(errors(CreateDocumentTemplateDto, { name: 'x', docType: 'OTHER' }).length).toBeGreaterThan(0);
    expect(errors(ResolveTemplateDto, {}).length).toBeGreaterThan(0);
    expect(errors(CreateDocumentTemplateDto, { name: ' x ', docType: 'RECEIPT' })).toEqual([]);
    expect(errors(UpdateDocumentTemplateDto, { layout: null, isDefault: null }).length).toBeGreaterThan(0);
  });
  it('allows optional UUID choices, rejects null/foreign-shaped input, and lets bindings be cleared', () => {
    expect(errors(TemplateChoiceDto, {})).toEqual([]);
    expect(errors(TemplateChoiceDto, { templateId: id })).toEqual([]);
    expect(errors(TemplateChoiceDto, { templateId: null }).length).toBeGreaterThan(0);
    expect(errors(BindDocumentTemplatesDto, { invoiceTemplateId: null, receiptTemplateId: id })).toEqual([]);
    expect(errors(BindDocumentTemplatesDto, { invoiceTemplateId: 1 }).length).toBeGreaterThan(0);
    expect(errors(RecordPaymentDto, { templateId: id, amount: 1, receivedAt: '2026-11-01' })).toEqual([]);
    expect(errors(ClearChequeDto, { templateId: id, clearedAt: '2026-11-01' })).toEqual([]);
  });
  it.each([-1, 0.5, 2147483648, null])('rejects invalid line sortOrder %s', sortOrder => {
    expect(errors(InvoiceLineItemDto, { description: 'Fee', quantity: 1, unitPrice: 1, sortOrder }).length).toBeGreaterThan(0);
  });
  it('protects all template writes and client binding with manageSubscription', () => {
    for (const method of ['create', 'update', 'archive'] as const) {
      expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, DocumentTemplatesController.prototype[method])).toBe('manageSubscription');
    }
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, ClientsController.prototype.bindDocumentTemplates)).toBe('manageSubscription');
  });
});
