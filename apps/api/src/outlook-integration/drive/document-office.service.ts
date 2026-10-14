import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../../prisma/prisma.module';
import { DocumentsService } from '../../documents/documents.service';
import { FileStorageService } from '../../common/services/file-storage.service';
import { DriveItem, GraphDriveClient } from '../graph/graph-drive.client';
import { GraphApiError } from '../graph/graph-http';
import { CaseDriveService } from './case-drive.service';
import { driveErrorMessage, toDriveHttpError } from './drive-errors';

/** Files Office for the web can edit. */
export const OFFICE_EDITABLE = /\.(docx|xlsx|pptx)$/i;

const UPLOADER_GONE_MESSAGE = 'ผู้เปิดแก้ใน Office ออนไลน์ตัดการเชื่อมต่อแล้ว — ดึงกลับไม่ได้ ให้เปิดแก้ใหม่จากเวอร์ชันในระบบ';
const BOTH_EDITED_MESSAGE =
  'มีการแก้ทั้งในระบบและใน Office ออนไลน์ — กด "ดึงเวอร์ชันล่าสุดกลับ" ก่อน แล้วค่อยเปิดแก้อีกครั้ง';

export interface DocumentOfficeLinkView {
  documentId: string;
  webUrl: string;
  uploadedVersion: number;
  lastModifiedDateTime: string | null;
  hasNewerEdits: boolean;
  error: string | null;
}

/**
 * When we last synced. Microsoft's clock and ours drift a little; the later of the two means a file
 * we just uploaded never shows up as "แก้ใน Word ล่าสุด" by itself.
 */
export function syncStamp(item: { lastModifiedDateTime: string }, now = new Date()): Date {
  return new Date(Math.max(now.getTime(), Date.parse(item.lastModifiedDateTime) || 0));
}

/**
 * `uploadNewVersion` expects a Multer file and runs `decodeUploadFilename` (latin1 → UTF-8) on its
 * name, so encode the name the way Multer would or Thai names come out as garbage.
 */
export function asUploadedFile(filename: string, buffer: Buffer, mimeType: string): Express.Multer.File {
  return {
    originalname: Buffer.from(filename, 'utf8').toString('latin1'),
    buffer,
    mimetype: mimeType,
    size: buffer.length,
  } as Express.Multer.File;
}

@Injectable()
export class DocumentOfficeService {
  constructor(
    private prisma: PrismaService,
    private caseDrive: CaseDriveService,
    private drive: GraphDriveClient,
    private documents: DocumentsService,
    private fileStorage: FileStorageService,
  ) {}

