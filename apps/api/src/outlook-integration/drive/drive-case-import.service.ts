import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { CaseExternalLinkKind } from '../../generated/prisma';
import { CasesService } from '../../cases/cases.service';
import { assertCanOpenCases } from '../../common/plan-limits';
import { GraphDriveClient } from '../graph/graph-drive.client';
import { CaseDriveService, driveDisplayPath } from './case-drive.service';
import { driveErrorMessage } from './drive-errors';
import { ImportDriveCasesDto } from './drive-case-import.dto';

export interface DriveCaseImportResult {
  itemId: string;
  status: 'CREATED' | 'ALREADY_LINKED' | 'FAILED';
  caseId?: string;
  ownRef?: string;
  message?: string;
}

const DRIVE_FOLDER = CaseExternalLinkKind.DRIVE_FOLDER;
/** P2002 on the link's key means the folder got linked meanwhile; on anything else (e.g. ownRef) nothing was created. */
const isLinkUniqueViolation = (e: unknown) => {
  const error = e as { code?: string; meta?: { target?: unknown } } | null;
  return error?.code === 'P2002' && String(error.meta?.target ?? '').includes('externalId');
};
const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';

/**
 * "สร้างคดีจาก folder": brings old work in from OneDrive, one new case per folder, linked with the
 * importer's own Microsoft account. Reads OneDrive only. Each row is its own transaction (case + link),
 * so a re-run after a partial failure finds the done rows linked and skips them.
 */
@Injectable()
export class DriveCaseImportService {
  private readonly logger = new Logger(DriveCaseImportService.name);

  constructor(
    private prisma: PrismaService,
    private cases: CasesService,
    private drive: GraphDriveClient,
    private caseDrive: CaseDriveService,
  ) {}

  async importCases(user: AuthUser, dto: ImportDriveCasesDto): Promise<{ results: DriveCaseImportResult[] }> {
    const { connectionId, token } = await this.caseDrive.ownToken(user);

    // All-or-nothing checks before the first case exists.
    const teamIds = [...new Set(dto.rows.flatMap((r) => [r.leadLawyerId, ...(r.buddyIds ?? [])]))];
    const members = await this.prisma.firmMember.count({
      where: { role: { not: FirmRole.EXTERNAL }, firmId: user.firmId, userId: { in: teamIds } },
    });
    if (members !== teamIds.length) throw new BadRequestException('ทนายและทีมทุกคนต้องเป็นสมาชิกของสำนักงาน');
    const openRows = dto.rows.filter((r) => !r.closed).length;
    if (openRows > 0) await assertCanOpenCases(this.prisma, user.firmId, openRows);

    const results: DriveCaseImportResult[] = [];
    // ponytail: sequential Graph + DB per row (~100 rows × 2 calls); parallelise if imports get slow.
    for (const row of dto.rows) {
      results.push(await this.importRow(user, connectionId, token, dto.driveId, row));
    }
    return { results };
  }

  private async importRow(
    user: AuthUser,
    connectionId: string,
    token: string,
    requestDriveId: string,
    row: ImportDriveCasesDto['rows'][number],
  ): Promise<DriveCaseImportResult> {
    const { itemId } = row;
    try {
      const item = await this.drive.getItem(token, requestDriveId, itemId);
      if (!item.folder) return { itemId, status: 'FAILED', message: 'เลือกได้เฉพาะ folder' };
      const driveId = item.parentReference?.driveId ?? (requestDriveId !== 'me' ? requestDriveId : undefined);
      if (!driveId) return { itemId, status: 'FAILED', message: 'ไม่พบ drive ของ folder นี้' };

      const existing = await this.prisma.caseExternalLink.findFirst({
        where: { firmId: user.firmId, kind: DRIVE_FOLDER, driveId, externalId: item.id },
        select: { caseId: true },
      });
      if (existing) return { itemId, status: 'ALREADY_LINKED', caseId: existing.caseId };

      const { created, link } = await this.prisma.$transaction(async (tx) => {
        const created = await this.cases.createForImport(tx, user, {
          title: row.title,
          blackCaseNumber: row.blackCaseNumber || null,
          courtName: row.courtName || null,
          courtLevel: row.courtLevel,
          leadLawyerId: row.leadLawyerId,
          buddyIds: row.buddyIds ?? [],
          closed: row.closed ? { outcome: row.outcome!, closingSummary: row.closingSummary!.trim() } : null,
        });
        const link = await tx.caseExternalLink.create({
          data: {
            firmId: user.firmId,
            caseId: created.id,
            connectionId,
            kind: DRIVE_FOLDER,
            externalId: item.id,
            driveId,
            displayPath: driveDisplayPath(item),
            linkedById: user.id,
          },
        });
        return { created, link };
      });
      await this.caseDrive.audit(user, 'DRIVE_FOLDER_LINKED', {
        caseId: created.id,
        linkId: link.id,
        displayPath: link.displayPath,
        source: 'IMPORT',
      });
      return { itemId, status: 'CREATED', caseId: created.id, ownRef: created.ownRef };
    } catch (error) {
      if (isLinkUniqueViolation(error)) return { itemId, status: 'ALREADY_LINKED' };
      if (isUniqueViolation(error)) return { itemId, status: 'FAILED', message: 'เลขอ้างอิงคดีชนกับคดีที่เพิ่งสร้าง — กดสร้างอีกครั้ง' };
      this.logger.warn(`OneDrive import of ${itemId} failed: ${error}`);
      return { itemId, status: 'FAILED', message: driveErrorMessage(error) };
    }
  }
}
