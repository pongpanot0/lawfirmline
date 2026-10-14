import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, hasFirmCapability } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { CaseExternalLinkKind, MailboxConnectionStatus } from '../../generated/prisma';
import { DocumentsService } from '../../documents/documents.service';
import { OutlookConnectionsService } from '../outlook-connections.service';
import { DriveItem, GraphDrive, GraphDriveClient, GraphSite } from '../graph/graph-drive.client';
import { DRIVE_DISCONNECTED_MESSAGE, driveErrorMessage, rethrowDriveError } from './drive-errors';

export const NO_MICROSOFT_CONNECTION_MESSAGE = 'ยังไม่ได้เชื่อมต่อบัญชี Microsoft — ไปที่ ตั้งค่า → Microsoft 365 เพื่อเชื่อมต่อก่อน';
/** Import reads the whole file into memory; bigger files stay in OneDrive ("เปิดใน Office ออนไลน์"). */
export const DRIVE_IMPORT_MAX_BYTES = 100 * 1024 * 1024;

export type DriveAuditAction =
  | 'DRIVE_FOLDER_LINKED'
  | 'DRIVE_FOLDER_UNLINKED'
  | 'DRIVE_FOLDER_VIEWED'
  | 'DRIVE_FILE_OPENED'
  | 'DRIVE_FILE_IMPORTED'
  | 'DOCUMENT_OFFICE_OPENED'
  | 'DOCUMENT_OFFICE_PULLED';

export interface DriveItemView {
  id: string;
  name: string;
  isFolder: boolean;
  size: number | null;
  webUrl: string;
  lastModifiedDateTime: string;
  lastModifiedBy: string | null;
  mimeType: string | null;
}

export interface DrivePickerItem {
  id: string;
  driveId: string;
  name: string;
  webUrl: string;
}

export type CaseDriveState = 'NO_LINK' | 'OK' | 'DISCONNECTED' | 'ERROR';

export interface CaseDriveListing {
  state: CaseDriveState;
  message: string | null;
  link: { id: string; displayPath: string; linkedBy: string | null; isMine: boolean } | null;
  items: DriveItemView[];
}

/** `/drive/root:/Cases` + `ACME` → `Cases/ACME`; shared items have no path, so just the name. */
export function driveDisplayPath(item: DriveItem): string {
  const parent = item.parentReference?.path?.split('root:')[1] ?? '';
  return `${parent}/${item.name}`.replace(/^\/+/, '');
}

function toItemView(item: DriveItem): DriveItemView {
  return {
    id: item.id,
    name: item.name,
    isFolder: !!item.folder,
    size: item.size ?? null,
    webUrl: item.webUrl,
    lastModifiedDateTime: item.lastModifiedDateTime,
    lastModifiedBy: item.lastModifiedBy?.user?.displayName ?? null,
    mimeType: item.file?.mimeType ?? null,
  };
}

/** Folder rows for the picker. "Shared with me" entries point at the real item through `remoteItem`. */
export function toPickerItem(item: DriveItem): DrivePickerItem | null {
  const target = item.remoteItem ?? item;
  const driveId = target.parentReference?.driveId;
  if (!target.folder || !driveId) return null;
  return { id: target.id, driveId, name: item.name, webUrl: target.webUrl ?? item.webUrl };
}

const DRIVE_FOLDER = CaseExternalLinkKind.DRIVE_FOLDER;