  private async loadDocument(caseId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId },
      include: { officeLink: true, case: { select: { ownRef: true } } },
    });
    if (!document?.case) throw new NotFoundException('ไม่พบเอกสาร');
    return { ...document, case: document.case };
  }

  /** "เปิดแก้ใน Word ออนไลน์": make sure OneDrive holds the latest system version, return its webUrl. */
  async open(user: AuthUser, caseId: string, documentId: string): Promise<{ webUrl: string }> {
    const doc = await this.loadDocument(caseId, documentId);
    if (!OFFICE_EDITABLE.test(doc.filename)) {
      throw new BadRequestException('เปิดแก้ใน Office ออนไลน์ได้เฉพาะไฟล์ .docx .xlsx .pptx');
    }
    try {
      const link = doc.officeLink;
      const linkToken = link ? await this.caseDrive.tokenForConnection(link.connectionId) : null;

      if (link && linkToken) {
        let webUrl = link.webUrl;
        if (doc.version > link.uploadedVersion) {
          const current = await this.drive.getItem(linkToken, link.driveId, link.itemId);
          if (Date.parse(current.lastModifiedDateTime) > link.updatedAt.getTime()) throw new ConflictException(BOTH_EDITED_MESSAGE);
          const buffer = await this.fileStorage.getBuffer(doc.storagePath);
          const item = await this.drive.replaceContent(linkToken, link.driveId, link.itemId, buffer, doc.mimeType);
          await this.prisma.documentOfficeLink.update({
            where: { id: link.id },
            data: { uploadedVersion: doc.version, webUrl: item.webUrl, updatedAt: syncStamp(item) },
          });
          webUrl = item.webUrl;
        }
        await this.caseDrive.audit(user, 'DOCUMENT_OFFICE_OPENED', { caseId, documentId, version: doc.version });
        return { webUrl };
      }

      // No copy yet, or its uploader disconnected (their copy can no longer be read back): new copy as the caller.
      const { connectionId, token } = await this.caseDrive.ownToken(user);
      const buffer = await this.fileStorage.getBuffer(doc.storagePath);
      const item = await this.uploadCopy(token, caseId, doc.case.ownRef, doc.filename, buffer, doc.mimeType);
      const driveId = item.parentReference?.driveId;
      if (!driveId) throw new BadRequestException('OneDrive ไม่ได้ส่งรหัส drive กลับมา');
      const data = {
        connectionId,
        driveId,
        itemId: item.id,
        webUrl: item.webUrl,
        uploadedVersion: doc.version,
        updatedAt: syncStamp(item),
      };
      await this.prisma.documentOfficeLink.upsert({ where: { documentId }, create: { documentId, ...data }, update: data });
      await this.caseDrive.audit(user, 'DOCUMENT_OFFICE_OPENED', { caseId, documentId, version: doc.version });
      return { webUrl: item.webUrl };
    } catch (error) {
      throw toDriveHttpError(error);
    }
  }

  /** Into the case's linked folder when the caller may write there, else OneDrive ของฉัน/Samnuan/{ownRef}. */
  private async uploadCopy(token: string, caseId: string, ownRef: string, filename: string, buffer: Buffer, mimeType: string): Promise<DriveItem> {
    const link = await this.caseDrive.findLink(caseId);
    if (link?.driveId) {
      try {
        return await this.drive.upload(token, link.driveId, link.externalId, filename, buffer, mimeType);
      } catch (error) {
        if (!(error instanceof GraphApiError) || (error.status !== 403 && error.status !== 404)) throw error;
      }
    }
    const folder = await this.drive.ensureFolderPath(token, ['Samnuan', ownRef]);
    return this.drive.upload(token, 'me', folder.id, filename, buffer, mimeType);
  }

  /** "ดึงเวอร์ชันล่าสุดกลับ": Office edits → new DocumentVersion through the normal upload path. */
  async pull(user: AuthUser, caseId: string, documentId: string): Promise<{ updated: boolean; version: number }> {
    const doc = await this.loadDocument(caseId, documentId);
    const link = doc.officeLink;
    if (!link) throw new NotFoundException('เอกสารนี้ยังไม่เคยเปิดแก้ใน Office ออนไลน์');
    const token = await this.caseDrive.tokenForConnection(link.connectionId);
    if (!token) throw new BadRequestException(UPLOADER_GONE_MESSAGE);
    try {
      const item = await this.drive.getItem(token, link.driveId, link.itemId);
      if (Date.parse(item.lastModifiedDateTime) <= link.updatedAt.getTime()) return { updated: false, version: doc.version };
      const buffer = await this.drive.downloadContent(token, link.driveId, link.itemId);
      const updated = await this.documents.uploadNewVersion(
        user,
        caseId,
        documentId,
        asUploadedFile(doc.filename, buffer, doc.mimeType),
        'ดึงจาก Office ออนไลน์',
      );
      await this.prisma.documentOfficeLink.update({
        where: { id: link.id },
        data: { uploadedVersion: updated.version, updatedAt: syncStamp(item) },
      });
      await this.caseDrive.audit(user, 'DOCUMENT_OFFICE_PULLED', { caseId, documentId, version: updated.version });
      return { updated: true, version: updated.version };
    } catch (error) {
      throw toDriveHttpError(error);
    }
  }

  /** Per-document Office status for the documents tab ("แก้ใน Word ล่าสุด {เวลา}"). */
  async listForCase(caseId: string): Promise<DocumentOfficeLinkView[]> {
    const links = await this.prisma.documentOfficeLink.findMany({ where: { document: { caseId } } });
    return Promise.all(
      links.map(async (link): Promise<DocumentOfficeLinkView> => {
        const base = { documentId: link.documentId, webUrl: link.webUrl, uploadedVersion: link.uploadedVersion };
        const token = await this.caseDrive.tokenForConnection(link.connectionId);
        if (!token) return { ...base, lastModifiedDateTime: null, hasNewerEdits: false, error: UPLOADER_GONE_MESSAGE };
        try {
          const item = await this.drive.getItem(token, link.driveId, link.itemId);
          return {
            ...base,
            lastModifiedDateTime: item.lastModifiedDateTime,
            hasNewerEdits: Date.parse(item.lastModifiedDateTime) > link.updatedAt.getTime(),
            error: null,
          };
        } catch (error) {
          return { ...base, lastModifiedDateTime: null, hasNewerEdits: false, error: driveErrorMessage(error) };
        }
      }),
    );
  }
}
