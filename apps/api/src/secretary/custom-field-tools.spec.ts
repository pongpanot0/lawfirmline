import { AuthUser, FirmRole, SubscriptionPlan, PLAN_LIMIT_CUSTOM_FIELDS } from '@lawfirm/shared';
import { CustomFieldsService } from '../custom-fields/custom-fields.service';
import { CustomFieldValuesService } from '../custom-fields/custom-field-values.service';
import { SecretaryToolsService } from './secretary-tools.service';
import { AiWriteToolsService, AI_WRITE_SCHEMAS, AI_WRITE_TOOLS, describeAiWrite } from './ai-write-tools.service';
import { SecretaryChatService } from './secretary-chat.service';
import { SecretaryController } from './secretary.controller';
import { McpToolsService } from '../mcp/mcp-tools.service';
import { LineAiWriteService, LINE_AI_WRITES } from '../notifications/line-conversation/line-ai-write.service';
import { LineConversationStoreService } from '../notifications/line-conversation/line-conversation-store.service';
import { z } from 'zod';

const registered = new Map<string, any>();
jest.mock('@modelcontextprotocol/sdk/server/mcp.js', () => ({ McpServer: class {
  registerTool(name: string, config: any, run: any) { registered.set(name, { config, run }); }
} }));
const user = { id: 'u1', firmId: 'f1', firmSlug: 'firm', firmRole: FirmRole.LAWYER, subscriptionPlan: SubscriptionPlan.TEAM } as AuthUser;
const via = { auditPrefix: 'mcp' as const, auditMetadata: { connectionId: 'conn', clientName: 'Claude' }, clientName: 'Claude' };
const own = { firmId: 'f1', leadLawyerId: 'u1' };
const links = { originForSlug: () => 'https://firm.samnuan.com' };
const field = (overrides: any = {}) => ({
  id: 'd1', firmId: 'f1', entityKind: 'CASE', visibility: 'PERSONAL', ownerUserId: 'u1',
  key: 'cf_12345678', label: 'รายละเอียด', type: 'TEXT', options: [], required: false, caseTypeIds: [],
  section: null, sortOrder: 0, helpText: null, isSensitive: false, archivedAt: null,
  createdById: 'u1', createdAt: new Date(), updatedAt: new Date(), source: 'WEB', ...overrides,
});
const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, value]: [string, any]) => {
  if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((v: any) => matches(row, v));
  if (key === 'OR') return value.some((v: any) => matches(row, v));
  if (value && typeof value === 'object' && 'in' in value) return value.in.includes(row[key]);
  return row[key] === value;
});
function setup(initial: any[] = []) {
  const rows = initial.map(r => ({ ...r }));
  const record: { customFields: Record<string, unknown> } = { customFields: { legacy: 'kept', cf_otheruser: 'private' } };
  const prisma: any = {
    customFieldDefinition: {
      findMany: jest.fn(async ({ where }) => rows.filter(r => matches(r, where))),
      findFirst: jest.fn(async ({ where }) => rows.find(r => matches(r, where)) ?? null),
      count: jest.fn(async ({ where }) => rows.filter(r => matches(r, where)).length),
      create: jest.fn(async ({ data }) => { const r = field({ ...data, id: `d${rows.length + 1}` }); rows.push(r); return r; }),
      update: jest.fn(async ({ where, data }) => { const r = rows.find(r => matches(r, where)); Object.assign(r, Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined))); return r; }),
    },
    caseType: { findMany: jest.fn().mockResolvedValue([{ id: 'ct1', name: 'แพ่ง' }]), count: jest.fn().mockResolvedValue(1) },
    case: { findFirst: jest.fn().mockResolvedValue(record), update: jest.fn(async ({ data }) => Object.assign(record, data)) },
    client: { findFirst: jest.fn().mockResolvedValue(record), update: jest.fn(async ({ data }) => Object.assign(record, data)) },
    auditLog: { create: jest.fn() }, $queryRaw: jest.fn(),
    secretaryMessage: { createMany: jest.fn() },
  };
  prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));
  const access: any = { canAccessCase: jest.fn().mockResolvedValue(true), getCaseFilterForUser: () => ({ app: true }), getOwnCaseFilterForUser: () => own, getClientFilterForUser: () => ({ firmId: 'f1' }) };
  const defs = new CustomFieldsService(prisma);
  const values = new CustomFieldValuesService(prisma, defs, access);
  const writes = new (AiWriteToolsService as any)(prisma, access, {}, {}, {}, links, {}, {}, defs, values) as AiWriteToolsService;
  const reads = new (SecretaryToolsService as any)(prisma, access, {}, {}, {}, {}, {}, defs) as SecretaryToolsService;
  const chat = new SecretaryChatService({ get: () => 'test' } as any, reads, { logRun: jest.fn() } as any, prisma, writes);
  const controller = new SecretaryController({} as any, chat, {} as any);
  registered.clear();
  new McpToolsService(reads, links as any, {} as any, writes).createServer(user, { id: 'conn', clientName: 'Claude' });
  return { rows, prisma, record, writes, reads, chat, controller, values };
}
const call = async (name: string, args: any) => registered.get(name).run(args);
const tools = [
  ['create_custom_field', { entityKind: 'CASE', label: 'ใหม่', type: 'TEXT' }],
  ['update_custom_field', { field: 'cf_12345678', label: 'ชื่อใหม่' }],
  ['archive_custom_field', { field: 'cf_12345678' }],
  ['restore_custom_field', { field: 'cf_12345678' }],
  ['set_custom_field_values', { entity: 'CASE', id: 'c1', values: { รายละเอียด: 'ใหม่' } }],
] as const;

