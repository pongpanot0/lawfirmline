import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { decodeUploadFilename } from '../common/utils/decode-upload-filename';
import * as fs from 'fs';
import * as path from 'path';
import { ActivityType, AuthUser, DocumentCategory } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';
import { CaseAccessService } from '../common/services/case-access.service';
import { CaseFeedService } from '../common/services/case-feed.service';
import { DocumentMetadataDto, DocumentQueryDto } from './dto/document-metadata.dto';
import { Prisma } from '../generated/prisma';
import { DocumentPublicationService } from './document-publication.service';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private fileStorage: FileStorageService,
    private caseFeed: CaseFeedService,
    private caseAccess: CaseAccessService,
    private publications: DocumentPublicationService,
  ) {}

  /** ค้นเอกสารข้ามทุกคดีที่ user เข้าถึงได้ — ชื่อไฟล์ / หมวด / tag */
  async search(user: AuthUser, q?: string, category?: string) {
    return this.prisma.document.findMany({
      where: {
        case: this.caseAccess.getCaseFilterForUser(user),
        ...(category ? { category: category as never } : {}),
        ...(q
          ? {
              OR: [
                { filename: { contains: q, mode: 'insensitive' as const } },
                { tags: { has: q } },
              ],
            }
          : {}),
      },
      include: {
        case: { select: { id: true, title: true, ownRef: true } },
        uploadedBy: { select: { firstName: true, lastName: true } },
        uploadedByContact: { select: { name: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
  }

  /** Audit trail for document actions — a law firm must answer "ใครดาวน์โหลด/แก้เอกสารนี้". */
  private async audit(
    user: AuthUser,
    action: 'DOCUMENT_UPLOADED' | 'DOCUMENT_VERSION_UPLOADED' | 'DOCUMENT_DOWNLOADED' | 'DOCUMENT_VISIBILITY_CHANGED',
    metadata: Record<string, unknown>,
  ) {
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action, metadata: metadata as any },
    });
  }

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

  async findByCase(caseId: string, query: DocumentQueryDto = {}) {
    const where: Prisma.DocumentWhereInput = { caseId };
    if (query.category) where.category = query.category as never;
    if (query.tag) where.tags = { has: query.tag };
    if (query.search) {
      where.filename = { contains: query.search.trim(), mode: 'insensitive' };
    }

    return this.prisma.document.findMany({
      where,
      include: {
        uploadedBy: {
          select: { id: true, firstName: true, lastName: true },
        },
        uploadedByContact: { select: { name: true } },
        versions: { orderBy: { version: 'desc' } },
      },
      // เอกสารศาลเรียงด้วยวันที่บนหน้าเอกสาร ถ้ามี — ไม่ใช่วันที่อัปโหลด
      orderBy: [{ documentDate: 'desc' }, { createdAt: 'desc' }],
    });
  }

  /** ชุดหมวดที่คดีนี้มีจริง พร้อมจำนวน — ใช้ทำแถบกรองที่ไม่โชว์หมวดว่าง */
  async categoryCounts(caseId: string) {
    const rows = await this.prisma.document.groupBy({
      by: ['category'],
      where: { caseId },
      _count: { _all: true },
    });
    return rows.map((row) => ({ category: row.category, count: row._count._all }));
  }

  /** แก้หมวด/วันที่/tag ของเอกสารที่อัปโหลดไปแล้ว */
  async updateMetadata(
    user: AuthUser,
    caseId: string,
    documentId: string,
    dto: DocumentMetadataDto,
  ) {
    await this.verifyDocument(caseId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        category: dto.category as never,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        tags: dto.tags,
      },
    });
  }

  async updateMetadataForIntake(
    user: AuthUser,
    intakeId: string,
    documentId: string,
    dto: DocumentMetadataDto,
  ) {
    await this.getFilePathForIntake(user, intakeId, documentId);
    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        category: dto.category as never,
        documentDate: dto.documentDate ? new Date(dto.documentDate) : undefined,
        tags: dto.tags,
      },
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
        uploadedByContact: { select: { name: true } },
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
    meta: DocumentMetadataDto = {},
  ) {
    return this.createFromBuffer(user, caseId, {
      filename: decodeUploadFilename(file.originalname),
      buffer: this.getFileBuffer(file),
      mimeType: file.mimetype,
      category: meta.category as DocumentCategory | undefined,
      documentDate: meta.documentDate,
      tags: meta.tags,
    });
  }

  /** Shared upload path: create → audit → store → version → case feed. Used by `upload` and generated documents (e.g. templates). */
  async createFromBuffer(
    user: AuthUser,
    caseId: string,
    args: {
      filename: string;
      buffer: Buffer;
      mimeType: string;
      category?: DocumentCategory;
      documentDate?: string;
      tags?: string[];
    },
  ) {
    const document = await this.prisma.document.create({
      data: {
        caseId,
        filename: args.filename,
        storagePath: '',
        mimeType: args.mimeType,
        version: 1,
        category: (args.category ?? DocumentCategory.OTHER) as never,
        documentDate: args.documentDate ? new Date(args.documentDate) : undefined,
        tags: args.tags ?? [],
        uploadedById: user.id,
      },
    });

    await this.audit(user, 'DOCUMENT_UPLOADED', { caseId, documentId: document.id, filename: document.filename });

    const ext = path.extname(args.filename);
    const key = path.posix.join('cases', caseId, `${document.id}_v1${ext}`);
    const storagePath = await this.fileStorage.put(key, args.buffer, args.mimeType);

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storagePath,
        filename: args.filename,
        mimeType: args.mimeType,
        createdById: user.id,
      },
    });

    await this.caseFeed.log({
      caseId,
      userId: user.id,
      type: ActivityType.DOCUMENT,
      title: `อัปโหลดเอกสาร: ${updated.filename}`,
      description: updated.category !== 'OTHER' ? `หมวด: ${updated.category}` : undefined,
    });

    return updated;
  }

  /**
   * Same path as `createFromBuffer` for a file sent by a client contact through the portal:
   * no staff uploader, so the audit row has no userId and the feed entry is written under
   * `actorUserId` (CaseActivity needs a user). Runs on `tx` so it commits with the new case.
   */
  async createFromClientBuffer(
    tx: Prisma.TransactionClient,
    args: {
      firmId: string;
      caseId: string;
      contactId: string;
      actorUserId: string;
      filename: string;
      buffer: Buffer;
      mimeType: string;
      category?: DocumentCategory;
      description?: string;
    },
  ) {
    const { caseId } = args;
    const document = await tx.document.create({
      data: {
        caseId,
        filename: args.filename,
        storagePath: '',
        mimeType: args.mimeType,
        version: 1,
        category: (args.category ?? DocumentCategory.OTHER) as never,
        uploadedById: null,
        uploadedByContactId: args.contactId,
      },
    });

    await tx.auditLog.create({
      data: {
        firmId: args.firmId,
        userId: null,
        action: 'DOCUMENT_UPLOADED',
        metadata: { caseId, documentId: document.id, filename: document.filename, contactId: args.contactId },
      },
    });

    const ext = path.extname(args.filename);
    const key = path.posix.join('cases', caseId, `${document.id}_v1${ext}`);
    const storagePath = await this.fileStorage.put(key, args.buffer, args.mimeType);

    try {
      const updated = await tx.document.update({
        where: { id: document.id },
        data: { storagePath },
      });

      await tx.documentVersion.create({
        data: {
          documentId: document.id,
          version: 1,
          storagePath,
          filename: args.filename,
          mimeType: args.mimeType,
          createdById: null,
        },
      });

      await this.caseFeed.log(
        {
          caseId,
          userId: args.actorUserId,
          type: ActivityType.DOCUMENT,
          title: `ลูกความส่งเอกสาร: ${updated.filename}`,
          description: args.description,
        },
        tx,
      );

      return updated;
    } catch (error) {
      // the rows roll back with the tx; the stored file would not
      await this.fileStorage.delete(storagePath).catch(() => undefined);
      throw error;
    }
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

    await this.audit(user, 'DOCUMENT_VERSION_UPLOADED', { caseId, documentId, version: newVersion });

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

  async getFilePath(user: AuthUser, caseId: string, documentId: string, version?: number) {
    const document = await this.prisma.document.findFirst({
      where: { id: documentId, caseId },
      include: { versions: true },
    });
    if (!document) throw new NotFoundException('Document not found');

    await this.audit(user, 'DOCUMENT_DOWNLOADED', {
      caseId,
      documentId,
      version: version ?? document.version,
      filename: document.filename,
    });

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

  /** เทียบเอกสารที่มีกับ requiredDocuments ของประเภทคดี → รายการที่ยังขาด */
  async getRequiredDocuments(caseId: string) {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: {
        caseType: { select: { requiredDocuments: true } },
        documents: { select: { category: true } },
        confirmedDocuments: true,
      },
    });
    if (!legalCase) throw new NotFoundException('Case not found');

    // requiredDocuments เก็บได้ทั้งค่า DocumentCategory (เทียบกับเอกสารที่อัปโหลด
    // จริงได้) และข้อความอิสระที่สำนักงานพิมพ์เอง (เทียบอัตโนมัติไม่ได้ — ต้องให้
    // ทีมติ๊กเองว่า "มีแล้ว" ผ่าน confirmedDocuments)
    const required = ((legalCase.caseType?.requiredDocuments as string[] | null) ?? []).filter(
      (item): item is string => typeof item === 'string' && item.trim().length > 0,
    );
    const uploaded = new Set<string>(legalCase.documents.map((doc) => doc.category));
    const confirmed = new Set<string>(legalCase.confirmedDocuments);
    const present = (category: string) => uploaded.has(category) || confirmed.has(category);
    return {
      required: required.map((category) => ({ category, present: present(category) })),
      missing: required.filter((category) => !present(category)),
    };
  }

  /** ติ๊ก/ยกเลิกติ๊กเอกสารที่ต้องมีด้วยมือ — ใช้กับเอกสารข้อความอิสระที่เทียบอัตโนมัติไม่ได้ */
  async setDocumentConfirmed(caseId: string, category: string, confirmed: boolean) {
    const legalCase = await this.prisma.case.findUnique({
      where: { id: caseId },
      select: { confirmedDocuments: true },
    });
    if (!legalCase) throw new NotFoundException('Case not found');
    const next = confirmed
      ? Array.from(new Set([...legalCase.confirmedDocuments, category]))
      : legalCase.confirmedDocuments.filter((c) => c !== category);
    await this.prisma.case.update({ where: { id: caseId }, data: { confirmedDocuments: next } });
    return this.getRequiredDocuments(caseId);
  }

  async updateVisibility(user: AuthUser, caseId: string, documentId: string, visibleToClient: boolean) {
    await this.verifyDocument(caseId, documentId);
    // The portal only shows published documents, so the eye toggle publishes the latest
    // version to every contact (or closes the open publication) and mirrors the flag.
    if (visibleToClient) await this.publications.publish(user, caseId, documentId, {});
    else await this.publications.unpublishOpen(user, caseId, documentId);
    await this.audit(user, 'DOCUMENT_VISIBILITY_CHANGED', { caseId, documentId, visibleToClient });
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
