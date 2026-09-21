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
  let prisma: { case: { findUnique: jest.Mock } };

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
    prisma = { case: { findUnique: jest.fn() } };
  });

  it('บอกว่าหมวดที่ประเภทคดีต้องมี มีอะไรแล้วและขาดอะไร', async () => {
    prisma.case.findUnique.mockResolvedValue({
      caseType: { requiredDocuments: [DocumentCategory.PLEADING, DocumentCategory.EVIDENCE] },
      documents: [{ category: DocumentCategory.PLEADING }, { category: DocumentCategory.OTHER }],
    });
    await build();

    const result = await service.getRequiredDocuments('case-1');

    expect(result.required).toEqual([
      { category: DocumentCategory.PLEADING, present: true },
      { category: DocumentCategory.EVIDENCE, present: false },
    ]);
    expect(result.missing).toEqual([DocumentCategory.EVIDENCE]);
  });

  it('ข้อความอิสระนับเป็นรายการที่ต้องมีด้วย แต่ไม่มีวันขึ้น present อัตโนมัติ', async () => {
    prisma.case.findUnique.mockResolvedValue({
      caseType: { requiredDocuments: ['บัตรประชาชนถ่ายสำเนา', DocumentCategory.CONTRACT, '', 42] },
      documents: [],
    });
    await build();

    const result = await service.getRequiredDocuments('case-1');

    expect(result.required).toEqual([
      { category: 'บัตรประชาชนถ่ายสำเนา', present: false },
      { category: DocumentCategory.CONTRACT, present: false },
    ]);
    expect(result.missing).toEqual(['บัตรประชาชนถ่ายสำเนา', DocumentCategory.CONTRACT]);
  });

  it('ประเภทคดีที่ไม่ได้กำหนดเอกสารไว้ ไม่มีของขาด', async () => {
    prisma.case.findUnique.mockResolvedValue({ caseType: null, documents: [] });
    await build();

    await expect(service.getRequiredDocuments('case-1')).resolves.toEqual({
      required: [],
      missing: [],
    });
  });
});
