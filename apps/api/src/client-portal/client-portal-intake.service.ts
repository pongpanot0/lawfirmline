import { randomUUID } from 'crypto';
import { portalRequestScope } from './portal-workroom.service';
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';
import { mapInternalStatusToExternal } from '../intake/intake-status-mapping';
import { CaseFeedService } from '../common/services/case-feed.service';
import { FileStorageService } from '../common/services/file-storage.service';
import { CasesService } from '../cases/cases.service';
import { DocumentsService } from '../documents/documents.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { ActivityType } from '@lawfirm/shared';
import { createClientKeyDateSuggestion, firstFirmOwnerId, uploadedFileBuffer } from './portal-case-helpers';

@Injectable()
export class ClientPortalIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cases: CasesService,
    private readonly documents: DocumentsService,
    private readonly notifier: AssignmentNotifierService,
    private readonly caseFeed: CaseFeedService,
    private readonly fileStorage: FileStorageService,
  ) {}

  // multer/busboy decode multipart field values (including filenames) as
  // latin1 by default, so a UTF-8 filename (e.g. Thai) arrives mojibake'd —
  // re-interpret the raw bytes as UTF-8 to recover the original characters.
  private decodeOriginalFilename(originalname: string): string {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  }

  /**
   * A portal request opens a PRE_LITIGATION case straight away: the firm's first owner leads it,
   * the contact gets access, and uploaded files become case documents. Owners are alerted after commit.
   */
  async submit(portalUser: PortalIdentity, dto: SubmitPortalIntakeDto, files: Express.Multer.File[] = []) {
    const referenceNumber = `REQ-${randomUUID().toUpperCase()}`;

    // Files are stored while the tx is open; if it rolls back, remove them so no blob is orphaned.
    const storedPaths: string[] = [];
    const { submission, legalCase, clientName } = await this.prisma.$transaction(async (tx) => {
      const submission = await tx.portalIntakeSubmission.create({
        data: {
          clientId: portalUser.clientId,
          clientContactId: portalUser.clientContactId,
          referenceNumber,
          title: dto.title,
          detail: dto.detail,
          clientRequestedDate: dto.clientRequestedDate
            ? new Date(dto.clientRequestedDate)
            : undefined,
          urgencyFlag: dto.urgencyFlag ?? false,
        },
      });

      const ownerId = await firstFirmOwnerId(tx, portalUser.firmId);

      const client = await tx.client.findFirst({
        where: { id: portalUser.clientId, firmId: portalUser.firmId },
        select: { name: true },
      });
      if (!client) throw new NotFoundException('ไม่พบลูกความ');

      const legalCase = await this.cases.createForPortal(tx, {
        firmId: portalUser.firmId,
        clientId: portalUser.clientId,
        clientName: client.name,
        title: dto.title,
        description: dto.detail,
        leadLawyerId: ownerId,
      });

      await tx.portalIntakeSubmission.update({
        where: { id: submission.id },
        data: { caseId: legalCase.id },
      });

      await tx.contactCaseAccess.upsert({
        where: { clientContactId_caseId: { clientContactId: portalUser.clientContactId, caseId: legalCase.id } },
        create: { clientContactId: portalUser.clientContactId, caseId: legalCase.id, grantedById: ownerId },
        update: {}, // the case is brand new, so the row can't pre-exist
      });

      // The file is stored once as a case document; the request's attachment row points at the
      // same stored file because the portal request views and download route still read attachments.
      let firstDocumentId: string | null = null;
      for (const file of files) {
        const filename = this.decodeOriginalFilename(file.originalname);
        const document = await this.documents.createFromClientBuffer(tx, {
          firmId: portalUser.firmId,
          caseId: legalCase.id,
          contactId: portalUser.clientContactId,
          actorUserId: ownerId,
          filename,
          buffer: uploadedFileBuffer(file),
          mimeType: file.mimetype,
        });
        storedPaths.push(document.storagePath);
        firstDocumentId ??= document.id;

        await tx.portalIntakeAttachment.create({
          data: {
            portalIntakeSubmissionId: submission.id,
            filename,
            storagePath: document.storagePath,
            mimeType: file.mimetype,
            size: file.size,
          },
        });
      }

      if (dto.keyDate) {
        await createClientKeyDateSuggestion(tx, {
          caseId: legalCase.id,
          documentId: firstDocumentId,
          keyDate: dto.keyDate,
          keyDateLabel: dto.keyDateLabel,
          createdById: ownerId,
        });
      }

      await this.caseFeed.log(
        {
          caseId: legalCase.id,
          userId: ownerId,
          type: ActivityType.NOTE,
          title: 'ลูกความส่งคำขอผ่านพอร์ทัล',
          description: dto.title,
        },
        tx,
      );

      return { submission, legalCase, clientName: client.name };
    }, { timeout: 30000 }) // file uploads to storage run inside the transaction
      .catch(async (error) => {
        await Promise.all(storedPaths.map((p) => this.fileStorage.delete(p).catch(() => undefined)));
        throw error;
      });

    try {
      await this.notifier.notifyFirmOwners({
        firmId: portalUser.firmId,
        actorUserId: '',
        summaryText: `คำขอใหม่จากลูกความ ${clientName}: ${dto.title}`,
        entityPath: `/cases/${legalCase.id}`,
      });
    } catch {
      // alerting owners must never fail the client's request
    }

    return { ...submission, caseId: legalCase.id, caseRef: legalCase.ownRef };
  }

  async listMine(portalUser: PortalIdentity) {
    const submissions = await this.prisma.portalIntakeSubmission.findMany({
      where: portalRequestScope(portalUser),
      include: {
        intake: { select: { id: true, status: true, decision: true } },
        attachments: { select: { id: true, filename: true, size: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const intakeIds = submissions.map((s) => s.intake?.id).filter((id): id is string => Boolean(id));
    const firmDocsByIntake = await this.loadFirmDocumentsByIntake(intakeIds);

    return submissions.map((s) => this.toPortalEntry(s, s.clientContactId === portalUser.clientContactId ? firmDocsByIntake.get(s.intake?.id ?? '') ?? [] : []));
  }

  async getMine(portalUser: PortalIdentity, submissionId: string) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, ...portalRequestScope(portalUser) },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
        attachments: {
          select: { id: true, filename: true, size: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const firmDocuments = submission.intake && submission.clientContactId === portalUser.clientContactId
      ? await this.prisma.document.findMany({
          where: { intakeId: submission.intake.id, visibleToClient: true },
          select: { id: true, filename: true, mimeType: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        })
      : [];

    return {
      ...this.toPortalEntry(submission, firmDocuments),
      detail: submission.detail,
      urgencyFlag: submission.urgencyFlag,
      clientRequestedDate: submission.clientRequestedDate,
    };
  }

  async getAttachmentFile(portalUser: PortalIdentity, submissionId: string, attachmentId: string) {
    const attachment = await this.prisma.portalIntakeAttachment.findFirst({
      where: {
        id: attachmentId,
        portalIntakeSubmissionId: submissionId,
        submission: portalRequestScope(portalUser),
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { path: attachment.storagePath, filename: attachment.filename, mimeType: attachment.mimeType };
  }

  async getFirmDocumentFile(portalUser: PortalIdentity, submissionId: string, documentId: string) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, ...portalRequestScope(portalUser) },
      include: { intake: { select: { id: true } } },
    });
    if (!submission?.intake || submission.clientContactId !== portalUser.clientContactId) throw new NotFoundException('Document not found');

    const document = await this.prisma.document.findFirst({
      where: {
        id: documentId,
        intakeId: submission.intake.id,
        visibleToClient: true,
      },
    });
    if (!document) throw new NotFoundException('Document not found');

    return {
      path: document.storagePath,
      filename: document.filename,
      mimeType: document.mimeType,
    };
  }

  private async loadFirmDocumentsByIntake(intakeIds: string[]) {
    const map = new Map<string, Array<{ id: string; filename: string; mimeType: string; createdAt: Date }>>();
    if (intakeIds.length === 0) return map;

    const docs = await this.prisma.document.findMany({
      where: { intakeId: { in: intakeIds }, visibleToClient: true },
      select: { id: true, filename: true, mimeType: true, createdAt: true, intakeId: true },
      orderBy: { createdAt: 'desc' },
    });
    for (const doc of docs) {
      if (!doc.intakeId) continue;
      const list = map.get(doc.intakeId) ?? [];
      list.push({
        id: doc.id,
        filename: doc.filename,
        mimeType: doc.mimeType,
        createdAt: doc.createdAt,
      });
      map.set(doc.intakeId, list);
    }
    return map;
  }

  private toPortalEntry(
    submission: {
      id: string;
      referenceNumber: string;
      title: string;
      submittedAt: Date;
      withdrawnByClient: boolean;
      caseId: string | null;
      intake: { id: string; status: string; decision: string | null } | null;
      attachments: Array<{ id: string; filename: string; size: number; createdAt?: Date }>;
    },
    firmDocuments: Array<{ id: string; filename: string; mimeType: string; createdAt: Date }>,
  ) {
    return {
      id: submission.id,
      referenceNumber: submission.referenceNumber,
      title: submission.title,
      submittedAt: submission.submittedAt,
      withdrawnByClient: submission.withdrawnByClient,
      caseId: submission.caseId,
      externalStatus: submission.intake
        ? mapInternalStatusToExternal(submission.intake as never)
        : 'ส่งแล้ว',
      attachments: submission.attachments.map((a) => ({
        id: a.id,
        filename: a.filename,
        size: a.size,
        createdAt: a.createdAt,
      })),
      firmDocuments: firmDocuments.map((d) => ({
        id: d.id,
        filename: d.filename,
        mimeType: d.mimeType,
        createdAt: d.createdAt,
      })),
    };
  }
}
