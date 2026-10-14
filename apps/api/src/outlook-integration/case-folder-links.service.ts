import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseExternalLinkKind } from '../generated/prisma';
import { OutlookConnectionsService } from './outlook-connections.service';
import { GraphMailFoldersClient } from './graph/graph-mail-folders.client';
import { CaseFolderSyncService } from './case-folder-sync.service';
import { CaseMatchSuggestion, MATCHABLE_CASE_SELECT, suggestCaseMatches, toMatchableCase } from './case-matching';

export interface OutlookFolderRow {
  folderId: string;
  displayPath: string;
  link: { id: string; caseId: string; ownRef: string; title: string } | null;
  suggestions: CaseMatchSuggestion[];
}

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === 'P2002';
const OUTLOOK_FOLDER = CaseExternalLinkKind.OUTLOOK_FOLDER;
const MAX_SUGGESTIONS_PER_FOLDER = 5;

@Injectable()
export class CaseFolderLinksService {
  private readonly logger = new Logger(CaseFolderLinksService.name);

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private folders: GraphMailFoldersClient,
    private caseAccess: CaseAccessService,
    private sync: CaseFolderSyncService,
  ) {}

  /** Links are always made from the caller's OWN mailbox — never someone else's. */
  private async ownConnection(user: AuthUser) {
    const connection = await this.connections.findActiveForUser(user.id);
    if (!connection) throw new BadRequestException('ยังไม่ได้เชื่อม Microsoft 365 — เชื่อมที่หน้าตั้งค่าก่อน');
    const accessToken = await this.connections.getValidAccessToken(connection.id);
    return { connection, accessToken };
  }

  async listFolders(user: AuthUser): Promise<OutlookFolderRow[]> {
    const { connection, accessToken } = await this.ownConnection(user);
    const [folders, caseRows, links] = await Promise.all([
      this.folders.listMailFolders(accessToken),
      this.prisma.case.findMany({ where: this.caseAccess.getCaseFilterForUser(user), select: MATCHABLE_CASE_SELECT }),
      this.prisma.caseExternalLink.findMany({
        where: { connectionId: connection.id, kind: OUTLOOK_FOLDER },
        select: { id: true, externalId: true, caseId: true, case: { select: { ownRef: true, title: true } } },
      }),
    ]);
    const cases = caseRows.map(toMatchableCase);
    const linkByFolder = new Map(links.map((link) => [link.externalId, link]));

    return folders
      .filter((folder) => !folder.isSystem)
      .map((folder) => {
        const link = linkByFolder.get(folder.id);
        return {
          folderId: folder.id,
          displayPath: folder.displayPath,
          link: link ? { id: link.id, caseId: link.caseId, ownRef: link.case.ownRef, title: link.case.title } : null,
          // ponytail: O(folders × cases) regex scan per request — fine for hundreds × low thousands; precompile/index if a firm outgrows it.
          suggestions: link ? [] : suggestCaseMatches(folder.displayName, cases).slice(0, MAX_SUGGESTIONS_PER_FOLDER),
        };
      });
  }

  /** The human "ยืนยัน" step. All-or-nothing: every item is validated before anything is written. */
  async linkFolders(user: AuthUser, items: { folderId: string; caseId: string }[]) {
    if (items.length === 0) return { linked: [] };
    const folderIds = items.map((item) => item.folderId);
    if (new Set(folderIds).size !== folderIds.length) throw new BadRequestException('เลือก folder ซ้ำกัน');

    const { connection, accessToken } = await this.ownConnection(user);

    const caseIds = [...new Set(items.map((item) => item.caseId))];
    const allowed = await this.prisma.case.findMany({
      where: { AND: [this.caseAccess.getCaseFilterForUser(user), { id: { in: caseIds } }] },
      select: { id: true },
    });
    if (allowed.length !== caseIds.length) throw new NotFoundException('ไม่พบคดีที่เลือก หรือคุณไม่มีสิทธิ์ในคดีนั้น');

    const folders = new Map((await this.folders.listMailFolders(accessToken)).map((folder) => [folder.id, folder]));
    for (const item of items) {
      const folder = folders.get(item.folderId);
      if (!folder) throw new BadRequestException('ไม่พบ folder นี้ในกล่องอีเมลของคุณ');
      if (folder.isSystem) {
        throw new BadRequestException(`ผูก "${folder.displayPath}" กับคดีไม่ได้ — เลือก folder ย่อยที่เก็บอีเมลของคดีนี้`);
      }
    }

    const existing = await this.prisma.caseExternalLink.findMany({
      where: { connectionId: connection.id, kind: OUTLOOK_FOLDER, externalId: { in: folderIds } },
      select: { externalId: true, caseId: true, displayPath: true },
    });
    const existingByFolder = new Map(existing.map((link) => [link.externalId, link]));
    for (const item of items) {
      const current = existingByFolder.get(item.folderId);
      if (current && current.caseId !== item.caseId) {
        throw new ConflictException(`folder "${current.displayPath}" ผูกกับคดีอื่นอยู่แล้ว — ยกเลิกการผูกเดิมก่อน`);
      }
    }

    const fresh = items.filter((item) => !existingByFolder.has(item.folderId));
    if (fresh.length === 0) return { linked: [] };

    const created = await this.prisma
      .$transaction(
      fresh.map((item) =>
        this.prisma.caseExternalLink.create({
          data: {
            firmId: user.firmId,
            caseId: item.caseId,
            connectionId: connection.id,
            kind: OUTLOOK_FOLDER,
            externalId: item.folderId,
            displayPath: folders.get(item.folderId)!.displayPath,
            linkedById: user.id,
          },
        }),
      ),
      )
      .catch((error) => {
        if (isUniqueViolation(error)) throw new ConflictException('folder นี้ผูกกับคดีอยู่แล้ว — ลองรีเฟรชแล้วทำใหม่');
        throw error;
      });
    await this.prisma.auditLog.createMany({
      data: created.map((link) => ({
        firmId: user.firmId,
        userId: user.id,
        action: 'CASE_FOLDER_LINKED',
        metadata: { caseId: link.caseId, linkId: link.id, displayPath: link.displayPath },
      })),
    });

    // First sync = full backfill; can take minutes on a large folder, so it never blocks the confirm request.
    for (const link of created) {
      this.sync.syncLink(link.id).catch((error) => this.logger.warn(`Initial sync of folder link ${link.id} failed: ${error}`));
    }

    return {
      linked: created.map((link) => ({
        id: link.id,
        caseId: link.caseId,
        externalId: link.externalId,
        displayPath: link.displayPath,
      })),
    };
  }

  listForCase(caseId: string) {
    return this.prisma.caseExternalLink.findMany({
      where: { caseId, kind: OUTLOOK_FOLDER },
      select: {
        id: true,
        displayPath: true,
        lastSyncedAt: true,
        lastError: true,
        linkedById: true,
        connection: { select: { mailboxAddress: true, status: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /** Stops syncing; email already filed in the case stays there. */
  async unlink(user: AuthUser, linkId: string): Promise<{ unlinked: true }> {
    const link = await this.prisma.caseExternalLink.findFirst({
      where: { id: linkId, firmId: user.firmId, kind: OUTLOOK_FOLDER },
      select: { id: true, caseId: true, displayPath: true, linkedById: true, connection: { select: { userId: true } } },
    });
    if (!link) throw new NotFoundException('ไม่พบการผูก folder นี้');
    const canManage =
      link.linkedById === user.id ||
      link.connection.userId === user.id ||
      hasFirmCapability(user.firmRole, 'viewAllCases');
    if (!canManage) {
      throw new ForbiddenException('ยกเลิกการผูกได้เฉพาะผู้ที่ผูก เจ้าของกล่องอีเมล หรือผู้ดูแลสำนักงาน');
    }
    if (!(await this.caseAccess.canAccessCase(user, link.caseId))) {
      throw new ForbiddenException('ไม่มีสิทธิ์เข้าถึงคดีนี้');
    }
    await this.prisma.caseExternalLink.delete({ where: { id: link.id } });
    await this.prisma.auditLog.create({
      data: {
        firmId: user.firmId,
        userId: user.id,
        action: 'CASE_FOLDER_UNLINKED',
        metadata: { caseId: link.caseId, linkId: link.id, displayPath: link.displayPath },
      },
    });
    return { unlinked: true };
  }
}
