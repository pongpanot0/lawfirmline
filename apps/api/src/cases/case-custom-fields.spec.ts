import { customFieldFilter } from '../custom-fields/custom-field-filter';
import { Prisma } from '../generated/prisma';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AuthUser, CustomFieldDefinitionDto } from '@lawfirm/shared';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomFieldValuesService } from '../custom-fields/custom-field-values.service';

import { CasesService } from './cases.service';
import { CasesController } from './cases.controller';
import { ClientsService } from '../clients/clients.service';
import { ClientsController } from '../clients/clients.controller';

const user = { id: 'B', firmId: 'firm' } as AuthUser;
const def = (key: string, overrides: Partial<CustomFieldDefinitionDto> = {}): CustomFieldDefinitionDto => ({
  id: key, key, label: key, entityKind: 'CASE', visibility: 'FIRM', ownerUserId: null,
  type: 'TEXT', options: [], required: false, caseTypeIds: [], section: null, sortOrder: 0,
  helpText: null, isSensitive: false, archivedAt: null, ...overrides,
});
const definitions = [def('cf_firm'), def('cf_personal', { visibility: 'PERSONAL', ownerUserId: 'A' }),
  def('cf_archived', { archivedAt: '2026-11-01' }), def('cf_sensitive', { isSensitive: true })];

function setup(entity: 'CASE' | 'CLIENT' = 'CASE') {
  let stored: Record<string, unknown> = { cf_firm: 'old', cf_personal: 'A only', cf_archived: 'retained', cf_sensitive: 'secret' };
  const row = () => ({ id: 'record', stage: 'PRE_LITIGATION', courtLevel: 'FIRST_INSTANCE', status: 'OPEN', leadLawyerId: 'B', customFields: { ...stored } });
  const records = {
    findFirst: jest.fn(async () => row()),
    update: jest.fn(async ({ data }) => { if (data.customFields !== undefined) stored = data.customFields; return row(); }),
  };
  const prisma: any = {
    case: { ...records, findUnique: jest.fn(async () => row()) }, client: records,
    emailThread: { findFirst: jest.fn(async () => null) },
    auditLog: { create: jest.fn(async () => ({})) },
    $queryRaw: jest.fn(async () => [{ id: 'record' }]),
    $transaction: jest.fn(async (fn) => {
      const before = { ...stored };
      try { return await fn(prisma); } catch (error) { stored = before; throw error; }
    }),
  };
  const all = definitions.map(d => ({ ...d, entityKind: entity }));
  const fields = { listAllForFirm: jest.fn(async () => all) };
  const access = { canAccessCase: jest.fn(async () => true), getClientFilterForUser: jest.fn(() => ({ firmId: 'firm' })), getTaskFilterForUser: () => ({}), getCaseFilterForUser: () => ({ firmId: 'firm' }) };
  const service = new CustomFieldValuesService(prisma, fields as unknown as CustomFieldsService, access as any);
  return { service, prisma, records, fields, access, stored: () => stored };
}

