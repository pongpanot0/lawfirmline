import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateExpenseDto, CreateStandaloneExpenseDto, ReturnCashAdvanceDto, SettleCashAdvanceDto,
  CashAdvanceReconciliationDto, UpdateExpenseReceiptNoDto, RecordPaymentDto, ClearChequeDto, VoidReceiptDto, BillingProfileDto } from './billing.dto';

describe('Cash advance and receipt DTOs', () => {
  it.each([CreateExpenseDto, CreateStandaloneExpenseDto])('accepts and trims optional officialReceiptNo on %p', async (Dto) => {
    const dto = plainToInstance(Dto, { amount: 100, description: 'ค่าธรรมเนียมศาล', officialReceiptNo: '  ศาล-123  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.officialReceiptNo).toBe('ศาล-123');
    dto.officialReceiptNo = 'x'.repeat(101);
    expect((await validate(dto)).some((error) => error.property === 'officialReceiptNo')).toBe(true);
    delete dto.officialReceiptNo;
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['  ศาล-123  ', null])('allows a trimmed string or explicit null for receipt updates: %s', async (value) => {
    const dto = plainToInstance(UpdateExpenseReceiptNoDto, { officialReceiptNo: value });
    expect(await validate(dto)).toEqual([]);
    expect(dto.officialReceiptNo).toBe(value === null ? null : 'ศาล-123');
  });

  it.each([undefined, 123, 'x'.repeat(101)])('rejects a missing, non-string or oversized receipt number: %s', async (value) => {
    const dto = plainToInstance(UpdateExpenseReceiptNoDto, { officialReceiptNo: value });
    expect((await validate(dto)).some((error) => error.property === 'officialReceiptNo')).toBe(true);
  });

  it.each([0, -1, NaN, Infinity, 1.001])('rejects an invalid return amount: %s', async (amount) => {
    const dto = plainToInstance(ReturnCashAdvanceDto, { amount });
    expect((await validate(dto)).some((error) => error.property === 'amount')).toBe(true);
  });

  it('accepts a positive two-decimal return and trims its optional note', async () => {
    const dto = plainToInstance(ReturnCashAdvanceDto, { amount: 100.25, note: '  รับคืน  ' });
    expect(await validate(dto)).toEqual([]);
    expect(dto.note).toBe('รับคืน');
  });

  it('allows settling without a note and bounds a supplied note', async () => {
    expect(await validate(plainToInstance(SettleCashAdvanceDto, {}))).toEqual([]);
    const dto = plainToInstance(SettleCashAdvanceDto, { note: 'x'.repeat(501) });
    expect((await validate(dto)).some((error) => error.property === 'note')).toBe(true);
  });

  it.each([undefined, 'open', 'settled'])('accepts the reconciliation status %s', async (status) => {
    expect(await validate(plainToInstance(CashAdvanceReconciliationDto, { status }))).toEqual([]);
  });

  it('rejects an unknown reconciliation status', async () => {
    expect((await validate(plainToInstance(CashAdvanceReconciliationDto, { status: 'other' })))
      .some((error) => error.property === 'status')).toBe(true);
  });
});

describe('round 1 billing input validation', () => {
  it.each([-1, 1.001, null, '3000', Infinity])('rejects invalid WHT %s', async whtAmount => {
    const errors = await validate(plainToInstance(RecordPaymentDto, { amount: 97000, whtAmount, receivedAt: '2026-11-01' }));
    expect(errors.some(e => e.property === 'whtAmount')).toBe(true);
  });
  it('accepts a nullable optional WHT rate and certificate with a nonnegative amount', async () => {
    expect(await validate(plainToInstance(RecordPaymentDto, { amount: 97000, whtAmount: 3000, whtRate: null, whtCertificateNo: null, receivedAt: '2026-11-01' }))).toEqual([]);
  });
  it.each(['2026-02-30', '2026-11-01T12:00:00Z', 'invalid'])('rejects an invalid clearing day %s', async clearedAt => {
    expect((await validate(plainToInstance(ClearChequeDto, { clearedAt }))).length).toBeGreaterThan(0);
  });
  it.each([' ', 'x'.repeat(501)])('rejects a blank or oversized void reason', async reason => {
    expect((await validate(plainToInstance(VoidReceiptDto, { reason }))).length).toBeGreaterThan(0);
  });
  it.each([{ taxId: '123' }, { vatRegistered: null }, { legalName: null }, { billingAddress: null }])('rejects an invalid billing profile %p', async profile => {
    expect((await validate(plainToInstance(BillingProfileDto, profile))).length).toBeGreaterThan(0);
  });
});
