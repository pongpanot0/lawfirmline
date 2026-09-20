import { Test } from '@nestjs/testing';
import { DocumentCategory } from '@lawfirm/shared';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseFeedService } from '../common/services/case-feed.service';

/**
 * `CaseType.requiredDocuments` เก็บค่า `DocumentCategory` ไม่ใช่ข้อความอิสระ
 * เพื่อให้เทียบกับ `Document.category` ได้ตรง ๆ — ข้อความที่เทียบไม่ได้ต้องไม่
 * โผล่มาเป็น "เอกสารที่ขาด" ตลอดกาลโดยที่ไม่มีทางทำให้ครบ
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

  it('ค่าที่ไม่ใช่หมวดจริง (ข้อความอิสระของเดิม) ถูกทิ้ง ไม่นับเป็นของขาด', async () => {
    prisma.case.findUnique.mockResolvedValue({
      caseType: { requiredDocuments: ['บัตรประชาชนถ่ายสำเนา', DocumentCategory.CONTRACT, 42] },
      documents: [],
    });
    await build();

    const result = await service.getRequiredDocuments('case-1');

    expect(result.required).toEqual([{ category: DocumentCategory.CONTRACT, present: false }]);
    expect(result.missing).toEqual([DocumentCategory.CONTRACT]);
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
