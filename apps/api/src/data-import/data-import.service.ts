import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CasesService } from '../cases/cases.service';
import { CalendarService } from '../calendar/calendar.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { OutlookCalendarSyncService } from '../outlook-integration/calendar/outlook-calendar-sync.service';
import { InvitationService } from '../saas/invitation.service';
import { TenantService } from '../saas/tenant.service';
import { assertFirmRefs } from '../common/firm-refs';
import { readImportSheet } from '../common/excel-import/reader';
import { buildImportTemplate } from '../common/excel-import/template';
import type { RawImportRow } from '../common/excel-import/types';
import type { ImportDraft, RegisteredImportKind } from './import-kind';
import { createImportRegistry } from './import-registry';

export const DATA_IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const DATA_IMPORT_MAX_ROWS = 300;
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const changedMessage = 'ข้อมูลเปลี่ยนไปหรือมีแถวที่ต้องแก้ — ตรวจตัวอย่างใหม่';

/** JSON stores dates as ISO strings; keep their original cell types for the commit re-check. */
function dateCells(rows: RawImportRow[]) {
  return rows.flatMap(row => Object.entries(row.values)
    .filter(([, value]) => value instanceof Date).map(([header]) => ({ rowNumber: row.rowNumber, header })));
}

function restoreRows(value: Prisma.JsonValue, ledger: Prisma.JsonValue): RawImportRow[] {
  const rows = JSON.parse(JSON.stringify(value)) as RawImportRow[];
  const dates = (ledger as { dateCells?: { rowNumber: number; header: string }[] } | null)?.dateCells ?? [];
  const byNumber = new Map(rows.map(row => [row.rowNumber, row]));
  for (const { rowNumber, header } of dates) {
    const row = byNumber.get(rowNumber);
    if (row) row.values[header] = new Date(String(row.values[header]));
  }
  return rows;
}

@Injectable()
export class DataImportService {
  private readonly logger = new Logger(DataImportService.name);
  private readonly registry: Map<string, RegisteredImportKind>;

  constructor(
    private readonly prisma: PrismaService,
    cases: CasesService,
    caseAccess: CaseAccessService,
    calendar: CalendarService,
    outlookCalendar: OutlookCalendarSyncService,
    invitations: InvitationService,
    tenant: TenantService,
  ) {
    this.registry = new Map(createImportRegistry({ cases, caseAccess, calendar, outlookCalendar, invitations, tenant })
      .map(def => [def.kind, def]));
  }

  private member(user: AuthUser) {
    if (user.firmRole === FirmRole.EXTERNAL) throw new ForbiddenException('สมาชิกภายนอกนำเข้าข้อมูลไม่ได้');
  }

  private definition(kind: string): RegisteredImportKind {
    const def = this.registry.get(kind);
    if (!def) throw new NotFoundException('ไม่พบประเภทข้อมูลนำเข้า');
    return def;
  }

  private allowed(user: AuthUser, def: RegisteredImportKind) {
    this.member(user);
    if (!def.canImport(user)) throw new ForbiddenException('คุณไม่มีสิทธิ์นำเข้าข้อมูลประเภทนี้');
  }

  kinds(user: AuthUser) {
    this.member(user);
    return { kinds: [...this.registry.values()].map(def => ({ kind: def.kind, label: def.label, allowed: def.canImport(user) })) };
  }

