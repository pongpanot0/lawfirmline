import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { PrismaService } from '../prisma/prisma.module';
import { ConfigService } from '@nestjs/config';
import { IappLegalClient } from '../intelligence/iapp-legal.client';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { RelevanceService } from '../rag/relevance.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { AuthUser, FirmRole } from '@lawfirm/shared';

const user = { id: 'u1', firmId: 'f1', firmRole: FirmRole.LAWYER } as AuthUser;
const text = 'รถชนท้าย บริษัทประกันจ่ายค่าซ่อม 50000 บาท';
const fact = { statement: 'บริษัทประกันจ่ายค่าซ่อม 50000 บาท', quote: 'บริษัทประกันจ่ายค่าซ่อม 50000 บาท', page: null, status: 'PENDING', source: 'ข้อความที่ผู้ใช้ระบุ', revisions: [] };
function setup() {
  const rows = { create: jest.fn(async ({ data }) => ({ id: 'r1', ...data })), findMany: jest.fn(async () => []), findFirst: jest.fn(), updateMany: jest.fn(async () => ({ count: 1 })), findUniqueOrThrow: jest.fn() };
  const prisma = { intakePrecedentAnalysis: rows, document: { findMany: jest.fn(async () => []) } };
  const access = { canAccessCase: jest.fn(async () => true), getCaseFilterForUser: jest.fn(() => ({ firmId: 'f1', leadLawyerId: 'u1' })) };
  const iapp = { searchPrecedents: jest.fn(async () => []), getPrecedentDetail: jest.fn() };
  const intel = { extractFactsWithAI: jest.fn(async () => ({ facts: [fact], flags: [] })), extractTextWithOcr: jest.fn(async () => text) };
  const service = new IntakePrecedentAnalysisService(prisma as unknown as PrismaService, { get: () => 'test-key' } as unknown as ConfigService, iapp as unknown as IappLegalClient, intel as unknown as DocumentIntelligenceService, { getBuffer: async () => Buffer.from(text) } as unknown as FileStorageService, { selectRelevant: async () => null } as unknown as RelevanceService, access as unknown as CaseAccessService);
  jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
    const body = JSON.parse(init?.body as string);
    const content = body.response_format ? JSON.stringify({ documentSummary: text, factsList: [text], timeline: [], summaryBullets: '', noticeFacts: text }) : 'สิทธิไล่เบี้ย';
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as Response;
  });
  return { service, rows, prisma, access, iapp, intel };
}
afterEach(() => jest.restoreAllMocks());