@Injectable()
export class CaseDriveService {
  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
    private drive: GraphDriveClient,
    private documents: DocumentsService,
  ) {}

  /** "ใครเปิด/ดาวน์โหลดไฟล์คดีนี้" must be answerable for OneDrive files too. */
  async audit(user: AuthUser, action: DriveAuditAction, metadata: Record<string, unknown>) {
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action, metadata: metadata as never },
    });
  }

  /** The caller's own Microsoft token — picking folders and creating copies is always done as yourself. */
  async ownToken(user: AuthUser): Promise<{ connectionId: string; token: string }> {
    const connection = await this.connections.findActiveForUser(user.id);
    if (!connection) throw new BadRequestException(NO_MICROSOFT_CONNECTION_MESSAGE);
    return { connectionId: connection.id, token: await this.connections.getValidAccessToken(connection.id) };
  }

  findLink(caseId: string) {
    return this.prisma.caseExternalLink.findFirst({ where: { caseId, kind: DRIVE_FOLDER } });
  }

  /** Token of a stored connection, or null once its owner disconnected or the refresh failed. */
  async tokenForConnection(connectionId: string): Promise<string | null> {
    const connection = await this.prisma.mailboxConnection.findUnique({ where: { id: connectionId }, select: { status: true } });
    if (connection?.status !== MailboxConnectionStatus.ACTIVE) return null;
    try {
      return await this.connections.getValidAccessToken(connectionId);
    } catch {
      return null;
    }
  }

  async linkFolder(user: AuthUser, caseId: string, dto: { driveId: string; itemId: string }) {
    const { connectionId, token } = await this.ownToken(user);
    const item = await this.drive.getItem(token, dto.driveId, dto.itemId).catch(rethrowDriveError);
    if (!item.folder) throw new BadRequestException('เลือกได้เฉพาะ folder');
    // A SharePoint library root may come back without parentReference.
    const driveId = item.parentReference?.driveId ?? (dto.driveId !== 'me' ? dto.driveId : undefined);
    if (!driveId) throw new BadRequestException('ไม่พบ drive ของ folder นี้');

    const taken = await this.prisma.caseExternalLink.findUnique({
      where: { connectionId_kind_externalId: { connectionId, kind: DRIVE_FOLDER, externalId: item.id } },
    });
    if (taken && taken.caseId !== caseId) throw new ConflictException('folder นี้ผูกกับคดีอื่นอยู่แล้ว');

    const existing = await this.findLinkOwnership(caseId);
    if (existing) this.assertCanChangeLink(user, existing, 'เปลี่ยน folder ได้เฉพาะผู้ที่ผูก เจ้าของกล่องอีเมล หรือผู้ดูแลสำนักงาน');

    const link = await this.prisma.$transaction(async (tx) => {
      // One drive folder per case: the documents tab and "เปิดแก้ใน Word" need a single target.
      await tx.caseExternalLink.deleteMany({ where: { caseId, kind: DRIVE_FOLDER } });
      return tx.caseExternalLink.create({
        data: {
          firmId: user.firmId,
          caseId,
          connectionId,
          kind: DRIVE_FOLDER,
          externalId: item.id,
          driveId,
          displayPath: driveDisplayPath(item),
          linkedById: user.id,
        },
      });
    });
    await this.audit(user, 'DRIVE_FOLDER_LINKED', { caseId, linkId: link.id, displayPath: link.displayPath });
    return link;
  }

  private findLinkOwnership(caseId: string) {
    return this.prisma.caseExternalLink.findFirst({
      where: { caseId, kind: DRIVE_FOLDER },
      select: { id: true, linkedById: true, connection: { select: { userId: true } } },
    });
  }

  private assertCanChangeLink(user: AuthUser, link: { linkedById: string; connection: { userId: string | null } }, message: string) {
    const allowed = link.linkedById === user.id || link.connection.userId === user.id || hasFirmCapability(user.firmRole, 'viewAllCases');
    if (!allowed) throw new ForbiddenException(message);
  }

  async unlinkFolder(user: AuthUser, caseId: string): Promise<{ unlinked: boolean }> {
    const existing = await this.findLinkOwnership(caseId);
    if (!existing) return { unlinked: false };
    this.assertCanChangeLink(user, existing, 'ยกเลิกการผูกได้เฉพาะผู้ที่ผูก เจ้าของกล่องอีเมล หรือผู้ดูแลสำนักงาน');
    const { count } = await this.prisma.caseExternalLink.deleteMany({ where: { caseId, kind: DRIVE_FOLDER } });
    if (count) await this.audit(user, 'DRIVE_FOLDER_UNLINKED', { caseId });
    return { unlinked: count > 0 };
  }

  /** Live listing (nothing cached), read with the linker's token; everyone with case access may see it. */
  async listCaseFolder(user: AuthUser, caseId: string): Promise<CaseDriveListing> {
    const link = await this.findLink(caseId);
    if (!link?.driveId) return { state: 'NO_LINK', message: null, link: null, items: [] };

    const linker = await this.prisma.user.findUnique({
      where: { id: link.linkedById },
      select: { firstName: true, lastName: true },
    });
    const view = {
      id: link.id,
      displayPath: link.displayPath,
      linkedBy: linker ? `${linker.firstName} ${linker.lastName}` : null,
      isMine: link.linkedById === user.id,
    };

    const token = await this.tokenForConnection(link.connectionId);
    if (!token) {
      return { state: 'DISCONNECTED', message: `${DRIVE_DISCONNECTED_MESSAGE} — ผูก folder ใหม่ด้วยบัญชี Microsoft ของคุณ`, link: view, items: [] };
    }
    try {
      const items = await this.drive.listChildren(token, link.driveId, link.externalId);
      await this.audit(user, 'DRIVE_FOLDER_VIEWED', { caseId, linkId: link.id });
      return { state: 'OK', message: null, link: view, items: items.map(toItemView) };
    } catch (error) {
      return { state: 'ERROR', message: driveErrorMessage(error), link: view, items: [] };
    }
  }

  private async activeLink(caseId: string) {
    const link = await this.findLink(caseId);
    if (!link?.driveId) throw new NotFoundException('คดีนี้ยังไม่ได้ผูก folder OneDrive');
    const token = await this.tokenForConnection(link.connectionId);
    if (!token) throw new BadRequestException(DRIVE_DISCONNECTED_MESSAGE);
    return { link, token, driveId: link.driveId };
  }

  /**
   * An item id sent by the browser, accepted only if it sits directly in the case's linked folder —
   * the linker's token must not become a window into the rest of their OneDrive.
   */
  private async linkedItem(caseId: string, itemId: string) {
    const { link, token, driveId } = await this.activeLink(caseId);
    const item = await this.drive.getItem(token, driveId, itemId).catch(rethrowDriveError);
    if (item.parentReference?.id !== link.externalId) throw new NotFoundException('ไม่พบไฟล์นี้ใน folder ที่ผูกกับคดี');
    return { token, driveId, item };
  }

  async openItem(user: AuthUser, caseId: string, itemId: string): Promise<{ webUrl: string }> {
    const { item } = await this.linkedItem(caseId, itemId);
    await this.audit(user, 'DRIVE_FILE_OPENED', { caseId, itemId, name: item.name });
    return { webUrl: item.webUrl };
  }

  async importItem(user: AuthUser, caseId: string, itemId: string) {
    const { token, driveId, item } = await this.linkedItem(caseId, itemId);
    return this.importDriveFile(user, caseId, token, driveId, item);
  }

  /** "นำเข้าไฟล์ทั้ง folder" — offered before a disconnect so the files outlive the link. */
  async importAll(user: AuthUser, caseId: string): Promise<{ imported: number; skipped: string[] }> {
    const { link, token, driveId } = await this.activeLink(caseId);
    const items = await this.drive.listChildren(token, driveId, link.externalId).catch(rethrowDriveError);
    let imported = 0;
    const skipped: string[] = [];
    for (const item of items) {
      if (!item.file) continue;
      if ((item.size ?? 0) > DRIVE_IMPORT_MAX_BYTES) {
        skipped.push(item.name);
        continue;
      }
      await this.importDriveFile(user, caseId, token, driveId, item);
      imported += 1;
    }
    return { imported, skipped };
  }

  private async importDriveFile(user: AuthUser, caseId: string, token: string, driveId: string, item: DriveItem) {
    if (!item.file) throw new BadRequestException('นำเข้าได้เฉพาะไฟล์ ไม่ใช่ folder');
    if ((item.size ?? 0) > DRIVE_IMPORT_MAX_BYTES) throw new BadRequestException('ไฟล์ใหญ่เกิน 100 MB — ใช้ "เปิดใน Office ออนไลน์" แทน');
    const buffer = await this.drive.downloadContent(token, driveId, item.id).catch(rethrowDriveError);
    const document = await this.documents.createFromBuffer(user, caseId, {
      filename: item.name,
      buffer,
      mimeType: item.file.mimeType ?? 'application/octet-stream',
    });
    await this.audit(user, 'DRIVE_FILE_IMPORTED', { caseId, itemId: item.id, name: item.name, documentId: document.id });
    return document;
  }

  // --- folder picker (caller's own connection) ---

  async pickerChildren(user: AuthUser, driveId: string, itemId: string): Promise<DrivePickerItem[]> {
    const { token } = await this.ownToken(user);
    const items = await this.drive.listChildren(token, driveId, itemId).catch(rethrowDriveError);
    return items.map(toPickerItem).filter((item): item is DrivePickerItem => item !== null);
  }

  async pickerShared(user: AuthUser): Promise<DrivePickerItem[]> {
    const { token } = await this.ownToken(user);
    const items = await this.drive.sharedWithMe(token).catch(rethrowDriveError);
    return items.map(toPickerItem).filter((item): item is DrivePickerItem => item !== null);
  }

  async pickerSites(user: AuthUser, query: string): Promise<GraphSite[]> {
    const { token } = await this.ownToken(user);
    return this.drive.searchSites(token, query).catch(rethrowDriveError);
  }

  async pickerSiteDrives(user: AuthUser, siteId: string): Promise<GraphDrive[]> {
    const { token } = await this.ownToken(user);
    return this.drive.listSiteDrives(token, siteId).catch(rethrowDriveError);
  }
}