describe('custom field value writes', () => {
  it.each(['CASE', 'CLIENT'] as const)('%s merge keeps another user PERSONAL and archived values, and returns only visible values', async entity => {
    const { service, stored, fields } = setup(entity);
    const out = await service.setValues(user, entity, 'record', { cf_firm: 'new', chargeSection: 'legacy' });
    expect(stored()).toEqual({ cf_firm: 'new', cf_personal: 'A only', cf_archived: 'retained', cf_sensitive: 'secret', chargeSection: 'legacy' });
    expect(out.customFields).toEqual({ cf_firm: 'new', cf_archived: 'retained', cf_sensitive: 'secret', chargeSection: 'legacy' });
    expect(fields.listAllForFirm).toHaveBeenCalledWith('firm', entity);
  });

  it.each(['cf_foreign', 'cf_archived', 'cf_unknown', 'cf_personal'])('rejects %s and writes neither values nor audits', async key => {
    const { service, records, prisma, stored } = setup();
    const before = stored();
    await expect(service.setValues(user, 'CASE', 'record', { cf_firm: 'new', [key]: 'bad' })).rejects.toThrow(BadRequestException);
    expect(stored()).toEqual(before);
    expect(records.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it('audits each actual change with sensitive from/to hidden and stable source metadata', async () => {
    const { service, prisma } = setup();
    await service.setValues(user, 'CASE', 'record', { cf_firm: 'new', cf_sensitive: 'new secret' }, { source: 'MCP', auditMetadata: { via: 'mcp', clientName: 'test' } });
    expect(prisma.auditLog.create.mock.calls.map(([arg]: any[]) => arg.data)).toEqual([
      { firmId: 'firm', userId: 'B', action: 'CUSTOM_FIELD_VALUE_CHANGED', metadata: { entity: 'CASE', recordId: 'record', key: 'cf_firm', label: 'cf_firm', from: 'old', to: 'new', source: 'MCP', via: 'mcp', clientName: 'test' } },
      { firmId: 'firm', userId: 'B', action: 'CUSTOM_FIELD_VALUE_CHANGED', metadata: { entity: 'CASE', recordId: 'record', key: 'cf_sensitive', label: 'cf_sensitive', from: '[hidden]', to: '[hidden]', source: 'MCP', via: 'mcp', clientName: 'test' } },
    ]);
  });

  it('does not audit unchanged values and removes null patches', async () => {
    const { service, prisma, stored } = setup();
    await service.setValues(user, 'CASE', 'record', { cf_firm: 'old', cf_archived: 'retained' });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    await service.setValues(user, 'CASE', 'record', { cf_firm: null });
    expect(stored()).not.toHaveProperty('cf_firm');
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });

  it.each(['CASE', 'CLIENT'] as const)('%s refuses inaccessible records before writes', async entity => {
    const { service, access, records } = setup(entity);
    access.canAccessCase.mockResolvedValue(false);
    records.findFirst.mockResolvedValue(null as any);
    await expect(service.setValues(user, entity, 'foreign', { cf_firm: 'new' })).rejects.toThrow(NotFoundException);
    expect(records.update).not.toHaveBeenCalled();
  });

  it.each([null, [], 'bad', 1])('rejects malformed values %p', async values => {
    const { service, records } = setup();
    await expect(service.setValues(user, 'CASE', 'record', values as any)).rejects.toThrow(BadRequestException);
    expect(records.update).not.toHaveBeenCalled();
  });

  it('rolls back the value change if the audit cannot be saved', async () => {
    const { service, prisma, stored } = setup();
    prisma.auditLog.create.mockRejectedValue(new Error('audit unavailable'));
    await expect(service.setValues(user, 'CASE', 'record', { cf_firm: 'new' })).rejects.toThrow('audit unavailable');
    expect(stored().cf_firm).toBe('old');
  });
});


describe('custom field overview and PATCH boundaries', () => {
  function cases() {
    const fixture = setup();
    const service = new CasesService(fixture.prisma, fixture.access as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined, fixture.fields as any, fixture.service);
    return { ...fixture, cases: service };
  }
  it('overview saves merge through the shared writer without replacing another user PERSONAL value', async () => {
    const fixture = cases();
    const out = await fixture.cases.update(user, 'record', { customFields: { cf_firm: 'new', chargeSection: 'legacy' } });
    expect(fixture.stored()).toMatchObject({ cf_firm: 'new', cf_personal: 'A only', cf_archived: 'retained', chargeSection: 'legacy' });
    expect(out.customFields).not.toHaveProperty('cf_personal');
    expect(fixture.prisma.auditLog.create).toHaveBeenCalledTimes(1);
  });
  it.each(['cf_foreign', 'cf_archived', 'cf_unknown', 'cf_personal'])('overview rejects %s without writing the case', async key => {
    const fixture = cases();
    await expect(fixture.cases.update(user, 'record', { title: 'changed', customFields: { [key]: 'bad' } })).rejects.toThrow(BadRequestException);
    expect(fixture.prisma.case.update).not.toHaveBeenCalled();
  });
  it.each(['CASE', 'CLIENT'] as const)('%s PATCH delegates to the common writer and returns a redacted result', async entity => {
    const fixture = setup(entity);
    const controller = entity === 'CASE'
      ? new CasesController({} as any, {} as any, {} as any, fixture.service)
      : new ClientsController({} as any, {} as any, {} as any, fixture.service);
    const out = await controller.setCustomFields(user, 'record', { values: { cf_firm: 'new' } });
    expect(fixture.stored().cf_personal).toBe('A only');
    expect(out.customFields).not.toHaveProperty('cf_personal');
    expect(out.customFields.cf_firm).toBe('new');
  });
});


describe('custom field read redaction', () => {
  it('case detail and list omit another user PERSONAL and orphan cf_ values', async () => {
    const fixture = setup();
    const raw = { id: 'record', customFields: { ...fixture.stored(), cf_orphan: 'no definition', incidentDate: '2026-01-01' } };
    fixture.prisma.case.findUnique.mockResolvedValue(raw);
    fixture.prisma.case.findMany = jest.fn(async () => [raw]);
    const service = new CasesService(fixture.prisma, fixture.access as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined, fixture.fields as any, fixture.service);
    const expected = { cf_firm: 'old', cf_archived: 'retained', cf_sensitive: 'secret', incidentDate: '2026-01-01' };
    expect((await service.findOne(user, 'record')).customFields).toEqual(expected);
    expect((await service.findAll(user, {}))[0].customFields).toEqual(expected);
    expect((raw.customFields as Record<string, unknown>).cf_personal).toBe('A only');
  });
});


describe('custom field list filters', () => {
  const filterDefs = [...definitions, def('cf_choice', { type: 'SELECT', options: [{ id: 'opt1', label: 'Option 1' }] }), def('cf_number', { type: 'NUMBER' }), def('cf_bool', { type: 'BOOLEAN' })];
  it.each(['not-json', 'null', '[]', '"text"', '{"cf_personal":"x"}', '{"cf_unknown":1}', '{"cf_archived":"x"}', '{"cf_number":"12"}', '{"cf_choice":"bad"}', '{"chargeSection":"legacy"}'])('rejects invalid/unavailable filter %s', raw => {
    expect(() => customFieldFilter(raw, filterDefs, user.id)).toThrow(BadRequestException);
  });
  it('rejects more than five keys', () => {
    const defs = Array.from({ length: 6 }, (_, i) => def(`cf_${i}`));
    expect(() => customFieldFilter(JSON.stringify(Object.fromEntries(defs.map(d => [d.key, 'x']))), defs, user.id)).toThrow(BadRequestException);
  });
  it('builds SELECT id equality, keeping 0 and false typed', () => {
    expect(customFieldFilter('{"cf_choice":"opt1","cf_number":0,"cf_bool":false}', filterDefs, user.id)).toEqual([
      { customFields: { path: ['cf_choice'], equals: 'opt1' } },
      { customFields: { path: ['cf_number'], equals: 0 } },
      { customFields: { path: ['cf_bool'], equals: false } },
    ]);
  });
  it('builds an empty predicate including JSON null, SQL null and a missing key', () => {
    expect(customFieldFilter('{"cf_firm":"__empty"}', filterDefs, user.id)).toEqual([
      { OR: [
        { customFields: { path: ['cf_firm'], equals: Prisma.AnyNull } },
        { NOT: { customFields: { path: ['cf_firm'], not: Prisma.AnyNull } } },
      ] },
    ]);
  });
  it.each(['CASE', 'CLIENT'] as const)('%s filters retain the existing access predicate and add SELECT equality', async entity => {
    const fixture = setup(entity);
    fixture.fields.listAllForFirm.mockResolvedValue(filterDefs.map(d => ({ ...d, entityKind: entity })));
    fixture.prisma.case.findMany = jest.fn(async () => []);
    fixture.prisma.client.findMany = jest.fn(async () => []);
    const cf = '{"cf_choice":"opt1"}';
    if (entity === 'CASE') {
      const service = new CasesService(fixture.prisma, fixture.access as any, {} as any, {} as any, {} as any, {} as any, {} as any, undefined, fixture.fields as any, fixture.service);
      await service.findAll(user, { cf });
      expect(fixture.prisma.case.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'firm', AND: [{ customFields: { path: ['cf_choice'], equals: 'opt1' } }] } }));
    } else {
      const service = new ClientsService(fixture.prisma, fixture.access as any, fixture.fields as any);
      await service.findAll(user, undefined, cf);
      expect(fixture.prisma.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { AND: [{ firmId: 'firm' }, { customFields: { path: ['cf_choice'], equals: 'opt1' } }] } }));
    }
  });
});


