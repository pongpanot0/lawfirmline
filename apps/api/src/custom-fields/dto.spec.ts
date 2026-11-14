import { BadRequestException, Type, ValidationPipe } from '@nestjs/common';
import { CreateCustomFieldDto, UpdateCustomFieldDto, CustomFieldQueryDto, OrderCustomFieldsDto } from './dto/custom-field.dto';

const pipe = new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true });
const create = { entityKind: 'CASE', visibility: 'PERSONAL', label: 'Detail', type: 'TEXT' };
const validate = (value: unknown, metatype: Type<object> = CreateCustomFieldDto) => pipe.transform(value, { type: 'body', metatype });

describe('custom-field DTO trust boundary', () => {
  it('accepts valid create and partial update payloads', async () => {
    await expect(validate(create)).resolves.toMatchObject(create);
    await expect(validate({}, UpdateCustomFieldDto)).resolves.toEqual({});
  });

  it.each([
    { label: '' }, { label: '   ' }, { label: 'x'.repeat(81) }, { entityKind: 'OTHER' }, { visibility: 'PUBLIC' },
    { type: 'MONEY' }, { section: 'x'.repeat(61) }, { helpText: 'x'.repeat(201) },
    { required: 'true' }, { required: null }, { isSensitive: null }, { caseTypeIds: null }, { caseTypeIds: [123] },
    { options: [] }, { options: Array.from({ length: 51 }, () => ({ label: 'x' })) },
    { options: [{ label: '' }] }, { options: [{ label: 'x', id: 'injected' }] }, { options: null },
    { key: 'cf_injected' }, { firmId: 'foreign' }, { ownerUserId: 'A' },
  ])('rejects malformed or server-owned create properties %p', async (patch) => {
    await expect(validate({ ...create, ...patch })).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['type', 'key', 'entityKind', 'visibility', 'ownerUserId', 'firmId', 'archivedAt', 'sortOrder'])('update rejects immutable/server-owned %s', async (key) => {
    await expect(validate({ [key]: 'injected' }, UpdateCustomFieldDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('update accepts existing option ids, rejects malformed nested options', async () => {
    await expect(validate({ options: [{ id: 'one', label: 'Renamed' }, { label: 'New' }] }, UpdateCustomFieldDto)).resolves.toHaveProperty('options');
    await expect(validate({ options: [{ id: 12, label: 'Invalid' }] }, UpdateCustomFieldDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('list requires entityKind and only accepts exact archived query values', async () => {
    await expect(validate({ entityKind: 'CASE', includeArchived: 'false' }, CustomFieldQueryDto)).resolves.toMatchObject({ includeArchived: 'false' });
    await expect(validate({ entityKind: 'CASE', includeArchived: 'yes' }, CustomFieldQueryDto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(validate({}, CustomFieldQueryDto)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('order rejects duplicate or non-string ids', async () => {
    await expect(validate({ ids: ['a', 'a'] }, OrderCustomFieldsDto)).rejects.toBeInstanceOf(BadRequestException);
    await expect(validate({ ids: [5] }, OrderCustomFieldsDto)).rejects.toBeInstanceOf(BadRequestException);
  });
});
