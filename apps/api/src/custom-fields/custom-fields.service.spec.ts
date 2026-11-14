import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AuthUser, CustomFieldDefinitionDto, FirmRole, PLAN_LIMIT_CUSTOM_FIELDS, SubscriptionPlan } from '@lawfirm/shared';
import { CustomFieldsService } from './custom-fields.service';

const user = (overrides: Partial<AuthUser> = {}): AuthUser => ({
  id: 'B', firmId: 'f1', firmRole: FirmRole.LAWYER, subscriptionPlan: SubscriptionPlan.TEAM,
  planGrandfathered: false, ...overrides,
} as AuthUser);
const input = { entityKind: 'CASE' as const, visibility: 'PERSONAL' as const, type: 'TEXT' as const, label: 'My field' };
const row = (overrides: Record<string, unknown> = {}) => ({
  id: 'd1', firmId: 'f1', entityKind: 'CASE', visibility: 'PERSONAL', ownerUserId: 'B',
  key: 'cf_12345678', label: 'My field', type: 'TEXT', options: null, required: false,
  caseTypeIds: [], section: null, sortOrder: 0, helpText: null, isSensitive: false,
  archivedAt: null, createdById: 'B', createdAt: new Date('2026-11-14'), updatedAt: new Date('2026-11-14'), ...overrides,
});

// Emulate persistence only: visibility and authorization must come from the service's query.
function matches(value: any, where: any): boolean {
  return Object.entries(where ?? {}).every(([key, want]: [string, any]) => {
    if (key === 'OR') return want.some((w: any) => matches(value, w));
    if (key === 'AND') return (Array.isArray(want) ? want : [want]).every((w: any) => matches(value, w));
    if (want && typeof want === 'object' && !(want instanceof Date)) {
      if ('in' in want) return want.in.includes(value[key]);
      if ('not' in want) return value[key] !== want.not;
    }
    return value[key] === want;
  });
}

function setup(initial: any[] = [], caseTypes = [{ id: 'ct1', firmId: 'f1' }]) {
  const rows = initial.map((r) => ({ ...r }));
  const prisma: any = {
    customFieldDefinition: {
      count: jest.fn(async ({ where }) => rows.filter((r) => matches(r, where)).length),
      findFirst: jest.fn(async ({ where }) => rows.find((r) => matches(r, where)) ?? null),
      findMany: jest.fn(async ({ where }) => rows.filter((r) => matches(r, where))),
      create: jest.fn(async ({ data }) => { const saved = row({ id: `d${rows.length + 1}`, ...data }); rows.push(saved); return saved; }),
      update: jest.fn(async ({ where, data }) => {
        const saved = rows.find((r) => matches(r, where));
        if (!saved) throw new Error('row not found');
        Object.assign(saved, Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined))); return saved;
      }),
    },
    caseType: { count: jest.fn(async ({ where }) => caseTypes.filter((r) => matches(r, where)).length) },
    $queryRaw: jest.fn(async () => [{ id: 'f1' }]),
  };
  prisma.$transaction = jest.fn(async (fn) => fn(prisma));
  return { service: new CustomFieldsService(prisma), prisma, rows };
}

const activeRows = (count: number, overrides: Record<string, unknown> = {}) => Array.from({ length: count }, (_, i) => row({ id: `d${i}`, key: `cf_${i}`, ...overrides }));

