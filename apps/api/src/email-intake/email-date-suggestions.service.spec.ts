import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmailDateSuggestionsService } from './email-date-suggestions.service';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { DocumentIntelligenceService } from '../intelligence/document-intelligence.service';

describe('EmailDateSuggestionsService', () => {
  let service: EmailDateSuggestionsService;
  const user = { id: 'u1', firmId: 'f1' } as never;
  const filter = { firmId: 'f1' };

  const mockPrisma = {
    emailMessage: { findFirst: jest.fn() },
    documentDateSuggestion: { findMany: jest.fn(), create: jest.fn() },
    $transaction: jest.fn(),
    calendarEvent: { create: jest.fn() },
  };
  const mockCaseAccess = { getEmailThreadFilterForUser: jest.fn() };
  const mockIntelligence = { extractDatesWithAI: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockCaseAccess.getEmailThreadFilterForUser.mockResolvedValue(filter);
    mockPrisma.emailMessage.findFirst.mockResolvedValue({
      id: 'm1',
      bodyText: 'ศาลนัดสืบพยาน 15 มีนาคม 2569\n\nOn Mon wrote:\nold date 1 มกราคม 2569',
      thread: { subject: 'คดีแพ่ง' },
    });
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([]);
    mockPrisma.documentDateSuggestion.create.mockImplementation(({ data }) => ({ id: `s-${data.label}`, ...data }));
    mockPrisma.$transaction.mockImplementation((ops: Promise<unknown>[]) => Promise.all(ops));
    mockIntelligence.extractDatesWithAI.mockResolvedValue([
      { label: 'นัดสืบพยาน', date: '2026-03-15T00:00:00.000Z', eventType: 'COURT_DATE', sourceExcerpt: 'ศาลนัดสืบพยาน 15 มีนาคม 2569' },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailDateSuggestionsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CaseAccessService, useValue: mockCaseAccess },
        { provide: DocumentIntelligenceService, useValue: mockIntelligence },
      ],
    }).compile();
    service = module.get(EmailDateSuggestionsService);
  });

  it('enforces case and thread access in the message lookup', async () => {
    await service.suggestFromMessage(user, 'c1', 'm1');
    expect(mockPrisma.emailMessage.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'm1', thread: { AND: [filter, { caseId: 'c1' }] } },
      }),
    );
  });

  it('throws NotFound and never calls AI when the message is not in this case', async () => {
    mockPrisma.emailMessage.findFirst.mockResolvedValue(null);
    await expect(service.suggestFromMessage(user, 'c1', 'm1')).rejects.toBeInstanceOf(NotFoundException);
    expect(mockIntelligence.extractDatesWithAI).not.toHaveBeenCalled();
  });

  it('rejects an empty email before any AI call', async () => {
    mockPrisma.emailMessage.findFirst.mockResolvedValue({ id: 'm1', bodyText: '  ', thread: { subject: 's' } });
    await expect(service.suggestFromMessage(user, 'c1', 'm1')).rejects.toBeInstanceOf(BadRequestException);
    expect(mockIntelligence.extractDatesWithAI).not.toHaveBeenCalled();
  });

  it('sends subject and only the new text (quoted history stripped) to the shared extractor', async () => {
    await service.suggestFromMessage(user, 'c1', 'm1');
    const sent = mockIntelligence.extractDatesWithAI.mock.calls[0][0] as string;
    expect(sent).toContain('คดีแพ่ง');
    expect(sent).toContain('ศาลนัดสืบพยาน 15 มีนาคม 2569');
    expect(sent).not.toContain('old date');
  });

  it('creates PENDING EMAIL suggestions linked to the message, with no calendar event', async () => {
    const result = await service.suggestFromMessage(user, 'c1', 'm1');
    expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        caseId: 'c1',
        label: 'นัดสืบพยาน',
        source: 'EMAIL',
        emailMessageId: 'm1',
        sourceExcerpt: 'ศาลนัดสืบพยาน 15 มีนาคม 2569',
        createdById: 'u1',
      }),
    });
    expect(result.created).toBe(1);
    expect(result.suggestions).toHaveLength(1);
    expect(mockPrisma.calendarEvent.create).not.toHaveBeenCalled();
  });

  it('skips a date+label already pending for the case, and duplicates within one reply', async () => {
    mockPrisma.documentDateSuggestion.findMany.mockResolvedValue([
      { label: 'นัดสืบพยาน ', suggestedDate: new Date('2026-03-15T00:00:00.000Z') },
    ]);
    mockIntelligence.extractDatesWithAI.mockResolvedValue([
      { label: 'นัดสืบพยาน', date: '2026-03-15T00:00:00.000Z', eventType: 'COURT_DATE', sourceExcerpt: 'a' },
      { label: 'ยื่นคำให้การ', date: '2026-04-01T00:00:00.000Z', eventType: 'DEADLINE', sourceExcerpt: 'b' },
      { label: 'ยื่นคำให้การ', date: '2026-04-01T00:00:00.000Z', eventType: 'DEADLINE', sourceExcerpt: 'b' },
    ]);
    const result = await service.suggestFromMessage(user, 'c1', 'm1');
    expect(mockPrisma.documentDateSuggestion.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ created: 1, suggestions: [expect.objectContaining({ label: 'ยื่นคำให้การ' })] });
  });

  it('returns zero created when the AI finds no dates', async () => {
    mockIntelligence.extractDatesWithAI.mockResolvedValue([]);
    expect(await service.suggestFromMessage(user, 'c1', 'm1')).toEqual({ created: 0, suggestions: [] });
  });
});
