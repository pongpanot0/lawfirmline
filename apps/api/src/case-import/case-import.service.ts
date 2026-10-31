import { BadRequestException, Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CasesService } from '../cases/cases.service';
import { buildCaseImportTemplate } from './case-import-template';
import { readCaseImportSheet } from './case-import-reader';
import { ImportLookups, resolveCaseRows } from './case-import-resolve';

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
}
