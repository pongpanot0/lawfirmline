import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';

const legalCase = {
  id: 'case-1',
  ownRef: 'REF-1',
  customerRef: 'CUST-1',
  clientName: 'ลูกความ',
  courtName: '',
  folderId: 'folder-1',
  title: 'คดีทดสอบ',
  blackCaseNumber: 'ดำ 1/2569',
  redCaseNumber: null,
  caseType: { name: 'แพ่ง' },
  leadLawyer: { firstName: 'สมชาย', lastName: 'ใจดี' },
  participants: [
    { name: 'นายหนึ่ง', role: 'PLAINTIFF' },
    { name: 'นายสอง', role: 'JOINT_PLAINTIFF' },
    { name: 'นายสาม', role: 'DEFENDANT' },
    { name: 'พยาน', role: 'WITNESS' },
  ],
};

describe('TemplatesService', () => {
  let service: TemplatesService;
  const mockPrisma = {
    documentTemplate: { findFirst: jest.fn() },
    case: { findUnique: jest.fn() },
  };
  const mockDocumentsService = { createFromBuffer: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TemplatesService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: DocumentsService, useValue: mockDocumentsService },
      ],
    }).compile();
    service = module.get(TemplatesService);
  });

  describe('render', () => {
    it('fills plaintiffNames and defendantNames from CaseParticipant roles', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        id: 'tpl-1',
        name: 'หนังสือ',
        templateBody: '{{plaintiffNames}} vs {{defendantNames}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.content).toBe('นายหนึ่ง, นายสอง vs นายสาม');
      expect(result?.variables.plaintiffNames).toBe('นายหนึ่ง, นายสอง');
      expect(result?.variables.defendantNames).toBe('นายสาม');
    });

    it('lists courtName as missing when empty, and an unknown key as missing', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        id: 'tpl-1',
        name: 'หนังสือ',
        templateBody: 'ศาล {{courtName}} — {{foo}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.missingFields).toEqual(expect.arrayContaining(['courtName', 'foo']));
    });

    it('does not flag a filled field as missing', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        id: 'tpl-1',
        name: 'หนังสือ',
        templateBody: '{{clientName}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.missingFields).toEqual([]);
    });
  });

  describe('generate', () => {
    it('renders the template, builds a .docx, and saves it via createFromBuffer', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        id: 'tpl-1',
        name: 'หนังสือมอบอำนาจ',
        templateBody: 'เรียน {{courtName}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockDocumentsService.createFromBuffer.mockResolvedValue({ id: 'doc-1' });

      const user = { id: 'user-1', firmId: 'firm-1' } as any;
      const result = await service.generate(user, 'case-1', 'tpl-1');

      expect(mockDocumentsService.createFromBuffer).toHaveBeenCalledWith(
        user,
        'case-1',
        expect.objectContaining({
          filename: 'หนังสือมอบอำนาจ-REF-1.docx',
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        }),
      );
      expect(result).toEqual({ documentId: 'doc-1', filename: 'หนังสือมอบอำนาจ-REF-1.docx' });
    });
  });
});