  /** The firm's last committed imports. All-or-nothing, so every row of a batch was created. */
  async history(user: AuthUser) {
    this.member(user);
    const batches = await this.prisma.dataImportBatch.findMany({
      where: { firmId: user.firmId, status: 'COMMITTED', kind: { not: 'SETUP' } },
      select: { id: true, kind: true, ledger: true, committedAt: true, createdById: true },
      orderBy: { committedAt: 'desc' },
      take: 20,
    });
    const users = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(batches.map(batch => batch.createdById))] } },
      select: { id: true, firstName: true, lastName: true },
    });
    const byId = new Map(users.map(u => [u.id, { firstName: u.firstName, lastName: u.lastName }]));
    return { batches: batches.map(batch => {
      const created = (batch.ledger as { created?: number } | null)?.created ?? 0;
      return {
        id: batch.id, kind: batch.kind, total: created, created, committedAt: batch.committedAt,
        createdBy: byId.get(batch.createdById) ?? { firstName: '', lastName: '' },
      };
    }) };
  }

  async template(user: AuthUser, kind: string) {
    this.member(user);
    const def = this.definition(kind);
    this.allowed(user, def);
    const lookups = await def.lookups(this.prisma, user);
    return buildImportTemplate({
      sheet: def.sheet, headers: def.headers, required: def.required,
      maxRows: DATA_IMPORT_MAX_ROWS, help: def.help, ...def.template(lookups, user),
    });
  }

  async preview(user: AuthUser, kind: string, file?: { originalname: string; buffer: Buffer; size: number }) {
    this.member(user);
    const def = this.definition(kind);
    this.allowed(user, def);
    if (!file) throw new BadRequestException('ยังไม่ได้เลือกไฟล์');
    if (!file.originalname.toLowerCase().endsWith('.xlsx')) throw new BadRequestException('รองรับเฉพาะไฟล์ .xlsx');
    if (Math.max(file.size, file.buffer.length) > DATA_IMPORT_MAX_BYTES) throw new BadRequestException('ไฟล์ใหญ่เกิน 2 MB');
    const { rows } = await readImportSheet(file.buffer, {
      sheet: def.sheet, headers: def.headers, required: def.required, maxRows: DATA_IMPORT_MAX_ROWS,
    });
    const drafts: ImportDraft[] = def.resolve(rows, await def.lookups(this.prisma, user), user);
    const batch = await this.prisma.dataImportBatch.create({ data: {
      kind: def.kind, firmId: user.firmId, createdById: user.id, status: 'PREVIEW',
      rows: json(rows), ledger: json({ dateCells: dateCells(rows) }),
    } });
    const problemRows = drafts.filter(draft => draft.problems.length > 0).length;
    return {
      batchId: batch.id, kind: def.kind,
      columns: def.headers.map(header => ({ key: header, label: header })),
      rows: drafts.map(({ rowNumber, problems, cells }) => ({
        rowNumber, problems, cells: Object.fromEntries(def.headers.map(header => [header, cells[header] ?? ''])),
      })),
      total: drafts.length, problemRows, canCommit: drafts.length > 0 && problemRows === 0,
    };
  }

  async commit(user: AuthUser, id: string) {
    this.member(user);
    const committed = await this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Firm" WHERE "id" = ${user.firmId} FOR UPDATE`;
      const batch = await tx.dataImportBatch.findFirst({ where: {
        id, firmId: user.firmId, createdById: user.id, kind: { not: 'SETUP' },
      } });
      if (!batch) throw new NotFoundException('ไม่พบชุดข้อมูลนำเข้านี้');
      const def = this.definition(batch.kind);
      if (batch.status === 'COMMITTED') {
        return { response: { batchId: id, kind: def.kind, created: (batch.ledger as { created: number }).created } };
      }
      if (batch.status !== 'PREVIEW') throw new ConflictException('ชุดข้อมูลนี้ไม่ใช่ตัวอย่างที่รอนำเข้า');
      this.allowed(user, def);
      const drafts: ImportDraft[] = def.resolve(restoreRows(batch.rows, batch.ledger), await def.lookups(tx, user), user);
      const problems = drafts.filter(draft => draft.problems.length).map(({ rowNumber, problems }) => ({ rowNumber, problems }));
      if (!drafts.length || problems.length) throw new ConflictException({ message: changedMessage, rows: problems });
      await assertFirmRefs(tx, user.firmId, {
        userIds: drafts.flatMap(draft => draft.refs.userIds ?? []),
        clientIds: drafts.flatMap(draft => draft.refs.clientIds ?? []),
        caseTypeIds: drafts.flatMap(draft => draft.refs.caseTypeIds ?? []),
      });
      const { created, after } = await def.commit(tx, user, drafts);
      await tx.dataImportBatch.update({ where: { id }, data: {
        status: 'COMMITTED', committedAt: new Date(), ledger: { created },
      } });
      await tx.auditLog.create({ data: {
        firmId: user.firmId, userId: user.id, action: `DATA_IMPORTED_${def.kind.toUpperCase().replace(/-/g, '_')}`,
        metadata: { batchId: id, kind: def.kind, created },
      } });
      return { response: { batchId: id, kind: def.kind, created }, after };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }).catch((error: unknown) => {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ['P2034', 'P2002'].includes(error.code)) {
        throw new ConflictException({ message: changedMessage, rows: [] });
      }
      throw error;
    });
    if (committed.after) {
      try { await committed.after(); }
      catch (error) { this.logger.warn(`Post-import side effect failed for batch ${id}: ${error}`); }
    }
    return committed.response;
  }
}
