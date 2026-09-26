import { BadRequestException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PleadingDraftService } from './pleading-draft.service';

jest.mock('../templates/docx-builder', () => ({ buildDocx: jest.fn().mockResolvedValue(Buffer.from('docx')) }));

const user = { id: 'u1', firmId: 'f1' } as AuthUser;
const legalCase = { id: 'c1', title: 'ผิดสัญญากู้ยืม', ownRef: 'K-001' };
const rows = [
  { documentId: 'd1', filename: 'สัญญา.pdf', pageStart: 2, pageEnd: 2, content: 'สัญญากู้ยืมเงิน 100,000 บาท', score: 0.9 },
  { documentId: 'd2', filename: 'ทวงถาม.pdf', pageStart: null, pageEnd: null, content: 'หนังสือทวงถาม', score: 0.8 },
];
const body = 'คำให้การ\n\nจำเลยทำสัญญากู้ยืมเงินกับโจทก์จริง [1]\n\nจำเลยไม่เคยได้รับหนังสือทวงถามใดๆ จากโจทก์ตามที่กล่าวอ้างในคำฟ้อง';

function setup(draftRow: Record<string, unknown> | null = null) {
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue(legalCase) },
    pleadingDraft: {
      create: jest.fn().mockImplementation(({ data }) => ({ id: 'p1', status: 'DRAFT', documentId: null, createdAt: new Date(), ...data })),
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn().mockResolvedValue(draftRow),
      update: jest.fn().mockImplementation(({ data }) => ({ ...draftRow, ...data })),
    },
  };
  const rag = {
    chatModel: jest.fn().mockReturnValue('gpt-test'),
    logRun: jest.fn(),
    ensureCaseIndexed: jest.fn(),
    retrieve: jest.fn().mockResolvedValue(rows),
  };
  const documents = { createFromBuffer: jest.fn().mockResolvedValue({ id: 'doc9' }) };
  const config = { get: jest.fn().mockReturnValue('sk-test') };
  const service = new PleadingDraftService(prisma as never, rag as never, documents as never, config as never);
  return { service, prisma, rag, documents };
}

const okFetch = () =>
  jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ choices: [{ message: { content: body } }], usage: { prompt_tokens: 120, completion_tokens: 80 } }),
  });

describe('PleadingDraftService', () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
  });

  it('generate stores the draft with numbered sources and logs the run', async () => {
    const { service, prisma, rag } = setup();
    const fetchMock = okFetch();
    global.fetch = fetchMock as never;

    const view = await service.generate(user, 'c1', { kind: 'ANSWER', instructions: 'ปฏิเสธหนี้' });

    expect(rag.ensureCaseIndexed).toHaveBeenCalledWith('c1', 'f1');
    expect(rag.retrieve).toHaveBeenCalledWith('c1', 'f1', 'คำให้การ ปฏิเสธหนี้ ผิดสัญญากู้ยืม', undefined, 'u1');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.model).toBe('gpt-test');
    expect(sent.messages[1].content).toContain('[1] สัญญา.pdf หน้า 2\nสัญญากู้ยืมเงิน 100,000 บาท');

    const data = prisma.pleadingDraft.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ firmId: 'f1', caseId: 'c1', kind: 'ANSWER', bodyText: body, createdById: 'u1' });
    expect(data.citations).toHaveLength(2);
    expect(rag.logRun).toHaveBeenCalledWith(
      expect.objectContaining({ operation: 'pleading_draft', inputTokens: 120, outputTokens: 80, caseId: 'c1', userId: 'u1' }),
    );
    expect(view.citations.map((c) => c.n)).toEqual([1]);
    expect(view.unsupportedParagraphs).toEqual([2]);
  });

  it('generate refuses when the case has no readable sources', async () => {
    const { service, rag } = setup();
    rag.retrieve.mockResolvedValue([]);
    global.fetch = okFetch() as never;
    await expect(service.generate(user, 'c1', { kind: 'COMPLAINT' })).rejects.toThrow(
      new BadRequestException('ยังไม่มีเอกสารในสำนวนที่ระบบอ่านได้ — อัปโหลดเอกสารก่อน'),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('generate logs a failed run and throws when the model call fails', async () => {
    const { service, rag, prisma } = setup();
    global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 }) as never;
    await expect(service.generate(user, 'c1', { kind: 'MOTION' })).rejects.toThrow();
    expect(rag.logRun).toHaveBeenCalledWith(expect.objectContaining({ operation: 'pleading_draft', status: 'error' }));
    expect(prisma.pleadingDraft.create).not.toHaveBeenCalled();
  });

  it('update refuses an approved draft', async () => {
    const { service, prisma } = setup({ id: 'p1', caseId: 'c1', status: 'APPROVED', bodyText: body, citations: [] });
    await expect(service.update(user, 'c1', 'p1', 'แก้ไข')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.pleadingDraft.update).not.toHaveBeenCalled();
  });

  it('approve saves a .docx to the case and marks the draft approved', async () => {
    const { service, prisma, documents } = setup({ id: 'p1', caseId: 'c1', kind: 'ANSWER', status: 'DRAFT', bodyText: body, citations: [] });
    const view = await service.approve(user, 'c1', 'p1');

    expect(documents.createFromBuffer).toHaveBeenCalledWith(user, 'c1', {
      filename: 'ร่างคำให้การ-K-001.docx',
      buffer: expect.any(Buffer),
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
    expect(prisma.pleadingDraft.update.mock.calls[0][0].data).toMatchObject({ status: 'APPROVED', approvedById: 'u1', documentId: 'doc9' });
    expect(view.documentId).toBe('doc9');
  });

  it('approve refuses a draft that is already approved', async () => {
    const { service, documents } = setup({ id: 'p1', caseId: 'c1', kind: 'ANSWER', status: 'APPROVED', bodyText: body, citations: [] });
    await expect(service.approve(user, 'c1', 'p1')).rejects.toBeInstanceOf(BadRequestException);
    expect(documents.createFromBuffer).not.toHaveBeenCalled();
  });
});