describe('CustomFieldsService', () => {
  it('PERSONAL create by plain member sets ownerUserId to user.id and returns DTO', async () => {
    const { service, rows } = setup();
    const created = await service.create(user(), input);
    expect(created).toMatchObject({ ownerUserId: 'B', options: [], archivedAt: null });
    expect(created.key).toMatch(/^cf_[a-z0-9]{8}$/);
    expect(rows[0]).toMatchObject({ firmId: 'f1', createdById: 'B', required: false, caseTypeIds: [] });
  });

  it('FIRM create without manageFirmContent returns 403', async () => {
    const { service, rows } = setup();
    await expect(service.create(user(), { ...input, visibility: 'FIRM' })).rejects.toBeInstanceOf(ForbiddenException);
    expect(rows).toHaveLength(0);
  });

  it.each([FirmRole.OWNER, FirmRole.OFFICE_MANAGER])('%s can create FIRM fields', async (firmRole) => {
    const { service } = setup();
    await expect(service.create(user({ firmRole }), { ...input, visibility: 'FIRM' })).resolves.toMatchObject({ visibility: 'FIRM', ownerUserId: null });
  });

  it.each([
    { ...input, required: true },
    { ...input, entityKind: 'CLIENT' as const, visibility: 'FIRM' as const, required: true },
  ])('required true on PERSONAL or CLIENT returns 400: %p', async (dto) => {
    const { service, rows } = setup();
    await expect(service.create(user({ firmRole: FirmRole.OWNER }), dto)).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('required firm CASE fields and in-firm case types are allowed', async () => {
    const { service } = setup();
    await expect(service.create(user({ firmRole: FirmRole.OWNER }), { ...input, visibility: 'FIRM', required: true, caseTypeIds: ['ct1'] }))
      .resolves.toMatchObject({ required: true, caseTypeIds: ['ct1'] });
  });

  it('caseTypeIds from another firm return 400', async () => {
    const { service, rows } = setup([], [{ id: 'foreign', firmId: 'f2' }]);
    await expect(service.create(user(), { ...input, caseTypeIds: ['foreign'] })).rejects.toBeInstanceOf(BadRequestException);
    expect(rows).toHaveLength(0);
  });

  it('CLIENT rejects caseTypeIds', async () => {
    await expect(setup().service.create(user(), { ...input, entityKind: 'CLIENT', caseTypeIds: ['ct1'] })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("editing another user's PERSONAL returns 404 even for an owner", async () => {
    const { service, rows } = setup([row({ ownerUserId: 'A' })]);
    await expect(service.update(user({ firmRole: FirmRole.OWNER }), 'd1', { label: 'changed' })).rejects.toBeInstanceOf(NotFoundException);
    expect(rows[0].label).toBe('My field');
  });

  it('listVisible for B excludes A PERSONAL, other firms/entities and archived by default', async () => {
    const { service, prisma } = setup([
      row(), row({ id: 'A', ownerUserId: 'A' }), row({ id: 'firm', visibility: 'FIRM', ownerUserId: null }),
      row({ id: 'foreign', firmId: 'f2', visibility: 'FIRM' }), row({ id: 'client', entityKind: 'CLIENT' }),
      row({ id: 'old', archivedAt: new Date('2026-11-14') }),
    ]);
    expect((await service.listVisible(user(), 'CASE')).map((d: CustomFieldDefinitionDto) => d.id)).toEqual(['d1', 'firm']);
    const archived = await service.listVisible(user(), 'CASE', { includeArchived: true });
    expect(archived.map((d: CustomFieldDefinitionDto) => d.id)).toEqual(['d1', 'firm', 'old']);
    expect(archived[2].archivedAt).toBe('2026-11-14T00:00:00.000Z');
    expect(prisma.customFieldDefinition.findMany).toHaveBeenCalledWith(expect.objectContaining({ orderBy: [{ section: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] }));
  });

  it('31st PERSONAL returns 400; other owners/entities/archived do not count', async () => {
    const full = setup(activeRows(30));
    await expect(full.service.create(user(), input)).rejects.toBeInstanceOf(BadRequestException);
    expect(full.rows).toHaveLength(30);
    const notFull = setup([...activeRows(29), row({ id: 'A', ownerUserId: 'A' }), row({ id: 'client', entityKind: 'CLIENT' }), row({ id: 'old', archivedAt: new Date() })]);
    await expect(notFull.service.create(user(), input)).resolves.toMatchObject({ ownerUserId: 'B' });
  });

  it('101st FIRM per entity returns 400', async () => {
    const { service } = setup(activeRows(100, { visibility: 'FIRM', ownerUserId: null }));
    await expect(service.create(user({ firmRole: FirmRole.OWNER }), { ...input, visibility: 'FIRM' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('archive keeps row and marks archivedAt; repeated archive is safe', async () => {
    const { service, rows } = setup([row()]);
    const archived = await service.archive(user(), 'd1');
    expect(archived.archivedAt).toEqual(expect.any(String));
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('cf_12345678');
    expect(await service.archive(user(), 'd1')).toEqual(archived);
  });

  it('FREE firm 6th active definition returns 403 PLAN_LIMIT_CUSTOM_FIELDS across owners and entities', async () => {
    const { service, rows } = setup([...activeRows(3, { entityKind: 'CLIENT', ownerUserId: 'A' }), ...activeRows(2, { id: 'firm', visibility: 'FIRM', ownerUserId: null })]);
    const err = await service.create(user({ subscriptionPlan: SubscriptionPlan.FREE }), input).catch((e: unknown) => e) as ForbiddenException;
    expect(err).toBeInstanceOf(ForbiddenException);
    expect(err.getResponse()).toMatchObject({ code: PLAN_LIMIT_CUSTOM_FIELDS });
    expect(JSON.stringify(err.getResponse())).not.toMatch(/บาท|฿|http|อัปเกรด/);
    expect(rows).toHaveLength(5);
  });

  it('FREE firm with 1 archived + 4 active can still create', async () => {
    const { service } = setup([...activeRows(4), row({ id: 'old', archivedAt: new Date() })]);
    await expect(service.create(user({ subscriptionPlan: SubscriptionPlan.FREE }), input)).resolves.toHaveProperty('key');
  });

  it('grandfathered FREE bypasses plan limit but retains per-user limits', async () => {
    const { service } = setup(activeRows(6));
    await expect(service.create(user({ subscriptionPlan: SubscriptionPlan.FREE, planGrandfathered: true }), input)).resolves.toHaveProperty('key');
    await expect(setup(activeRows(30)).service.create(user({ subscriptionPlan: SubscriptionPlan.FREE, planGrandfathered: true }), input)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('restore removes archivedAt, enforces active quotas and is safe when already active', async () => {
    const { service, rows } = setup([row({ archivedAt: new Date() })]);
    expect((await service.restore(user(), 'd1')).archivedAt).toBeNull();
    expect(rows).toHaveLength(1);
    expect((await service.restore(user(), 'd1')).archivedAt).toBeNull();
    const full = setup([...activeRows(5), row({ id: 'old', archivedAt: new Date() })]);
    await expect(full.service.restore(user({ subscriptionPlan: SubscriptionPlan.FREE }), 'old')).rejects.toMatchObject({ response: { code: PLAN_LIMIT_CUSTOM_FIELDS } });
  });

  it('FIRM edit/archive/restore/order require manageFirmContent', async () => {
    const { service } = setup([row({ visibility: 'FIRM', ownerUserId: null })]);
    await expect(service.update(user(), 'd1', { label: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.archive(user(), 'd1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.restore(user(), 'd1')).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.order(user(), ['d1'])).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('every mutation rejects rows from another firm', async () => {
    const { service, rows } = setup([row({ firmId: 'f2' })]);
    await expect(service.update(user(), 'd1', { label: 'x' })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.archive(user(), 'd1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.restore(user(), 'd1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.order(user(), ['d1'])).rejects.toBeInstanceOf(NotFoundException);
    expect(rows[0].archivedAt).toBeNull();
  });

  it('SELECT updates keep option ids and archive removed options; new options get ids', async () => {
    const { service } = setup([row({ type: 'SELECT', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] })]);
    const updated = await service.update(user(), 'd1', { options: [{ id: 'one', label: 'Renamed' }, { label: 'Three' }] });
    expect(updated.options).toEqual(expect.arrayContaining([{ id: 'one', label: 'Renamed' }, { id: 'two', label: 'Two', archived: true }, { id: expect.any(String), label: 'Three' }]));
    expect(updated.options[1].id).not.toBe('two');
  });

  it('SELECT caps all stored option ids at 50 while retaining archived options', async () => {
    const options = Array.from({ length: 50 }, (_, i) => ({ id: `opt${i}`, label: `Option ${i}` }));
    const { service, rows } = setup([row({ type: 'SELECT', options })]);
    await expect(service.update(user(), 'd1', { options: [...options.slice(1), { label: 'New' }] })).rejects.toBeInstanceOf(BadRequestException);
    expect(rows[0].options).toEqual(options);
    await expect(service.update(user(), 'd1', { options: options.map((opt) => ({ ...opt, label: 'Renamed' })) })).resolves.toHaveProperty('options', expect.any(Array));
    await expect(setup().service.create(user(), { ...input, type: 'SELECT', options: options.map(({ label }) => ({ label })) })).resolves.toHaveProperty('options', expect.any(Array));
  });

  it('SELECT rejects invented/duplicate option ids and non-SELECT options', async () => {
    const { service } = setup([row({ type: 'SELECT', options: [{ id: 'one', label: 'One' }] })]);
    await expect(service.update(user(), 'd1', { options: [{ id: 'foreign', label: 'X' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(user(), 'd1', { options: [{ id: 'one', label: 'X' }, { id: 'one', label: 'Y' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.create(user(), { ...input, options: [{ label: 'X' }] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.create(user(), { ...input, type: 'SELECT' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('only the creator may change isSensitive on a FIRM field', async () => {
    const { service } = setup([row({ visibility: 'FIRM', ownerUserId: null, createdById: 'A' })]);
    await expect(service.update(user({ firmRole: FirmRole.OWNER }), 'd1', { isSensitive: true })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.update(user({ id: 'A', firmRole: FirmRole.OWNER }), 'd1', { isSensitive: true })).resolves.toMatchObject({ isSensitive: true });
  });

  it('order updates only the requested accessible active rows', async () => {
    const { service, rows } = setup([row(), row({ id: 'd2', key: 'cf_22222222' })]);
    await service.order(user(), ['d2', 'd1']);
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 0]);
    await expect(service.order(user(), ['d1', 'd1'])).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.order(user(), ['d1', 'missing'])).rejects.toBeInstanceOf(NotFoundException);
    expect(rows.map((r) => r.sortOrder)).toEqual([1, 0]);
  });

  it('order rejects archived or invisible fields before changing any order', async () => {
    for (const extra of [row({ id: 'd2', archivedAt: new Date() }), row({ id: 'd2', ownerUserId: 'A' })]) {
      const { service, rows } = setup([row(), extra]);
      await expect(service.order(user(), ['d2', 'd1'])).rejects.toBeInstanceOf(NotFoundException);
      expect(rows[0].sortOrder).toBe(0);
    }
  });
});


describe('CustomFieldsService full definition inventory', () => {
  it('lists other users PERSONAL and archived definitions only from the requested firm and entity', async () => {
    const { service } = setup([
      row({ id: 'personal', visibility: 'PERSONAL', ownerUserId: 'A' }),
      row({ id: 'archived', archivedAt: new Date('2026-11-01') }),
      row({ id: 'foreign', firmId: 'other' }),
      row({ id: 'client', entityKind: 'CLIENT' }),
    ]);
    const defs = await service.listAllForFirm('f1', 'CASE');
    expect(defs.map(d => d.id)).toEqual(['personal', 'archived']);
    expect(defs[1].archivedAt).toBe('2026-11-01T00:00:00.000Z');
  });
});
