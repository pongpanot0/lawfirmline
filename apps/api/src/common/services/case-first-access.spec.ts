import { NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { CaseAccessService } from './case-access.service';
import { IntakeService } from '../../intake/intake.service';
import { EmailIntakeService } from '../../email-intake/email-intake.service';
import { DocumentsService } from '../../documents/documents.service';
import { IntakePrecedentAnalysisService } from '../../intake/intake-precedent-analysis.service';
import { ConflictCheckService } from '../../conflict-check/conflict-check.service';

// Evaluate the Prisma predicates against a fixture, so endpoint tests use the real access filter.
function matches(row: any, where: any): boolean {
  return Object.entries(where).every(([key, value]: [string, any]) => {
    if (value === undefined) return true;
    if (key === 'OR') return value.some((part: any) => matches(row, part));
    if (key === 'AND') return (Array.isArray(value) ? value : [value]).every((part: any) => matches(row, part));
    const field = row?.[key];
    if (value === null || typeof value !== 'object') return field === value;
    if ('is' in value) return value.is === null ? field == null : matches(field, value.is);
    if ('has' in value) return field?.includes(value.has) ?? false;
    if ('hasSome' in value) return value.hasSome.some((item: any) => field?.includes(item));
    if ('in' in value) return value.in.includes(field);
    if ('some' in value) return field?.some((item: any) => matches(item, value.some)) ?? false;
    return field != null && matches(field, value);
  });
}

describe('Case-first intake access after an assistant is removed from the case', () => {
  const user = { id: 'assistant', firmId: 'firm-1', firmRole: FirmRole.ASSISTANT } as AuthUser;
  let intake: any;
  let prisma: any;
  let access: CaseAccessService;
  let service: IntakeService;
  let email: EmailIntakeService;
  let documents: DocumentsService;
  let research: IntakePrecedentAnalysisService;
  let conflict: ConflictCheckService;

  beforeEach(() => {
    intake = { id: 'intake-1', firmId: 'firm-1', receivedById: 'other', assignedUserIds: ['assistant'],
      case: { id: 'case-1', firmId: 'firm-1', deletedAt: null, leadLawyerId: 'lawyer', assignments: [], tasks: [] } };
    prisma = { intake: { findFirst: jest.fn(async ({ where }) => matches(intake, where) ? intake : null) },
      intakeDocumentRequest: { findMany: jest.fn(), createMany: jest.fn(), update: jest.fn(), deleteMany: jest.fn() },
      intakeFieldProposal: { findFirst: jest.fn() },
      intakePrecedentAnalysis: { findFirst: jest.fn(async ({ where }) => matches({ id: 'analysis', intakeId: intake.id, intake }, where) ? { id: 'analysis' } : null) },
      document: { findMany: jest.fn(), update: jest.fn() }, $transaction: jest.fn() };
    access = new CaseAccessService(prisma);
    service = new IntakeService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, access, {} as any, {} as any, {} as any, {} as any);
    email = new EmailIntakeService(service, prisma, access, {} as any, {} as any, {} as any, {} as any);
    documents = new DocumentsService(prisma, {} as any, {} as any, access, {} as any);
    research = new IntakePrecedentAnalysisService(prisma, {} as any, {} as any, {} as any, {} as any, {} as any, access);
    conflict = new ConflictCheckService(prisma, access);
  });

  it('retains the legacy assignment rule until a case exists', async () => {
    intake.case = null;
    await expect(service.findOne(user, intake.id)).resolves.toBe(intake);
    intake.case = { id: 'case-1', firmId: 'firm-1', deletedAt: null, assignments: [{ userId: user.id }], tasks: [] };
    await expect(service.findOne(user, intake.id)).resolves.toBe(intake);
    intake.case.assignments = [];
    await expect(service.findOne(user, intake.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it.each([
    'intake', 'requests', 'add request', 'update request', 'delete request', 'proposal title', 'proposal amount', 'proposal document', 'proposal request',
    'documents', 'download', 'upload attachment', 'delete attachment', 'research', 'analyses', 'analysis', 'summary', 'conflict list', 'conflict record',
  ])('returns 404 for %s despite a stale intake assignment', async (operation) => {
    const operations: Record<string, () => Promise<unknown>> = {
      intake: () => service.findOne(user, intake.id),
      requests: () => service.missingDocuments(user, intake.id),
      'add request': () => service.addDocumentRequests(user, intake.id, { name: 'file' }),
      'update request': () => service.updateDocumentRequest(user, intake.id, 'req', {}),
      'delete request': () => service.removeDocumentRequest(user, intake.id, 'req'),
      ...Object.fromEntries(['title', 'amount', 'document', 'request'].map((field) => [`proposal ${field}`, () => email.resolveFieldProposal(user, intake.id, field, { action: 'confirm' })])),
      documents: () => documents.findByIntake(user, intake.id),
      download: () => documents.getFilePathForIntake(user, intake.id, 'doc'),
      'upload attachment': () => service.uploadAttachment(user, intake.id, {} as any),
      'delete attachment': () => service.deleteAttachment(user, intake.id, 'att'),
      research: () => research.analyze(user, intake.id),
      analyses: () => research.listForIntake(user, intake.id),
      analysis: () => research.getOne(user, intake.id, 'analysis'),
      summary: () => research.summarizeDocuments(user, intake.id, undefined, ['doc']),
      'conflict list': () => conflict.list(user, intake.id),
      'conflict record': () => conflict.record(user, { intakeId: intake.id, terms: ['name'], result: 'CLEAR' } as any),
    };
    await expect(operations[operation]()).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.intakeDocumentRequest.createMany).not.toHaveBeenCalled();
    expect(prisma.intakeDocumentRequest.update).not.toHaveBeenCalled();
    expect(prisma.intakeDocumentRequest.deleteMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
