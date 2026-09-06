import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { PortalIdentity } from './client-portal-jwt.strategy';
import { SubmitPortalIntakeDto } from './dto/portal-intake.dto';

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
    return this.prisma.portalIntakeSubmission.findMany({
      where: { clientContactId: portalUser.clientContactId },
      include: {
        intake: { select: { id: true, status: true, decision: true } },
        attachments: { select: { id: true, filename: true, size: true } },
      },
      orderBy: { submittedAt: 'desc' },
    });
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
}