describe('research workspace', () => {
  it('persists a text-only search in the current user and firm history', async () => {
    const { service, rows, iapp } = setup();
    const result = await service.research(user, text);
    expect(iapp.searchPrecedents).toHaveBeenCalledWith('สิทธิไล่เบี้ย', { topK: 5 });
    expect(result).toMatchObject({ firmId: 'f1', createdById: 'u1', extractedFacts: { factItems: [expect.objectContaining({ quote: fact.quote, status: 'PENDING' })] } });
    await service.listResearch(user);
    expect(rows.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: 'f1', createdById: 'u1', intakeId: null, caseId: null } }));
  });
  it('facts-only mode never calls the precedent provider', async () => {
    const { service, iapp, intel } = setup();
    await service.research(user, text, undefined, [], true);
    expect(iapp.searchPrecedents).not.toHaveBeenCalled();
    expect(intel.extractFactsWithAI).toHaveBeenCalledWith(text, { strict: true });
  });
  it('summarizes selected documents without searching precedents or extracting review facts', async () => {
    const { service, prisma, iapp, intel } = setup();
    (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 'd1', filename: 'claim.txt', mimeType: 'text/plain', storagePath: 'claim', version: 2 }]);
    const result = await service.summarizeDocuments(user, undefined, 'case1', ['d1']);
    expect(result).toMatchObject({ caseId: 'case1', documentSummary: text, extractedFacts: { summaryOnly: true, description: null, selectedAttachments: [{ id: 'd1', filename: 'claim.txt', version: 2 }] } });
    expect(iapp.searchPrecedents).not.toHaveBeenCalled();
    expect(intel.extractFactsWithAI).not.toHaveBeenCalled();
  });
  it('rejects summary without files and foreign or unreadable files', async () => {
    const { service, prisma, intel, rows } = setup();
    await expect(service.summarizeDocuments(user, undefined, 'case1', [])).rejects.toThrow(BadRequestException);
    await expect(service.summarizeDocuments(user, undefined, 'case1', ['foreign'])).rejects.toThrow(BadRequestException);
    (prisma.document.findMany as jest.Mock).mockResolvedValue([{ id: 'd1', filename: 'claim.txt', mimeType: 'text/plain', storagePath: 'claim', version: 1 }]);
    intel.extractTextWithOcr.mockResolvedValue('');
    await expect(service.summarizeDocuments(user, undefined, 'case1', ['d1'])).rejects.toThrow(BadRequestException);
    expect(rows.create).not.toHaveBeenCalled();
  });
  it('refuses document summary for an inaccessible case before reading files', async () => {
    const { service, access, prisma } = setup(); access.canAccessCase.mockResolvedValue(false);
    await expect(service.summarizeDocuments(user, undefined, 'case2', ['d1'])).rejects.toThrow(NotFoundException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
  it('rejects empty input without charging or creating a record', async () => {
    const { service, rows } = setup();
    await expect(service.research(user, '  ')).rejects.toThrow(BadRequestException);
    expect(rows.create).not.toHaveBeenCalled();
  });
  it('does not persist a successful result when fact extraction fails', async () => {
    const { service, rows, intel } = setup();
    intel.extractFactsWithAI.mockRejectedValueOnce(new Error('provider down'));
    await expect(service.research(user, text)).rejects.toThrow('provider down');
    expect(rows.create).not.toHaveBeenCalled();
  });
  it('refuses a case outside the current user scope before reading files', async () => {
    const { service, access, prisma } = setup(); access.canAccessCase.mockResolvedValue(false);
    await expect(service.research(user, text, undefined, [], false, 'case2')).rejects.toThrow(NotFoundException);
    expect(prisma.document.findMany).not.toHaveBeenCalled();
  });
  it('rejects a foreign attachment instead of silently dropping it', async () => {
    const { service } = setup();
    await expect(service.research(user, text, undefined, ['foreign'], true, 'case1')).rejects.toThrow(BadRequestException);
  });
  it('saves case results with their case context', async () => {
    const { service } = setup();
    expect(await service.research(user, text, undefined, [], true, 'case1')).toMatchObject({ caseId: 'case1', firmId: 'f1' });
  });
  it('scopes fact review and preserves a revision without mutating the source record', async () => {
    const { service, rows } = setup();
    const row = { id: 'r1', status: 'COMPLETE', extractedFacts: { factItems: [structuredClone(fact)] } };
    rows.findFirst.mockResolvedValue(row);
    await service.reviewFact(user, 'r1', 0, { statement: fact.statement, status: 'REVIEWED', expectedStatement: fact.statement, expectedStatus: 'PENDING' });
    expect(rows.findFirst.mock.calls[0][0].where.OR).toContainEqual({ case: { firmId: 'f1', leadLawyerId: 'u1' } });
    expect(row.extractedFacts.factItems[0].status).toBe('PENDING');
    expect(rows.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r1', extractedFacts: { equals: row.extractedFacts } }, data: { extractedFacts: { factItems: [expect.objectContaining({ status: 'REVIEWED', revisions: [expect.objectContaining({ statement: fact.statement })] })] } } }));
  });
  it('rejects stale concurrent review', async () => {
    const { service, rows } = setup(); rows.findFirst.mockResolvedValue({ status: 'COMPLETE', extractedFacts: { factItems: [fact] } }); rows.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.reviewFact(user, 'r1', 0, { statement: fact.statement, status: 'REVIEWED', expectedStatement: fact.statement, expectedStatus: 'PENDING' })).rejects.toThrow(ConflictException);
  });
  it('cannot approve an unsupported AI observation', async () => {
    const { service, rows } = setup(); rows.findFirst.mockResolvedValue({ status: 'COMPLETE', extractedFacts: { factItems: [{ ...fact, quote: '' }] } });
    await expect(service.reviewFact(user, 'r1', 0, { statement: fact.statement, status: 'REVIEWED', expectedStatement: fact.statement, expectedStatus: 'PENDING' })).rejects.toThrow(BadRequestException);
    expect(rows.updateMany).not.toHaveBeenCalled();
  });
});