describe('custom field response privacy on sibling case writes', () => {
  it.each(['MCP', 'AI'] as const)('%s shared-writer responses omit sensitive and all PERSONAL values', async source => {
    const fixture = setup();
    const out = await fixture.service.setValues(user, 'CASE', 'record', { cf_sensitive: 'changed' }, { source });
    expect(out.customFields).not.toHaveProperty('cf_sensitive');
    expect(out.customFields).not.toHaveProperty('cf_personal');
    expect(fixture.stored().cf_sensitive).toBe('changed');
  });

  it.each(['close', 'archive', 'reopen', 'updateAssignments'] as const)('%s cannot return another user PERSONAL value', async action => {
    const fixture = setup();
    const raw = { id: 'record', stage: 'HEARING', status: action === 'close' || action === 'updateAssignments' ? 'OPEN' : 'CLOSED', leadLawyerId: 'B', customFields: fixture.stored() };
    fixture.prisma.case.findUnique.mockResolvedValue(raw);
    fixture.prisma.case.findFirst.mockResolvedValue(raw);
    fixture.records.update.mockResolvedValue(raw as any);
    fixture.prisma.caseProceeding = { count: jest.fn(async () => 0) };
    fixture.prisma.caseStatusLog = { findFirst: jest.fn(async () => null) };
    fixture.prisma.caseAssignment = { findMany: jest.fn(async () => []), deleteMany: jest.fn(async () => ({})) };
    fixture.prisma.$transaction.mockImplementation(async (fn: any) => typeof fn === 'function' ? fn(fixture.prisma) : Promise.all(fn));
    for (const table of ['task', 'calendarEvent', 'document', 'timeEntry', 'expense', 'invoice']) fixture.prisma[table] = { findMany: jest.fn(async () => []) };
    const service = new CasesService(fixture.prisma, fixture.access as any, { log: jest.fn() } as any, {} as any, {} as any, {} as any, {} as any, undefined, fixture.fields as any, fixture.service);
    const out = action === 'close' ? await service.close(user, 'record', { closingSummary: 'Fixture close summary', outcome: 'WON' } as any)
      : action === 'updateAssignments' ? await service.updateAssignments(user, 'record', { buddyIds: [] })
      : await service[action](user, 'record');
    expect(out?.customFields).not.toHaveProperty('cf_personal');
    expect(out?.customFields).toHaveProperty('cf_firm', 'old');
  });
});
