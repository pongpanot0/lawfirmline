import { Test, TestingModule } from '@nestjs/testing';
import { TemplatesService } from './templates.service';
import { PrismaService } from '../prisma/prisma.module';
import { DocumentsService } from '../documents/documents.service';
import * as JSZip from 'jszip';

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
  proceedings: [
    { courtLevel: 'TRIAL', courtName: 'ศาลแพ่ง', blackCaseNumber: 'พ.1/2569', redCaseNumber: 'พ.9/2570' },
    { courtLevel: 'APPEAL', courtName: 'ศาลอุทธรณ์', blackCaseNumber: 'อ.5/2570', redCaseNumber: null },
  ],
};

describe('TemplatesService', () => {
  let service: TemplatesService;
  const mockPrisma = {
    documentTemplate: { findFirst: jest.fn() },
    case: { findUnique: jest.fn(), findFirst: jest.fn() },
    calendarEvent: { findFirst: jest.fn() },
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

  describe('caseVariables', () => {
    it('adds the next future court date (Bangkok time) and its court to the case variables', async () => {
      mockPrisma.case.findFirst.mockResolvedValue({ ...legalCase, courtName: 'ศาลแพ่ง' });
      mockPrisma.calendarEvent.findFirst.mockResolvedValue({ startAt: new Date('2026-12-01T02:30:00Z'), courtName: null });
      const vars = await service.caseVariables('firm-1', 'case-1');
      expect(mockPrisma.calendarEvent.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ caseId: 'case-1', type: 'COURT_DATE', startAt: { gte: expect.any(Date) } }) }),
      );
      expect(vars.nextHearingTime).toBe('09:30');
      expect(vars.nextHearingDate).toContain('2569');
      expect(vars.nextHearingCourt).toBe('ศาลแพ่ง');
      expect(vars.ownRef).toBe(legalCase.ownRef);
    });
    it('leaves them empty when no hearing is scheduled', async () => {
      mockPrisma.case.findFirst.mockResolvedValue(legalCase);
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);
      const vars = await service.caseVariables('firm-1', 'case-1');
      expect([vars.nextHearingDate, vars.nextHearingTime, vars.nextHearingCourt]).toEqual(['', '', '']);
    });
    it("fills lawyerLicenseNo from the lead lawyer's licence, empty when unset", async () => {
      mockPrisma.calendarEvent.findFirst.mockResolvedValue(null);
      mockPrisma.case.findFirst.mockResolvedValue({
        ...legalCase,
        leadLawyer: { ...legalCase.leadLawyer, lawyerLicenseNo: '12345/2560' },
      });
      expect((await service.caseVariables('firm-1', 'case-1')).lawyerLicenseNo).toBe('12345/2560');
      mockPrisma.case.findFirst.mockResolvedValue(legalCase);
      expect((await service.caseVariables('firm-1', 'case-1')).lawyerLicenseNo).toBe('');
    });
  });

  describe('render', () => {
    it('uses the linked client name when the case has no copied client name', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({ name: 'หนังสือ', templateBody: '{{clientName}}' });
      mockPrisma.case.findUnique.mockResolvedValue({ ...legalCase, clientName: null, client: { name: 'บริษัทลูกความที่ผูกไว้' } });
      const rendered = await service.render('firm', 'tpl', 'case');
      expect(rendered?.content).toBe('บริษัทลูกความที่ผูกไว้');
      expect(rendered?.missingFields).toEqual([]);
    });
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

    it('counts petitioners and respondents as plaintiffs and defendants', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({ name: 'คำร้อง', templateBody: '{{plaintiffNames}} / {{defendantNames}}' });
      mockPrisma.case.findUnique.mockResolvedValue({
        ...legalCase,
        participants: [
          { name: 'ผู้ร้อง', role: 'PETITIONER' },
          { name: 'ผู้คัดค้าน', role: 'RESPONDENT' },
        ],
      });

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.content).toBe('ผู้ร้อง / ผู้คัดค้าน');
    });

    it('fills per-level case numbers from the proceedings', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({
        name: 'อุทธรณ์',
        templateBody: '{{trialBlackCaseNumber}} {{trialRedCaseNumber}} {{appealBlackCaseNumber}} {{trialCourtName}}',
      });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);

      const result = await service.render('firm-1', 'tpl-1', 'case-1');

      expect(result?.content).toBe('พ.1/2569 พ.9/2570 อ.5/2570 ศาลแพ่ง');
      expect(mockPrisma.case.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({ include: expect.objectContaining({ proceedings: true }) }),
      );
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
    it('rejects unresolved placeholders and saves exactly the reviewed content', async () => {
      mockPrisma.documentTemplate.findFirst.mockResolvedValue({ name: 'หนังสือ', templateBody: '{{clientName}}' });
      mockPrisma.case.findUnique.mockResolvedValue(legalCase);
      mockDocumentsService.createFromBuffer.mockResolvedValue({ id: 'draft' });
      const user = { id: 'user', firmId: 'firm' } as any;
      await expect(service.generate(user, 'case-1', 'tpl-1', 'เรียน {{courtName}}')).rejects.toThrow('เติมช่อง');
      await expect(service.generate(user, 'case-1', 'tpl-1', 'เรียน {{ชื่อศาล}}')).rejects.toThrow('เติมช่อง');
      expect(mockDocumentsService.createFromBuffer).not.toHaveBeenCalled();
      await expect(service.generate(user, 'case-1', 'tpl-1', 'ฉบับที่ผู้ใช้ตรวจแล้ว')).resolves.toMatchObject({ documentId: 'draft' });
      const zip = await JSZip.loadAsync(mockDocumentsService.createFromBuffer.mock.calls[0][2].buffer);
      expect(await zip.file('word/document.xml')!.async('string')).toContain('ฉบับที่ผู้ใช้ตรวจแล้ว');
    });
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
