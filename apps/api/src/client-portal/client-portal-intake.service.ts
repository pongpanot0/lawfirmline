import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';
import { mapInternalStatusToExternal } from '../intake/intake-status-mapping';

@Injectable()
export class ClientPortalIntakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private getUploadDir() {
    return this.config.get<string>('UPLOAD_DIR') ?? './uploads';
  }

  private getFileBuffer(file: Express.Multer.File): Buffer {
    if (file.buffer) return file.buffer;
    if (file.path) return fs.readFileSync(file.path);
    throw new BadRequestException('Uploaded file is empty');
  }

  // multer/busboy decode multipart field values (including filenames) as
  // latin1 by default, so a UTF-8 filename (e.g. Thai) arrives mojibake'd —
  // re-interpret the raw bytes as UTF-8 to recover the original characters.
  private decodeOriginalFilename(originalname: string): string {
    return Buffer.from(originalname, 'latin1').toString('utf8');
  }

  async submit(portalUser: PortalIdentity, dto: SubmitPortalIntakeDto, files: Express.Multer.File[] = []) {
    const count = await this.prisma.portalIntakeSubmission.count();
    const referenceNumber = `REQ-${String(count + 1).padStart(6, '0')}`;

    const submission = await this.prisma.portalIntakeSubmission.create({
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

    if (files.length > 0) {
      const uploadDir = path.join(this.getUploadDir(), 'portal-intake', submission.id);
      fs.mkdirSync(uploadDir, { recursive: true });

      for (const file of files) {
        const filename = this.decodeOriginalFilename(file.originalname);
        const attachment = await this.prisma.portalIntakeAttachment.create({
          data: {
            portalIntakeSubmissionId: submission.id,
            filename,
            storagePath: '',
            mimeType: file.mimetype,
            size: file.size,
          },
        });

        const ext = path.extname(filename);
        const storagePath = path.join(uploadDir, `${attachment.id}${ext}`);
        fs.writeFileSync(storagePath, this.getFileBuffer(file));

        await this.prisma.portalIntakeAttachment.update({
          where: { id: attachment.id },
          data: { storagePath },
        });
      }
    }

    return submission;
  }

  async listMine(portalUser: PortalIdentity) {
    const submissions = await this.prisma.portalIntakeSubmission.findMany({
      where: { clientContactId: portalUser.clientContactId },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
        attachments: { select: { id: true, filename: true, size: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const intakeIds = submissions.map((s) => s.intake?.id).filter((id): id is string => Boolean(id));
    const firmDocsByIntake = await this.loadFirmDocumentsByIntake(intakeIds);

    return submissions.map((s) => this.toPortalEntry(s, firmDocsByIntake.get(s.intake?.id ?? '') ?? []));
  }

  async getMine(portalUser: PortalIdentity, submissionId: string) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, clientContactId: portalUser.clientContactId },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
        attachments: {
          select: { id: true, filename: true, size: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!submission) throw new NotFoundException('Submission not found');

    const firmDocuments = submission.intake
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
        submission: { clientContactId: portalUser.clientContactId },
      },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    return { path: attachment.storagePath, filename: attachment.filename, mimeType: attachment.mimeType };
  }

  async getFirmDocumentFile(portalUser: PortalIdentity, submissionId: string, documentId: string) {
    const submission = await this.prisma.portalIntakeSubmission.findFirst({
      where: { id: submissionId, clientContactId: portalUser.clientContactId },
      include: { intake: { select: { id: true } } },
    });
    if (!submission?.intake) throw new NotFoundException('Document not found');

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
