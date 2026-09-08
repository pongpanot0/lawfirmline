import { BadRequestException } from '@nestjs/common';
import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { IntakePrecedentAnalysisService } from './intake-precedent-analysis.service';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';
import { PrismaService } from '../prisma/prisma.module';
import { ConfigService } from '@nestjs/config';
import { IappLegalClient } from '../intelligence/iapp-legal.client';

jest.mock('pdf-parse', () => ({ PDFParse: jest.fn() }));

describe('intake attachment selection', () => {
  let directory: string;
  const originalFetch = global.fetch;
  beforeEach(() => {
    directory = mkdtempSync(join(tmpdir(), 'intake-selection-test-'));
  });
  afterEach(() => {
    rmSync(directory, { recursive: true, force: true });
    global.fetch = originalFetch;
  });

  function setup() {
    const attachments = ['a', 'b'].map((id) => {
      const storagePath = join(directory, `${id}.pdf`);
      writeFileSync(storagePath, `FACT ${id}`);
      return {
        id,
        filename: `${id}.pdf`,
        storagePath,
        mimeType: 'application/pdf',
      };
    });
    const findFirst = jest
      .fn()
      .mockImplementation(async () => ({
        description: 'case facts',
        matterType: null,
        opposingParty: null,
        estimatedDamage: null,
        incidentDate: null,
        attachments: [...attachments],
      }));
    // One file in each store, so selection has to span both: `a` is a legacy
    // attachment the analyser used to be alone in seeing, `b` a document from
    // the repository that follows the case.
    const documentFindMany = jest.fn().mockImplementation(async () => [attachments[1]]);
    const attachmentFindMany = jest.fn().mockImplementation(async () => [attachments[0]]);
    const create = jest.fn().mockImplementation(async ({ data }) => data);
    const extractText = jest
      .fn()
      .mockImplementation(async (buffer: Buffer) => buffer.toString());
    global.fetch = jest
      .fn()
      .mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  summaryBullets: 'summary',
                  noticeFacts: 'facts',
                }),
              },
            },
          ],
        }),
      });
    const service = new IntakePrecedentAnalysisService(
      {
        intake: { findFirst },
        intakePrecedentAnalysis: { create },
        document: { findMany: documentFindMany },
        intakeAttachment: { findMany: attachmentFindMany },
      } as unknown as PrismaService,
      { get: () => 'test-key' } as unknown as ConfigService,
      { searchPrecedents: async () => [] } as unknown as IappLegalClient,
      { extractText } as unknown as DocumentIntelligenceService,
    );
    return { service, extractText, create, findFirst };
  }

  it('reads only selected files and persists exactly those source IDs', async () => {
    const { service, extractText, create, findFirst } = setup();
    await service.analyze({ id: 'user', firmId: 'firm' } as any, 'intake', [
      'b',
    ]);
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'intake', firmId: 'firm' } }),
    );
    expect(extractText).toHaveBeenCalledTimes(1);
    expect(extractText.mock.calls[0][0].toString()).toBe('FACT b');
    expect(
      create.mock.calls[0][0].data.extractedFacts.selectedAttachments,
    ).toEqual([{ id: 'b', filename: 'b.pdf' }]);
    expect(
      create.mock.calls[0][0].data.extractedFacts.attachmentText,
    ).not.toContain('FACT a');
  });

  it('rejects foreign attachment IDs before reading files or calling AI', async () => {
    const { service, extractText } = setup();
    await expect(
      service.analyze({ id: 'user', firmId: 'firm' } as any, 'intake', [
        'foreign',
      ]),
    ).rejects.toThrow(BadRequestException);
    expect(extractText).not.toHaveBeenCalled();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('honors an explicit empty selection instead of including all attachments', async () => {
    const { service, extractText, create } = setup();
    await service.analyze({ id: 'user', firmId: 'firm' } as any, 'intake', []);
    expect(extractText).not.toHaveBeenCalled();
    expect(
      create.mock.calls[0][0].data.extractedFacts.selectedAttachments,
    ).toEqual([]);
  });
});
