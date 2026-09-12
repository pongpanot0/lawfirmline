import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import * as fs from 'fs';
import * as path from 'path';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private fileStorage: FileStorageService,
  ) {}

  private async verifyDocument(caseId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private async verifyIntake(user: AuthUser, intakeId: string) {
    const intake = await this.prisma.intake.findFirst({
      where: { id: intakeId, firmId: user.firmId },
    });
    if (!intake) throw new NotFoundException('Intake not found');
    return intake;
  }

  async findByCase(caseId: string) {
    return this.prisma.document.findMany({
      where: { caseId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        versions: { orderBy: { version: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Give every legacy intake attachment a `Document` row.
   *
   * The intake page grew two file stores: `IntakeAttachment`, which only the AI
   * analyser could read, and `Document`, the repository that follows the case.
   * A lawyer had to upload the same PDF twice for it to be both analysed and
   * kept. `Document` is the store the page writes to now, and this adopts what
   * the other store already holds so one list covers both.
   *
   * The new row points at the file already on disk — nothing is copied, moved
   * or deleted, so a failure part-way cannot lose a file. It is safe to call
   * repeatedly: a storage path some document already claims is skipped.
   *
   * @param caseId when the intake is becoming a case, adopt straight onto it.
   */
  async adoptIntakeAttachments(intakeId: string, caseId?: string) {
    const [attachments, claimed] = await Promise.all([
      this.prisma.intakeAttachment.findMany({ where: { intakeId } }),
      this.prisma.document.findMany({
        where: caseId ? { OR: [{ intakeId }, { caseId }] } : { intakeId },
        select: { storagePath: true },
      }),
    ]);

    const claimedPaths = new Set(claimed.map((document) => document.storagePath));
    const unclaimed = attachments.filter(
      (attachment) => !claimedPaths.has(attachment.storagePath),
    );
    if (unclaimed.length === 0) return;

    await this.prisma.document.createMany({
      data: unclaimed.map((attachment) => ({
        caseId: caseId ?? null,
        intakeId: caseId ? null : intakeId,
        filename: attachment.filename,
        storagePath: attachment.storagePath,
        mimeType: attachment.mimeType,
        version: 1,
        uploadedById: attachment.uploadedById,
      })),
    });
  }

  async findByIntake(user: AuthUser, intakeId: string) {
    await this.verifyIntake(user, intakeId);
    await this.adoptIntakeAttachments(intakeId);
    return this.prisma.document.findMany({
      where: { intakeId },
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        versions: { orderBy: { version: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async verifyIntakeDocument(intakeId: string, documentId: string) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, intakeId },
    });
    if (!document) throw new NotFoundException('Document not found');
    return document;
  }

  private getFileBuffer(file: Express.Multer.File): Buffer {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (file.buffer) return file.buffer;
    if (file.path) return fs.readFileSync(file.path);
    throw new BadRequestException('Uploaded file is empty');
  }

  async upload(
    user: AuthUser,
    caseId: string,
    file: Express.Multer.File,
  ) {
    const document = await this.prisma.document.create({
      data: {
        caseId,
        filename: decodeUploadFilename(file.originalname),
        storagePath: '',
        mimeType: file.mimetype,
        version: 1,
        uploadedById: user.id,
      },
    });

    const ext = path.extname(decodeUploadFilename(file.originalname));
    const key = path.posix.join('cases', caseId, `${document.id}_v1${ext}`);
    const storagePath = await this.fileStorage.put(key, this.getFileBuffer(file), file.mimetype);

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storagePath,
        filename: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
        createdById: user.id,
      },
    });

    return updated;
  }

  async uploadForIntake(
    user: AuthUser,
    intakeId: string,
    file: Express.Multer.File,
  ) {
    await this.verifyIntake(user, intakeId);

    const document = await this.prisma.document.create({
      data: {
        caseId: undefined,
        intakeId,
        filename: decodeUploadFilename(file.originalname),
        storagePath: '',
        mimeType: file.mimetype,
        version: 1,
        uploadedById: user.id,
      },
    });

    const ext = path.extname(decodeUploadFilename(file.originalname));
    const key = path.posix.join('intake', intakeId, 'documents', `${document.id}_v1${ext}`);
    const storagePath = await this.fileStorage.put(key, this.getFileBuffer(file), file.mimetype);

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storagePath,
        filename: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
        createdById: user.id,
      },
    });

    return updated;
  }

  async uploadNewVersion(
    user: AuthUser,
    caseId: string,
    documentId: string,
    file: Express.Multer.File,
    notes?: string,
  ) {
    const document = await this.verifyDocument(caseId, documentId);

    const newVersion = document.version + 1;
    const ext = path.extname(decodeUploadFilename(file.originalname));
    const key = path.posix.join('cases', caseId, `${documentId}_v${newVersion}${ext}`);
    const storagePath = await this.fileStorage.put(key, this.getFileBuffer(file), file.mimetype);

    // A fresh version was uploaded — any earlier version's approval no
    // longer applies to what's on disk now.
    await this.prisma.documentVersion.updateMany({
      where: { documentId, status: 'APPROVED' as any },
      data: { status: 'SUPERSEDED' as any },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: newVersion,
        storagePath,
        filename: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
        createdById: user.id,
        notes,
      },
    });

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        version: newVersion,
        filename: decodeUploadFilename(file.originalname),
        storagePath,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
    });
  }

  async uploadNewVersionForIntake(
    user: AuthUser,
    intakeId: string,
    documentId: string,
    file: Express.Multer.File,
  ) {
    await this.verifyIntake(user, intakeId);
    const document = await this.verifyIntakeDocument(intakeId, documentId);

    const newVersion = document.version + 1;
    const ext = path.extname(decodeUploadFilename(file.originalname));
    const key = path.posix.join(
      'intake',
      intakeId,
      'documents',
      `${documentId}_v${newVersion}${ext}`,
    );
    const storagePath = await this.fileStorage.put(key, this.getFileBuffer(file), file.mimetype);

    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: newVersion,
        storagePath,
        filename: decodeUploadFilename(file.originalname),
        mimeType: file.mimetype,
      },
    });

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        version: newVersion,
        filename: decodeUploadFilename(file.originalname),
        storagePath,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
    });
  }

  /**
   * Remove a file from an intake.
   *
   * A wrongly uploaded scan — the wrong client's ID card, say — has to be
   * removable, and was while the page wrote to the attachment store. Deleting
   * the document alone is not enough: the attachment row it was adopted from
   * would put the file straight back on the next listing, so that row goes too.
   *
   * The file on disk is only unlinked once no other document or version points
   * at it, and a failure to unlink does not fail the request: an orphaned file
   * is recoverable, a row deleted with the file still listed is not.
   */
  async removeFromIntake(user: AuthUser, intakeId: string, documentId: string) {
    await this.verifyIntake(user, intakeId);
    const document = await this.verifyIntakeDocument(intakeId, documentId);

    const versions = await this.prisma.documentVersion.findMany({
      where: { documentId },
      select: { storagePath: true },
    });
    const paths = [...new Set([document.storagePath, ...versions.map((v) => v.storagePath)])];

    await this.prisma.document.delete({ where: { id: documentId } });
    await this.prisma.intakeAttachment.deleteMany({
      where: { intakeId, storagePath: { in: paths } },
    });

    for (const storagePath of paths) {
      const [stillDocumented, stillVersioned] = await Promise.all([
        this.prisma.document.count({ where: { storagePath } }),
        this.prisma.documentVersion.count({ where: { storagePath } }),
      ]);
      if (stillDocumented > 0 || stillVersioned > 0) continue;
      await this.fileStorage.delete(storagePath);
    }

    return { deleted: true };
  }

  async getFilePath(caseId: string, documentId: string, version?: number) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId },
      include: { versions: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (version) {
      const v = document.versions.find((ver) => ver.version === version);
      if (!v) throw new NotFoundException('Version not found');
      return { path: v.storagePath, filename: v.filename, mimeType: v.mimeType };
    }

    return {
      path: document.storagePath,
      filename: document.filename,
      mimeType: document.mimeType,
    };
  }

  async updateVisibility(caseId: string, documentId: string, visibleToClient: boolean) {
    await this.verifyDocument(caseId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: { visibleToClient },
    });
  }

  async getFilePathForIntake(user: AuthUser, intakeId: string, documentId: string, version?: number) {
    await this.verifyIntake(user, intakeId);
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, intakeId },
      include: { versions: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    if (version) {
      const v = document.versions.find((ver) => ver.version === version);
      if (!v) throw new NotFoundException('Version not found');
      return { path: v.storagePath, filename: v.filename, mimeType: v.mimeType };
    }

    return {
      path: document.storagePath,
      filename: document.filename,
      mimeType: document.mimeType,
    };
  }

  async updateVisibilityForIntake(user: AuthUser, intakeId: string, documentId: string, visibleToClient: boolean) {
    await this.verifyIntake(user, intakeId);
    await this.verifyIntakeDocument(intakeId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: { visibleToClient },
    });
  }
}