describe('Custom fields — shared MCP/secretary/LINE contracts', () => {
  afterEach(() => jest.restoreAllMocks());
  it('MCP creates PERSONAL with source MCP and audit; result includes structuredContent and app URL', async () => {
    const { rows, prisma } = setup();
    const out = await call('create_custom_field', { entityKind: 'CASE', label: 'ข้อมูล', type: 'TEXT' });
    expect(out.isError).toBeUndefined();
    expect(rows[0]).toMatchObject({ visibility: 'PERSONAL', ownerUserId: user.id, source: 'MCP' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'mcp.create_custom_field', metadata: expect.objectContaining({ connectionId: 'conn', clientName: 'Claude' }) }) });
    expect(out.structuredContent).toEqual(JSON.parse(out.content[0].text));
    expect(out.structuredContent.url).toBe('https://firm.samnuan.com/settings/custom-fields');
  });
  it('FIRM refusals are Thai and do not write; FREE cap preserves its error code', async () => {
    const { rows, prisma, writes } = setup();
    const out = await call('create_custom_field', { entityKind: 'CASE', visibility: 'FIRM', label: 'ข้อมูล', type: 'TEXT' });
    expect(out.isError).toBe(true);
    expect(out.structuredContent.error).toMatch(/[ก-๙]/);
    expect(rows).toHaveLength(0);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    rows.push(...Array.from({ length: 5 }, (_, i) => field({ id: `d${i}`, key: `cf_${i}` })));
    await expect(writes.run({ ...user, subscriptionPlan: SubscriptionPlan.FREE }, 'create_custom_field' as any, { entityKind: 'CLIENT', label: 'เพิ่ม', type: 'TEXT' }, via)).rejects.toMatchObject({ response: expect.objectContaining({ code: PLAN_LIMIT_CUSTOM_FIELDS }) });
  });
  it('list_custom_fields lists both entities, case type names and only visible active definitions', async () => {
    const { reads, prisma } = setup([field({ caseTypeIds: ['ct1'] }), field({ id: 'other', ownerUserId: 'u2', key: 'cf_other' }), field({ id: 'arch', archivedAt: new Date() }), field({ id: 'client', entityKind: 'CLIENT', visibility: 'FIRM' })]);
    const out = await call('list_custom_fields', {});
    expect(out.structuredContent.content.fields).toHaveLength(2);
    expect(out.structuredContent.content.fields[0]).toMatchObject({ key: 'cf_12345678', caseTypes: ['แพ่ง'] });
    expect(prisma.caseType.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ firmId: 'f1' }) }));
    expect((await reads.run(user, 'list_custom_fields', { entityKind: 'CLIENT' })).content).toMatchObject({ fields: [expect.objectContaining({ entityKind: 'CLIENT' })] });
  });
  it('resolves case type names in the firm; unknown names give Thai valid choices without writing', async () => {
    const { rows } = setup();
    const invalid = await call('create_custom_field', { entityKind: 'CASE', type: 'TEXT', label: 'ข้อมูล', caseTypeNames: ['ไม่มี'] });
    expect(invalid.structuredContent.error).toContain('แพ่ง');
    expect(rows).toHaveLength(0);
    await call('create_custom_field', { entityKind: 'CASE', type: 'TEXT', label: 'ข้อมูล', caseTypeNames: ['แพ่ง'] });
    expect(rows[0].caseTypeIds).toEqual(['ct1']);
  });
  it('label lookup and SELECT labels store keys/ids through setValues and audit via mcp', async () => {
    const { record, prisma, values } = setup([field({ type: 'SELECT', options: [{ id: 'opt1', label: 'หนึ่ง' }] })]);
    const spy = jest.spyOn(values, 'setValues');
    const out = await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values: { รายละเอียด: 'หนึ่ง' } });
    expect(out.isError).toBeUndefined();
    expect(record.customFields).toMatchObject({ cf_12345678: 'opt1', legacy: 'kept', cf_otheruser: 'private' });
    expect(spy).toHaveBeenCalledWith(user, 'CASE', 'c1', { cf_12345678: 'opt1' }, expect.objectContaining({ source: 'MCP', auditMetadata: expect.objectContaining({ via: 'mcp', connectionId: 'conn', clientName: 'Claude' }) }));
    expect(prisma.auditLog.create).toHaveBeenCalledWith({ data: expect.objectContaining({ action: 'CUSTOM_FIELD_VALUE_CHANGED', metadata: expect.objectContaining({ source: 'MCP', via: 'mcp', to: 'opt1' }) }) });
  });
  it.each(['CASE', 'CLIENT'])('%s outside own work refuses with no write', async entity => {
    const { prisma } = setup([field({ entityKind: entity })]);
    prisma.case.findFirst.mockResolvedValue(null); prisma.client.findFirst.mockResolvedValue(null);
    const out = await call('set_custom_field_values', { entity, id: 'other', values: { รายละเอียด: 'x' } });
    expect(out.structuredContent.error).toBe('ไม่พบข้อมูลนี้ในงานของคุณ');
    expect(prisma.case.update).not.toHaveBeenCalled(); expect(prisma.client.update).not.toHaveBeenCalled();
  });
  it('CLIENT scope requires a linked case under the existing scope', async () => {
    const { prisma } = setup([field({ entityKind: 'CLIENT' })]);
    await call('set_custom_field_values', { entity: 'CLIENT', id: 'client1', values: { รายละเอียด: 'x' } });
    const where = prisma.client.findFirst.mock.calls[0][0].where;
    expect(JSON.stringify(where)).toContain(JSON.stringify(own));
    expect(JSON.stringify(where)).toContain('cases');
    expect(prisma.client.update).toHaveBeenCalled();
  });
  it.each([
    [field({ ownerUserId: 'u2' }), { cf_12345678: 'x' }],
    [field({ type: 'NUMBER' }), { รายละเอียด: 'oops' }],
    [field({ archivedAt: new Date() }), { รายละเอียด: 'x' }],
  ])('invisible/archived keys or invalid types refuse in Thai with no write', async (def, values) => {
    const { prisma } = setup([def]);
    const out = await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values });
    expect(out.isError).toBe(true); expect(out.structuredContent.error).toMatch(/[ก-๙]/);
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
  it('sensitive values are absent from result, preview and audit', async () => {
    const { writes, prisma } = setup([field({ isSensitive: true })]);
    const args = { entity: 'CASE', id: 'c1', values: { รายละเอียด: 'SECRET_VALUE' } };
    const p = await writes.check(user, 'set_custom_field_values' as any, args);
    expect(describeAiWrite(p)).toContain('[ข้อมูลส่วนบุคคล]');
    expect(describeAiWrite(p)).not.toContain('SECRET_VALUE');
    const out = await call('set_custom_field_values', args);
    expect(JSON.stringify(out)).not.toContain('SECRET_VALUE');
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain('SECRET_VALUE');
  });
  it('rename/archive/restore preserve stored values and option ids; missing options are archived', async () => {
    const { rows, record, prisma } = setup([field({ type: 'SELECT', options: [{ id: 'a', label: 'เดิม' }, { id: 'b', label: 'เก็บ' }] })]);
    Object.assign(record.customFields, { cf_12345678: 'a' });
    await call('update_custom_field', { field: 'รายละเอียด', label: 'ชื่อใหม่', options: ['เก็บ', 'เพิ่ม'] });
    expect(rows[0].key).toBe('cf_12345678');
    expect(rows[0].options).toEqual(expect.arrayContaining([{ id: 'a', label: 'เดิม', archived: true }, { id: 'b', label: 'เก็บ' }, expect.objectContaining({ label: 'เพิ่ม' })]));
    await call('archive_custom_field', { field: 'ชื่อใหม่' });
    expect(rows[0].archivedAt).toBeInstanceOf(Date);
    await call('restore_custom_field', { field: 'cf_12345678' });
    expect(rows[0].archivedAt).toBeNull();
    expect(record.customFields.cf_12345678).toBe('a');
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.auditLog.create.mock.calls.map(([c]: any) => c.data.action)).toEqual(['mcp.update_custom_field', 'mcp.archive_custom_field', 'mcp.restore_custom_field']);
  });
  it('refuses another personal field and non-manager FIRM edits without audit', async () => {
    const { prisma } = setup([field({ ownerUserId: 'u2' }), field({ id: 'firm', key: 'cf_firm', label: 'สำนักงาน', visibility: 'FIRM' })]);
    for (const [name, args] of [['archive_custom_field', { field: 'cf_12345678' }], ['update_custom_field', { field: 'cf_firm', label: 'แก้' }]]) {
      const out = await call(name as string, args); expect(out.isError).toBe(true); expect(out.structuredContent.error).toMatch(/[ก-๙]/);
    }
    expect(prisma.customFieldDefinition.update).not.toHaveBeenCalled(); expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
  it('restore obeys FREE quota; immutable type is rejected by the registered MCP schema', async () => {
    const { writes } = setup([field({ archivedAt: new Date() }), ...Array.from({ length: 5 }, (_, i) => field({ id: `a${i}`, key: `cf_a${i}` }))]);
    await expect(writes.run({ ...user, subscriptionPlan: SubscriptionPlan.FREE }, 'restore_custom_field' as any, { field: 'cf_12345678' }, via)).rejects.toMatchObject({ response: expect.objectContaining({ code: PLAN_LIMIT_CUSTOM_FIELDS }) });
    const shape = registered.get('update_custom_field').config.inputSchema;
    const schema = shape instanceof z.ZodObject ? shape : z.object(shape);
    expect(schema.safeParse({ field: 'cf_12345678', type: 'NUMBER' }).success).toBe(false);
  });
  it('ambiguous labels refuse; exact keys disambiguate; duplicate aliases cannot overwrite silently', async () => {
    const { prisma } = setup([field(), field({ id: 'd2', key: 'cf_87654321' })]);
    expect((await call('archive_custom_field', { field: 'รายละเอียด' })).isError).toBe(true);
    expect((await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values: { รายละเอียด: 'x' } })).isError).toBe(true);
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect((await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values: { cf_12345678: 'x' } })).isError).toBeUndefined();
  });
  it('preserves MCP quota codes in structured errors', async () => {
    const { reads, writes } = setup(Array.from({ length: 5 }, (_, i) => field({ id: `d${i}`, key: `cf_${i}` })));
    new McpToolsService(reads, links as any, {} as any, writes).createServer({ ...user, subscriptionPlan: SubscriptionPlan.FREE }, { id: 'conn', clientName: 'Claude' });
    const out = await call('create_custom_field', { entityKind: 'CLIENT', type: 'TEXT', label: 'เพิ่ม' });
    expect(out.isError).toBe(true);
    expect(out.structuredContent).toMatchObject({ code: PLAN_LIMIT_CUSTOM_FIELDS, error: expect.stringMatching(/[ก-๙]/) });
  });
  it('changed labels preserve punctuation and NUMBER zero/BOOLEAN false reach the value service', async () => {
    const { record } = setup([field({ label: 'จำนวน: บาท', type: 'NUMBER' }), field({ id: 'd2', key: 'cf_87654321', label: 'ยืนยัน', type: 'BOOLEAN' })]);
    const out = await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values: { 'จำนวน: บาท': 0, ยืนยัน: false } });
    expect(out.structuredContent.changed).toEqual(['จำนวน: บาท', 'ยืนยัน']);
    expect(record.customFields).toMatchObject({ cf_12345678: 0, cf_87654321: false });
  });
  it('in-app AI is offered only the custom-field write tools', async () => {
    const { chat } = setup();
    const spy = jest.spyOn(chat, 'chat').mockResolvedValue({ reply: 'ok', cards: [] } as any);
    await chat.propose(user, [{ role: 'user', content: 'สร้างงาน' }]);
    const offered = (spy.mock.calls[0][2] as { writeTools: string[] }).writeTools;
    expect(offered.sort()).toEqual(['archive_custom_field', 'create_custom_field', 'restore_custom_field', 'set_custom_field_values', 'update_custom_field']);
  });
  it('in-app rejects cross-user/cross-firm/stale/expired confirmation tokens and concurrent replay', async () => {
    const { chat, prisma } = setup();
    const proposal = { tool: 'create_custom_field', args: { entityKind: 'CASE', label: 'ใหม่', type: 'TEXT' }, labels: {} };
    jest.spyOn(chat, 'chat').mockResolvedValue({ reply: 'ตรวจสอบ', cards: [], proposal } as any);
    const old = await chat.propose(user, [{ role: 'user', content: 'เพิ่ม' }]);
    const fresh = await chat.propose(user, [{ role: 'user', content: 'เพิ่ม' }]);
    for (const who of [{ ...user, id: 'u2' }, { ...user, firmId: 'other' }]) await expect(chat.confirm(who, fresh.proposalId!)).rejects.toThrow();
    await expect(chat.confirm(user, old.proposalId!)).rejects.toThrow();
    expect(prisma.customFieldDefinition.create).not.toHaveBeenCalled();
    const results = await Promise.allSettled([chat.confirm(user, fresh.proposalId!), chat.confirm(user, fresh.proposalId!)]);
    expect(results.map(r => r.status).sort()).toEqual(['fulfilled', 'rejected']);
    expect(prisma.customFieldDefinition.create).toHaveBeenCalledTimes(1);
    const expired = await chat.propose(user, [{ role: 'user', content: 'เพิ่ม' }]);
    const now = Date.now(); jest.spyOn(Date, 'now').mockReturnValue(now + 11 * 60 * 1000);
    await expect(chat.confirm(user, expired.proposalId!)).rejects.toThrow('หมดอายุ');
    expect(prisma.customFieldDefinition.create).toHaveBeenCalledTimes(1);
  });
  it('pins proposal field keys and option ids; confirm rechecks scope and archived options', async () => {
    const { writes, rows, prisma } = setup([field({ type: 'SELECT', options: [{ id: 'a', label: 'เดิม' }] })]);
    const p = await writes.check(user, 'set_custom_field_values' as any, { entity: 'CASE', id: 'c1', values: { รายละเอียด: 'เดิม' } });
    expect(p.args.values).toEqual({ cf_12345678: 'a' });
    rows[0].label = 'เปลี่ยนชื่อ'; rows[0].options[0].label = 'เปลี่ยนตัวเลือก';
    await writes.run(user, p.tool, p.args, via);
    prisma.case.update.mockClear(); rows[0].options[0].archived = true;
    await expect(writes.run(user, p.tool, p.args, via)).rejects.toThrow(/[ก-๙]/);
    expect(prisma.case.update).not.toHaveBeenCalled();
    rows[0].options[0].archived = false; prisma.case.findFirst.mockResolvedValue(null);
    await expect(writes.run(user, p.tool, p.args, via)).rejects.toThrow('ไม่พบข้อมูลนี้ในงานของคุณ');
    expect(prisma.case.update).not.toHaveBeenCalled();
  });
  it('in-app response never echoes sensitive proposal args, but confirm retains the value server-side', async () => {
    const { controller, record } = setup([field({ isSensitive: true })]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ id: 'w1', function: { name: 'set_custom_field_values', arguments: JSON.stringify({ entity: 'CASE', id: 'c1', values: { รายละเอียด: 'SECRET_VALUE' } }) } }] } }] }) } as any);
    const out = await controller.secretary(user, { messages: [{ role: 'user', content: 'กรอกข้อมูล' }] });
    expect(JSON.stringify(out)).not.toContain('SECRET_VALUE');
    expect(out.reply).toContain('[ข้อมูลส่วนบุคคล]');
    await (controller as any).confirmSecretary(user, { proposalId: (out as any).proposalId });
    expect(record.customFields.cf_12345678).toBe('SECRET_VALUE');
  });
  it('matches persisted field and option labels exactly, including surrounding spaces', async () => {
    const { record, rows } = setup([field({ label: ' รายละเอียด ', type: 'SELECT', options: [{ id: 'a', label: ' หนึ่ง ' }] })]);
    const out = await call('set_custom_field_values', { entity: 'CASE', id: 'c1', values: { ' รายละเอียด ': ' หนึ่ง ' } });
    expect(out.isError).toBeUndefined();
    expect(record.customFields.cf_12345678).toBe('a');
    expect((await call('update_custom_field', { field: ' รายละเอียด ', options: [' หนึ่ง '] })).isError).toBeUndefined();
    expect(rows[0].options).toEqual([{ id: 'a', label: ' หนึ่ง ' }]);
    expect((await call('archive_custom_field', { field: 'รายละเอียด' })).isError).toBe(true);
  });
  it.each(tools)('in-app %s proposes without field writes, then confirm executes exactly once as AI', async (name, args) => {
    const { controller, chat, prisma, rows } = setup([field({ archivedAt: name === 'restore_custom_field' ? new Date() : null })]);
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { tool_calls: [{ id: 'w1', function: { name, arguments: JSON.stringify(args) } }] } }] }) } as any);
    const out = await controller.secretary(user, { messages: [{ role: 'user', content: 'ทำรายการนี้' }] });
    expect(out.proposal?.tool).toBe(name);
    expect((out as any).proposalId).toEqual(expect.any(String));
    expect(prisma.customFieldDefinition.create).not.toHaveBeenCalled(); expect(prisma.customFieldDefinition.update).not.toHaveBeenCalled(); expect(prisma.case.update).not.toHaveBeenCalled();
    const confirm = (controller as any).confirmSecretary.bind(controller);
    await confirm(user, { proposalId: (out as any).proposalId });
    expect(prisma.auditLog.create).toHaveBeenCalled();
    if (name === 'create_custom_field') expect(rows.at(-1).source).toBe('AI');
    if (name === 'set_custom_field_values') expect(prisma.auditLog.create.mock.calls[0][0].data.metadata.source).toBe('AI');
    await expect(confirm(user, { proposalId: (out as any).proposalId })).rejects.toThrow();
  });
  it.each(tools)('LINE %s holds until confirm and saves as AI with safe reply', async (name, args) => {
    const { writes, prisma, rows } = setup([field({ archivedAt: name === 'restore_custom_field' ? new Date() : null, isSensitive: true })]);
    const p = await writes.check(user, name as any, args);
    const store = new LineConversationStoreService();
    const line = new LineAiWriteService(store, writes, { record: jest.fn() } as any, links as any);
    expect(LINE_AI_WRITES).toContain(name);
    const buttons = line.hold(user, 'L1', p);
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    const reply = await line.confirm(user, 'L1', buttons[0].data!.split(':').at(-1)!);
    expect(reply).toContain('บันทึก'); expect(reply).not.toContain('บันทึกไม่สำเร็จ');
    expect(prisma.auditLog.create).toHaveBeenCalled();
    if (name === 'create_custom_field') expect(rows.at(-1).source).toBe('AI');
    store.clear('L1');
  });
});
