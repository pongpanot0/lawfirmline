import { BadGatewayException, BadRequestException } from '@nestjs/common';
import type { AuthUser } from '@lawfirm/shared';
import { SecretaryChatService } from './secretary-chat.service';

describe('SecretaryChatService', () => {
  const user = { id: 'u1', firmId: 'f1', firstName: 'สมชาย', lastName: 'ใจดี' } as AuthUser;
  const NAMES = ['find_matters', 'case_overview', 'search_documents', 'read_document', 'list_events'];
  let fetchSpy: jest.SpyInstance;

  function build() {
    const config = { get: jest.fn((k: string) => (k === 'OPENAI_API_KEY' ? 'sk-test' : undefined)) };
    const tools = {
      definitions: jest.fn().mockReturnValue(NAMES.map((name) => ({ type: 'function', function: { name, description: '', parameters: {} } }))),
      run: jest.fn().mockResolvedValue({ content: { ok: 1 }, cards: [{ type: 'case', id: 'c1', title: 'A', ownRef: null }] }),
    };
    const rag = { logRun: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      secretaryMessage: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findMany: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
    };
    return { svc: new SecretaryChatService(config as any, tools as any, rag as any, prisma as any), tools, rag, prisma };
  }
  const json = (body: unknown, ok = true, status = 200) => ({ ok, status, json: async () => body, text: async () => '' }) as any;
  const final = (content: string) => json({ choices: [{ message: { content } }], usage: { prompt_tokens: 10, completion_tokens: 5 } });
  const toolCall = (id = 't1') =>
    json({
      choices: [{ message: { content: null, tool_calls: [{ id, type: 'function', function: { name: 'find_matters', arguments: '{"query":"x"}' } }] } }],
      usage: { prompt_tokens: 10, completion_tokens: 5 },
    });
  const body = (i: number) => JSON.parse(fetchSpy.mock.calls[i][1].body);
  const msgs = [{ role: 'user' as const, content: 'hi' }];

  beforeEach(() => { fetchSpy = jest.spyOn(global, 'fetch' as any); });
  afterEach(() => fetchSpy.mockRestore());

  it('sends tools and the system prompt', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(final('ok'));
    await svc.chat(user, msgs);
    const b = body(0);
    expect(b.tools.map((t: any) => t.function.name)).toEqual(NAMES);
    expect(b.tool_choice).toBe('auto');
    expect(b.model).toBe('gpt-4o-mini');
    const sys = b.messages[0].content;
    for (const s of ['ตอบจากข้อมูลที่เครื่องมือส่งกลับเท่านั้น', 'ถ้าไม่มีข้อมูลให้บอกว่าไม่มีข้อมูล', 'อ่านอย่างเดียว', 'สมชาย', new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date())])
      expect(sys).toContain(s);
  });

  it('asks which case when find_matters returns several', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(final('ok'));
    await svc.chat(user, msgs);
    expect(body(0).messages[0].content).toContain('ถ้า find_matters พบมากกว่าหนึ่งเรื่อง ให้แสดงรายการผู้สมัครและถามผู้ใช้ว่าหมายถึงเรื่องไหน');
  });

  it('executes tool calls and feeds results back, deduping cards', async () => {
    const { svc, tools } = build();
    fetchSpy.mockResolvedValueOnce(toolCall('a')).mockResolvedValueOnce(toolCall('b')).mockResolvedValueOnce(final('done'));
    const r = await svc.chat(user, msgs);
    expect(tools.run).toHaveBeenCalledWith(user, 'find_matters', { query: 'x' });
    expect(r.reply).toBe('done');
    expect(r.cards).toHaveLength(1);
    expect(body(1).messages.some((m: any) => m.role === 'tool' && m.tool_call_id === 'a')).toBe(true);
  });

  it('redacts history before sending', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(final('ok'));
    await svc.chat(user, [{ role: 'user', content: 'บัตร 1101700203451 โทร 0812345678' }]);
    const sent = body(0).messages[1].content;
    expect(sent).not.toContain('1101700203451');
    expect(sent).not.toContain('0812345678');
  });

  it('runs tool calls in a round in parallel', async () => {
    const { svc, tools } = build();
    const two = json({ choices: [{ message: { content: null, tool_calls: [1, 2].map((i) => ({ id: `p${i}`, type: 'function', function: { name: 'find_matters', arguments: '{}' } })) } }] });
    fetchSpy.mockResolvedValueOnce(two).mockResolvedValueOnce(final('ok'));
    let started = 0;
    tools.run.mockImplementation(async () => { started++; await new Promise((r) => setTimeout(r, 0)); expect(started).toBe(2); return { content: {}, cards: [] }; });
    await svc.chat(user, msgs);
    expect(body(1).messages.filter((m: any) => m.role === 'tool').map((m: any) => m.tool_call_id)).toEqual(['p1', 'p2']);
  });

  it('prompt has language and staff-only rules', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(final('ok'));
    await svc.chat(user, msgs);
    const sys = body(0).messages[0].content;
    expect(sys).toContain('ตอบเป็นภาษาไทย เว้นแต่ผู้ใช้เขียนเป็นภาษาอังกฤษ');
    expect(sys).toContain('คุณคุยกับเจ้าหน้าที่สำนักงานเท่านั้น ห้ามร่างข้อความถึงลูกความ');
  });

  it('keeps only the last 10 messages', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(final('ok'));
    const many = Array.from({ length: 15 }, (_, i) => ({ role: i % 2 ? ('assistant' as const) : ('user' as const), content: `m${i}` }));
    many[14] = { role: 'user', content: 'last' };
    await svc.chat(user, many);
    expect(body(0).messages).toHaveLength(11);
  });

  it('stops after 4 tool rounds', async () => {
    const { svc } = build();
    fetchSpy.mockImplementation(async (_u: any, init: any) => (JSON.parse(init.body).tool_choice === 'none' ? final('forced') : toolCall()));
    const r = await svc.chat(user, msgs);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    expect(body(4).tool_choice).toBe('none');
    expect(r.reply).toBe('forced');
  });

  it('returns 502 on upstream failure', async () => {
    const { svc, rag } = build();
    fetchSpy.mockResolvedValue(json({}, false, 500));
    await expect(svc.chat(user, msgs)).rejects.toBeInstanceOf(BadGatewayException);
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'secretary_chat', status: 'error' }));
  });

  it('every OpenAI call carries a timeout signal', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValue(json({}, false, 500));
    await expect(svc.chat(user, msgs)).rejects.toBeInstanceOf(BadGatewayException);
    await svc.transcribe(user, { mimetype: 'audio/webm', buffer: Buffer.from('a'), originalname: 'a.webm' } as any).catch(() => undefined);
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    for (const [, init] of fetchSpy.mock.calls) expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('logs secretary_chat with summed tokens', async () => {
    const { svc, rag } = build();
    fetchSpy.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(final('x'));
    await svc.chat(user, msgs);
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'secretary_chat', firmId: 'f1', userId: 'u1', inputTokens: 20, outputTokens: 10, status: 'success' }));
  });

  it('transcribe posts multipart with language th and logs', async () => {
    const { svc, rag } = build();
    fetchSpy.mockResolvedValue(json({ text: 'สวัสดี' }));
    const r = await svc.transcribe(user, { mimetype: 'audio/webm', buffer: Buffer.from('a'), originalname: 'a.webm' } as any);
    expect(r).toEqual({ text: 'สวัสดี' });
    expect(fetchSpy.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    const form = fetchSpy.mock.calls[0][1].body as FormData;
    expect(form.get('language')).toBe('th');
    expect(form.get('model')).toBe('gpt-4o-mini-transcribe');
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'secretary_transcribe' }));
  });

  it('transcribe rejects non-audio', async () => {
    const { svc } = build();
    await expect(svc.transcribe(user, { mimetype: 'application/pdf', buffer: Buffer.from('a') } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('saves the question and the reply with its cards after a successful answer', async () => {
    const { svc, prisma } = build();
    fetchSpy.mockResolvedValueOnce(toolCall()).mockResolvedValueOnce(final('ตอบแล้ว'));
    await svc.chat(user, msgs);
    const rows = prisma.secretaryMessage.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => [r.role, r.content, r.userId, r.firmId])).toEqual([['user', 'hi', 'u1', 'f1'], ['assistant', 'ตอบแล้ว', 'u1', 'f1']]);
    expect(rows[1].cards).toEqual([{ type: 'case', id: 'c1', title: 'A', ownRef: null }]);
    expect(rows[1].createdAt.getTime()).toBeGreaterThan(rows[0].createdAt.getTime());
  });

  it('still answers when saving history fails, and saves nothing when the AI fails', async () => {
    const { svc, prisma } = build();
    prisma.secretaryMessage.createMany.mockRejectedValueOnce(new Error('db down'));
    fetchSpy.mockResolvedValueOnce(final('ok'));
    await expect(svc.chat(user, msgs)).resolves.toEqual({ reply: 'ok', cards: [] });
    prisma.secretaryMessage.createMany.mockClear();
    fetchSpy.mockResolvedValueOnce(json({}, false, 500));
    await expect(svc.chat(user, msgs)).rejects.toBeInstanceOf(BadGatewayException);
    expect(prisma.secretaryMessage.createMany).not.toHaveBeenCalled();
  });

  it('history returns only the caller\'s own chat, oldest first', async () => {
    const { svc, prisma } = build();
    prisma.secretaryMessage.findMany.mockResolvedValue([
      { role: 'assistant', content: 'b', cards: [{ type: 'case', id: 'c1', title: 'A', ownRef: null }] },
      { role: 'user', content: 'a', cards: null },
    ]);
    const h = await svc.history(user);
    expect(prisma.secretaryMessage.findMany.mock.calls[0][0].where).toEqual({ firmId: 'f1', userId: 'u1' });
    expect(h).toEqual([{ role: 'user', content: 'a', cards: [] }, { role: 'assistant', content: 'b', cards: [{ type: 'case', id: 'c1', title: 'A', ownRef: null }] }]);
  });

  it('clearHistory deletes only the caller\'s own chat', async () => {
    const { svc, prisma } = build();
    expect(await svc.clearHistory(user)).toEqual({ deleted: 3 });
    expect(prisma.secretaryMessage.deleteMany).toHaveBeenCalledWith({ where: { firmId: 'f1', userId: 'u1' } });
  });

  it('keeps the per-user line at the end of the system prompt so the prefix is cacheable', async () => {
    const { svc } = build();
    fetchSpy.mockResolvedValueOnce(final('ok'));
    await svc.chat(user, msgs);
    const sys: string = body(0).messages[0].content;
    expect(sys.startsWith('คุณคือเลขาส่วนตัว AI ในสำนักงานกฎหมาย')).toBe(true);
    expect(sys.split('\n').at(-1)).toContain('สมชาย ใจดี');
  });
});
