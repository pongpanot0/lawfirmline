import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { validate } from 'class-validator';
import { DocumentIntelligenceService } from './document-intelligence.service';
import { IntelligenceController } from './intelligence.controller';
import { BatchAnalysisDto } from './dto/batch-analysis.dto';
import { CaseAccessGuard } from '../common/guards/case-access.guard';
import { REQUIRE_CREDITS_KEY } from '../common/decorators/require-credits.decorator';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

describe('selected document batch analysis', () => {
  const create = jest.fn();
  const config = { get: jest.fn().mockReturnValue('test-key') };
  const service = new DocumentIntelligenceService(
    { caseKnowledge: { create } } as unknown as PrismaService,
    config as unknown as ConfigService,
  );
  const file = (filename: string, text: string) => ({
    filename,
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  beforeEach(() => {
    jest.restoreAllMocks();
    create.mockReset();
    config.get.mockReturnValue('test-key');
  });

  it('combines every selected file in one AI call and persists source names', async () => {
    const summarize = jest
      .spyOn(service, 'summarizeWithAI')
      .mockResolvedValue('combined summary');
    const result = await service.analyzeBatch(
      [file('first.txt', 'FIRST FACT'), file('second.txt', 'SECOND FACT')],
      'user',
      'case',
    );
    expect(summarize).toHaveBeenCalledTimes(1);
    expect(summarize.mock.calls[0][0]).toContain('FIRST FACT');
    expect(summarize.mock.calls[0][0]).toContain('SECOND FACT');
    expect(result.sources).toEqual(['first.txt', 'second.txt']);
    expect(create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'case',
        summary: expect.stringContaining('first.txt, second.txt'),
      }),
    });
  });

  it('gives later files a share of context even when the first file is large', async () => {
    const summarize = jest
      .spyOn(service, 'summarizeWithAI')
      .mockResolvedValue('summary');
    const result = await service.analyzeBatch(
      [file('long.txt', 'x'.repeat(20000)), file('last.txt', 'LAST FACT')],
      'user',
    );
    expect(summarize.mock.calls[0][0]).toContain('LAST FACT');
    expect(result.truncatedFiles).toEqual(['long.txt']);
    expect(create).not.toHaveBeenCalled();
  });

  it('does not silently skip unreadable selected files or call AI', async () => {
    const summarize = jest.spyOn(service, 'summarizeWithAI');
    await expect(
      service.analyzeBatch([file('empty.txt', '   ')], 'user'),
    ).rejects.toThrow('empty.txt');
    expect(summarize).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it('rejects empty/oversized batches and unsupported types', async () => {
    await expect(service.analyzeBatch([], 'user')).rejects.toThrow(
      BadRequestException,
    );
    await expect(
      service.analyzeBatch(
        Array.from({ length: 11 }, () => file('f.txt', 'text')),
        'user',
      ),
    ).rejects.toThrow(BadRequestException);
    await expect(
      service.analyzeBatch(
        [{ ...file('f.docx', 'zip'), mimeType: 'application/zip' }],
        'user',
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('does not produce a chargeable demo result without an AI key', async () => {
    config.get.mockReturnValue(undefined);
    await expect(
      service.analyzeBatch([file('a.txt', 'facts')], 'user'),
    ).rejects.toThrow(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('validates selection IDs and rejects duplicates and excessive selection', async () => {
    for (const ids of [
      [],
      ['not-a-uuid'],
      Array(11).fill('00000000-0000-4000-8000-000000000001'),
      Array(2).fill('00000000-0000-4000-8000-000000000001'),
    ]) {
      expect(
        (
          await validate(
            Object.assign(new BatchAnalysisDto(), { documentIds: ids }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
  });

  it('resolves each selected file inside the authorized case before analysis', async () => {
    const getFilePath = jest.fn().mockRejectedValue(new NotFoundException());
    const analyzeBatch = jest.fn();
    const controller = new IntelligenceController(
      { analyzeBatch } as unknown as DocumentIntelligenceService,
      { getFilePath } as unknown as DocumentsService,
    );
    await expect(
      controller.analyzeExistingBatch({ id: 'user' } as any, 'allowed-case', {
        documentIds: ['foreign-document'],
      }),
    ).rejects.toThrow(NotFoundException);
    expect(getFilePath).toHaveBeenCalledWith(
      'allowed-case',
      'foreign-document',
    );
    expect(analyzeBatch).not.toHaveBeenCalled();
    const reflector = new Reflector();
    expect(
      reflector.get('__guards__', controller.analyzeExistingBatch),
    ).toContain(CaseAccessGuard);
    expect(
      reflector.get(REQUIRE_CREDITS_KEY, controller.analyzeExistingBatch),
    ).toBe(5);
    expect(reflector.get('__guards__', controller.listBatchAnalyses)).toContain(
      CaseAccessGuard,
    );
  });
});

describe('case knowledge visibility', () => {
  it('uses case access guard and queries only the requested case with source documents', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const service = new DocumentIntelligenceService(
      { caseKnowledge: { findMany } } as unknown as PrismaService,
      { get: jest.fn() } as unknown as ConfigService,
    );
    const controller = new IntelligenceController(service, {} as DocumentsService);
    const guards = Reflect.getMetadata('__guards__', controller.findCaseKnowledge);
    expect(guards).toContain(CaseAccessGuard);
    await controller.findCaseKnowledge('requested-case');
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { caseId: 'requested-case' },
      include: expect.objectContaining({
        document: { select: { id: true, filename: true } },
      }),
    }));
  });
});
