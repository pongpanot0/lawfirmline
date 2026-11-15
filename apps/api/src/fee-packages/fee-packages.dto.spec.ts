import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateInvoiceDto } from '../billing/dto/billing.dto';
import { FeePackagesController } from './fee-packages.controller';
import { CloseOutFeeDto, SetCaseFeeDto, UpdateFeePackageDto } from './dto/fee-packages.dto';
import { REQUIRE_CAPABILITY_KEY } from '../saas/decorators/saas.decorators';

const id = '12345678-1234-4234-8234-123456789012';
describe('fee package HTTP boundary', () => {
  it('protects package writes with owner capability and reads with invoice capability', () => {
    expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, FeePackagesController)).toBe('manageInvoices');
    for (const name of ['create', 'update', 'archive'] as const) expect(Reflect.getMetadata(REQUIRE_CAPABILITY_KEY, FeePackagesController.prototype[name])).toBe('manageSubscription');
  });
  it('validates nested close-out lines and monetary bounds', async () => {
    expect(await validate(plainToInstance(CloseOutFeeDto, { items: [{ milestoneId: id, action: 'PARTIAL', amount: 10.25 }] }))).toHaveLength(0);
    expect((await validate(plainToInstance(CloseOutFeeDto, { items: [{ milestoneId: 'wrong', action: 'BAD', amount: -1 }] })))).not.toHaveLength(0);
    expect((await validate(plainToInstance(SetCaseFeeDto, { inputs: {}, agreedAmount: 100000001 })))).not.toHaveLength(0);
    expect((await validate(plainToInstance(UpdateFeePackageDto, { components: null })))).not.toHaveLength(0);
  });
  it('accepts milestone line overrides and rejects bad IDs/order with whitelist validation', async () => {
    expect(await validate(plainToInstance(CreateInvoiceDto, { milestoneLines: [{ id, description: 'งวดแรก', sortOrder: 0 }] }), { whitelist: true, forbidNonWhitelisted: true })).toHaveLength(0);
    for (const line of [{ id: 'bad' }, { id, sortOrder: -1 }, { id, description: ' ' }, { id, taxClass: 'ADVISORY_VAT' }]) {
      expect((await validate(plainToInstance(CreateInvoiceDto, { milestoneLines: [line] }), { whitelist: true, forbidNonWhitelisted: true }))).not.toHaveLength(0);
    }
  });
});
