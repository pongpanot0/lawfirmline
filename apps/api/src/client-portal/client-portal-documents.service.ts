import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { UploadPortalCaseDocumentDto } from './dto/portal-case-document.dto';
import { createClientKeyDateSuggestion, firstFirmOwnerId, uploadedFileBuffer } from './portal-case-helpers';

@Injectable()
export class ClientPortalDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: DocumentsService,
    private readonly notifier: AssignmentNotifierService,
    private readonly fileStorage: FileStorageService,
  ) {}

  /** A client adds a document to a case they can see; the lead lawyer and owners are told after commit. */
  async uploadToCase(
    portalUser: PortalIdentity,
    caseId: string,
    dto: UploadPortalCaseDocumentDto,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('กรุณาแนบไฟล์');

    const now = new Date();
    const legalCase = await this.prisma.case.findFirst({
      where: {
        id: caseId,
        clientId: portalUser.clientId,
        contactAccess: {
          some: {
            clientContactId: portalUser.clientContactId,
            revokedAt: null,
            startDate: { lte: now },
            OR: [{ endDate: null }, { endDate: { gte: now } }],
          },
        },
      },
      select: { id: true, ownRef: true, leadLawyerId: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    // The blob is stored while the tx is open; if a later write rolls back, remove it.
    let storedPath: string | null = null;
    const document = await this.prisma
      .$transaction(async (tx) => {
        const ownerId = await firstFirmOwnerId(tx, portalUser.firmId);
        const created = await this.documents.createFromClientBuffer(tx, {
          firmId: portalUser.firmId,
          caseId: legalCase.id,
          contactId: portalUser.clientContactId,
          actorUserId: ownerId,
          filename: decodeUploadFilename(file.originalname),
          buffer: uploadedFileBuffer(file),
          mimeType: file.mimetype,
          category: dto.docType,
          description: dto.note,
        });
        storedPath = created.storagePath;

        if (dto.keyDate) {
          await createClientKeyDateSuggestion(tx, {
            caseId: legalCase.id,
            documentId: created.id,
            keyDate: dto.keyDate,
            keyDateLabel: dto.keyDateLabel,
            createdById: ownerId,
          });
        }
        return created;
      }, { timeout: 30000 }) // the file upload to storage runs inside the transaction
      .catch(async (error) => {
        if (storedPath) await this.fileStorage.delete(storedPath).catch(() => undefined);
        throw error;
      });

    try {
      const owners = await this.prisma.firmMember.findMany({
        where: { firmId: portalUser.firmId, role: FirmRole.OWNER },
        select: { userId: true },
      });
      await this.notifier.notifyAssigned({
        firmId: portalUser.firmId,
        userIds: [legalCase.leadLawyerId, ...owners.map((o) => o.userId)],
        actorUserId: '',
        summaryText: `ลูกความอัปโหลดเอกสาร ${document.filename} ในคดี ${legalCase.ownRef}`,
        entityPath: `/cases/${legalCase.id}?tab=documents`,
      });
    } catch {
      // alerting the firm must never fail the client's upload
    }

    return document;
  }

  /** A client downloads a document their own contact uploaded to a case they can still see. */
  async getClientUploadFile(portalUser: PortalIdentity, caseId: string, documentId: string) {
    const now = new Date();
    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        caseId,
        uploadedByContact: { clientId: portalUser.clientId },
        case: {
          clientId: portalUser.clientId,
          contactAccess: {
            some: {
              clientContactId: portalUser.clientContactId,
              revokedAt: null,
              startDate: { lte: now },
              OR: [{ endDate: null }, { endDate: { gte: now } }],
            },
          },
        },
      },
      select: { storagePath: true, filename: true, mimeType: true },
    });
    if (!document) throw new NotFoundException('Document not found');
    return { path: document.storagePath, filename: document.filename, mimeType: document.mimeType };
  }
}
