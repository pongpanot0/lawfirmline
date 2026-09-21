import { Test } from '@nestjs/testing';
import { DocumentCategory } from '@lawfirm/shared';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';

/**
 * `CaseType.requiredDocuments` เก็บได้ทั้งค่า `DocumentCategory` (เทียบกับ
 * `Document.category` ได้ตรง ๆ) และข้อความอิสระที่สำนักงานพิมพ์เอง — ข้อความ
 * อิสระเทียบอัตโนมัติไม่ได้ จึงติด missing ตลอดจนกว่าจะถูกลบออกจากรายการเอง
 */
describe('DocumentsService.getRequiredDocuments', () => {
  let service: DocumentsService;
  let prisma: { case: { findUnique: jest.Mock; update: jest.Mock } };

  const build = async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FileStorageService, useValue: {} },
        { provide: CaseAccessService, useValue: { getCaseFilterForUser: () => ({}) } },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(DocumentsService);
  };

  beforeEach(() => {
    prisma = { case: { findUnique: jest.fn(), update: jest.fn() } };
  });

  it('บอกว่าหมวดที่ประเภทคดีต้องมี มีอะไรแล้วและขาดอะไร', async () => {
    prisma.case.findUnique.mockResolvedValue({
      caseType: { requiredDocuments: [DocumentCategory.PLEADING, DocumentCategory.EVIDENCE] },
      documents: [{ category: DocumentCategory.PLEADING }, { category: DocumentCategory.OTHER }],
      confirmedDocuments: [],
    });
    await build();

    const result = await service.getRequiredDocuments('case-1');

    expect(result.required).toEqual([
      { category: DocumentCategory.PLEADING, present: true },
      { category: DocumentCategory.EVIDENCE, present: false },
    ]);
    expect(result.missing).toEqual([DocumentCategory.EVIDENCE]);
  });

  it('ข้อความอิสระนับเป็นรายการที่ต้องมีด้วย แต่ไม่มีวันขึ้น present อัตโนมัติ เว้นแต่ถูกติ๊กด้วยมือ', async () => {
    prisma.case.findUnique.mockResolvedValue({
      caseType: { requiredDocuments: ['บัตรประชาชนถ่ายสำเนา', DocumentCategory.CONTRACT, '', 42] },
      documents: [],
      confirmedDocuments: ['บัตรประชาชนถ่ายสำเนา'],
    });
    await build();

    const result = await service.getRequiredDocuments('case-1');

    expect(result.required).toEqual([
      { category: 'บัตรประชาชนถ่ายสำเนา', present: true },
      { category: DocumentCategory.CONTRACT, present: false },
    ]);
    expect(result.missing).toEqual([DocumentCategory.CONTRACT]);
  });

  it('ประเภทคดีที่ไม่ได้กำหนดเอกสารไว้ ไม่มีของขาด', async () => {
    prisma.case.findUnique.mockResolvedValue({ caseType: null, documents: [], confirmedDocuments: [] });
    await build();

    await expect(service.getRequiredDocuments('case-1')).resolves.toEqual({
      required: [],
      missing: [],
    });
  });
});

describe('DocumentsService.setDocumentConfirmed', () => {
  let service: DocumentsService;
  let prisma: { case: { findUnique: jest.Mock; update: jest.Mock } };

  const build = async () => {
    const module = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: FileStorageService, useValue: {} },
        { provide: CaseAccessService, useValue: { getCaseFilterForUser: () => ({}) } },
        { provide: CaseFeedService, useValue: { log: jest.fn() } },
      ],
    }).compile();
    service = module.get(DocumentsService);
  };

  beforeEach(() => {
    prisma = { case: { findUnique: jest.fn(), update: jest.fn() } };
  });

  it('ติ๊กเอกสารที่ต้องมีด้วยมือ เพิ่มเข้า confirmedDocuments โดยไม่ซ้ำ', async () => {
    prisma.case.findUnique
      .mockResolvedValueOnce({ confirmedDocuments: ['เอกสาร A'] })
      .mockResolvedValueOnce({ caseType: { requiredDocuments: ['เอกสาร A', 'เอกสาร B'] }, documents: [], confirmedDocuments: ['เอกสาร A', 'เอกสาร B'] });
    await build();

    await service.setDocumentConfirmed('case-1', 'เอกสาร B', true);

    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { confirmedDocuments: ['เอกสาร A', 'เอกสาร B'] },
    });
  });

  it('ยกเลิกติ๊ก เอาออกจาก confirmedDocuments', async () => {
    prisma.case.findUnique
      .mockResolvedValueOnce({ confirmedDocuments: ['เอกสาร A', 'เอกสาร B'] })
      .mockResolvedValueOnce({ caseType: { requiredDocuments: ['เอกสาร A', 'เอกสาร B'] }, documents: [], confirmedDocuments: ['เอกสาร A'] });
    await build();

    await service.setDocumentConfirmed('case-1', 'เอกสาร B', false);

    expect(prisma.case.update).toHaveBeenCalledWith({
      where: { id: 'case-1' },
      data: { confirmedDocuments: ['เอกสาร A'] },
    });
  });
});
