import { BadRequestException, HttpException, Injectable, Logger } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { assertCanOpenCases } from '../common/plan-limits';
import { PrismaService } from '../prisma/prisma.module';
import { CasesService } from '../cases/cases.service';
import { buildCaseImportTemplate } from './case-import-template';
import { readCaseImportSheet } from './case-import-reader';
import { existingDuplicate, ImportLookups, resolveCaseRows } from './case-import-resolve';
import { CreateExcelCaseRowDto, CreateExcelCasesDto } from './case-import.dto';

export interface ExcelCaseResult {
  rowNumber: number;
  status: 'CREATED' | 'FAILED';
  caseId?: string;
  ownRef?: string;
  message?: string;
}

export const CASE_IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface UploadedSheet {
  buffer: Buffer;
  size: number;
  originalname: string;
}

const lower = (v: string) => v.trim().toLowerCase();

/** "นำเข้าคดีจาก Excel": template download, read-only preview, then create (see createCases). */
@Injectable()
export class CaseImportService {
  private readonly logger = new Logger(CaseImportService.name);

  constructor(
    private prisma: PrismaService,
    private cases: CasesService,
  ) {}

  /** Same set as GET /users/lawyers — who may lead a case. */
  private lawyers(firmId: string) {
    return this.prisma.user.findMany({
      where: { role: { in: ['ADMIN', 'LAWYER'] }, firmMembers: { some: { firmId, role: { not: FirmRole.EXTERNAL } } } },
      select: { id: true, email: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    });
  }

  private activeCaseTypes(firmId: string) {
    return this.prisma.caseType.findMany({ where: { firmId, isActive: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }

  async template(user: AuthUser): Promise<Buffer> {
    const [caseTypes, lawyers] = await Promise.all([this.activeCaseTypes(user.firmId), this.lawyers(user.firmId)]);
    return buildCaseImportTemplate({
      caseTypes: caseTypes.map((t) => t.name),
      lawyers: lawyers.map((l) => ({ name: `${l.firstName} ${l.lastName}`, email: l.email })),
    });
  }

  /** Every lookup a row may resolve against — strictly the caller's firm. */
  async lookups(firmId: string): Promise<ImportLookups> {
    const [lawyers, members, clients, caseTypes, cases, proceedings] = await Promise.all([
      this.lawyers(firmId),
      this.prisma.firmMember.findMany({
        where: { firmId, role: { not: FirmRole.EXTERNAL } },
        select: { userId: true, user: { select: { email: true } } },
      }),
      this.prisma.client.findMany({ where: { firmId }, select: { id: true, name: true } }),
      this.activeCaseTypes(firmId),
      this.prisma.case.findMany({ where: { firmId }, select: { ownRef: true, blackCaseNumber: true, courtName: true, deletedAt: true } }),
      this.prisma.caseProceeding.findMany({
        where: { case: { firmId, deletedAt: null }, blackCaseNumber: { not: null } },
        select: { blackCaseNumber: true, courtName: true, case: { select: { ownRef: true } } },
      }),
    ]);
    return {
      lawyersByEmail: new Map(lawyers.map((l) => [lower(l.email), l.id])),
      membersByEmail: new Map(members.map((m) => [lower(m.user.email), m.userId])),
      clientsByName: new Map(clients.map((c) => [lower(c.name), c.id])),
      caseTypesByName: new Map(caseTypes.map((t) => [lower(t.name), t.id])),
      // ownRef is unique across every case, deleted or not; numbers only clash with live ones.
      existingOwnRefs: new Set(cases.map((c) => c.ownRef)),
      existingNumbers: [
        ...cases.filter((c) => !c.deletedAt && c.blackCaseNumber).map((c) => ({ number: c.blackCaseNumber!, court: c.courtName, ownRef: c.ownRef })),
        ...proceedings.map((p) => ({ number: p.blackCaseNumber!, court: p.courtName, ownRef: p.case.ownRef })),
      ],
    };
  }

  /** Reads and checks the file. Writes nothing. */
  async preview(user: AuthUser, file: UploadedSheet) {
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('รองรับเฉพาะไฟล์ .xlsx');
    if (file.size > CASE_IMPORT_MAX_BYTES) throw new BadRequestException('ไฟล์ใหญ่เกิน 2 MB');
    const { rows } = await readCaseImportSheet(file.buffer);
    const drafts = resolveCaseRows(rows, await this.lookups(user.firmId), new Date());
    return { drafts, noKeyRows: drafts.filter((d) => !d.ownRef && !d.blackCaseNumber).length };
  }

  /**
   * Creates the reviewed rows. All-or-nothing checks first (team, firm refs, plan quota), then one
   * transaction per row so a failing row never stops — or half-creates — another.
   */
  async createCases(user: AuthUser, dto: CreateExcelCasesDto): Promise<{ results: ExcelCaseResult[] }> {
    const lookups = await this.lookups(user.firmId);
    const lawyerIds = new Set(lookups.lawyersByEmail.values());
    const memberIds = new Set(lookups.membersByEmail.values());
    const clientIds = new Set(lookups.clientsByName.values());
    const caseTypeIds = new Set(lookups.caseTypesByName.values());
    for (const row of dto.rows) {
      if (!lawyerIds.has(row.leadLawyerId)) throw new BadRequestException('ทนายหลักต้องเป็นทนายของสำนักงาน');
      if (row.buddyIds.some((id) => !memberIds.has(id))) throw new BadRequestException('ทีมทุกคนต้องเป็นสมาชิกของสำนักงาน');
      if ((row.clientId && !clientIds.has(row.clientId)) || (row.caseTypeId && !caseTypeIds.has(row.caseTypeId))) {
        throw new BadRequestException('ลูกความหรือประเภทคดีไม่อยู่ในสำนักงานนี้');
      }
    }
    const openRows = dto.rows.filter((r) => !r.closed).length;
    if (openRows > 0) await assertCanOpenCases(this.prisma, user.firmId, openRows);

    const results: ExcelCaseResult[] = [];
    for (const row of dto.rows) {
      results.push(await this.createRow(user, row, lookups));
    }
    const created = results.filter((r) => r.status === 'CREATED').length;
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action: 'CASES_IMPORTED_EXCEL', metadata: { created, failed: results.length - created } },
    });
    return { results };
  }

  private async createRow(user: AuthUser, row: CreateExcelCaseRowDto, lookups: ImportLookups): Promise<ExcelCaseResult> {
    const { rowNumber } = row;
    // The firm may have changed since the preview — and earlier rows of this request count too.
    const duplicate = existingDuplicate(row, lookups);
    if (duplicate) return { rowNumber, status: 'FAILED', message: duplicate };
    const day = (iso?: string) => (iso ? new Date(`${iso.slice(0, 10)}T00:00:00Z`) : undefined);
    try {
      const created = await this.prisma.$transaction((tx) =>
        this.cases.createForImport(tx, user, {
          title: row.title,
          leadLawyerId: row.leadLawyerId,
          buddyIds: row.buddyIds,
          courtLevel: row.courtLevel,
          courtName: row.courtName || null,
          blackCaseNumber: row.blackCaseNumber || null,
          redCaseNumber: row.redCaseNumber || undefined,
          ownRef: row.ownRef || undefined,
          customerRef: row.customerRef || undefined,
          clientId: row.clientId,
          clientName: row.clientName || undefined,
          partyRole: row.partyRole,
          opponents: row.opponents,
          caseTypeId: row.caseTypeId,
          claimedAmount: row.claimedAmount,
          estimatedFee: row.estimatedFee,
          limitationDeadline: day(row.limitationDeadline),
          description: row.description || undefined,
          stage: row.closed ? undefined : row.stage,
          openedAt: day(row.openedAt),
          closed: row.closed ? { outcome: row.outcome!, closingSummary: row.closingSummary!.trim(), closedAt: day(row.closedAt) } : null,
        }),
      );
      if (row.ownRef) lookups.existingOwnRefs.add(row.ownRef);
      if (row.blackCaseNumber) lookups.existingNumbers.push({ number: row.blackCaseNumber, court: row.courtName ?? null, ownRef: created.ownRef });
      return { rowNumber, status: 'CREATED', caseId: created.id, ownRef: created.ownRef };
    } catch (error) {
      if (error instanceof HttpException) return { rowNumber, status: 'FAILED', message: error.message };
      this.logger.warn(`Excel import row ${rowNumber} failed: ${error}`);
      return { rowNumber, status: 'FAILED', message: 'สร้างคดีไม่สำเร็จ' };
    }
  }
}
