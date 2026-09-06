import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

@Injectable()
export class DocumentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  private getUploadDir() {
    return this.config.get<string>('UPLOAD_DIR') ?? './uploads';
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

  async findByIntake(user: AuthUser, intakeId: string) {
    await this.verifyIntake(user, intakeId);
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
    const uploadDir = path.join(this.getUploadDir(), caseId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const document = await this.prisma.document.create({
      data: {
        caseId,
        filename: file.originalname,
        storagePath: '',
        mimeType: file.mimetype,
        version: 1,
        uploadedById: user.id,
      },
    });

    const ext = path.extname(file.originalname);
    const storagePath = path.join(uploadDir, `${document.id}_v1${ext}`);
    fs.writeFileSync(storagePath, this.getFileBuffer(file));

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storagePath,
        filename: file.originalname,
        mimeType: file.mimetype,
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

    const uploadDir = path.join(this.getUploadDir(), 'intake', intakeId, 'documents');
    fs.mkdirSync(uploadDir, { recursive: true });

    const document = await this.prisma.document.create({
      data: {
        caseId: undefined,
        intakeId,
        filename: file.originalname,
        storagePath: '',
        mimeType: file.mimetype,
        version: 1,
        uploadedById: user.id,
      },
    });

    const ext = path.extname(file.originalname);
    const storagePath = path.join(uploadDir, `${document.id}_v1${ext}`);
    fs.writeFileSync(storagePath, this.getFileBuffer(file));

    const updated = await this.prisma.document.update({
      where: { id: document.id },
      data: { storagePath },
    });

    await this.prisma.documentVersion.create({
      data: {
        documentId: document.id,
        version: 1,
        storagePath,
        filename: file.originalname,
        mimeType: file.mimetype,
      },
    });

    return updated;
  }

  async uploadNewVersion(
    user: AuthUser,
    caseId: string,
    documentId: string,
    file: Express.Multer.File,
  ) {
    const document = await this.verifyDocument(caseId, documentId);

    const newVersion = document.version + 1;
    const uploadDir = path.join(this.getUploadDir(), caseId);
    fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(file.originalname);
    const storagePath = path.join(
      uploadDir,
      `${documentId}_v${newVersion}${ext}`,
    );
    fs.writeFileSync(storagePath, this.getFileBuffer(file));

    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: newVersion,
        storagePath,
        filename: file.originalname,
        mimeType: file.mimetype,
      },
    });

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        version: newVersion,
        filename: file.originalname,
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
    const uploadDir = path.join(this.getUploadDir(), 'intake', intakeId, 'documents');
    fs.mkdirSync(uploadDir, { recursive: true });

    const ext = path.extname(file.originalname);
    const storagePath = path.join(
      uploadDir,
      `${documentId}_v${newVersion}${ext}`,
    );
    fs.writeFileSync(storagePath, this.getFileBuffer(file));

    await this.prisma.documentVersion.create({
      data: {
        documentId,
        version: newVersion,
        storagePath,
        filename: file.originalname,
        mimeType: file.mimetype,
      },
    });

    return this.prisma.document.update({
      where: { id: documentId },
      data: {
        version: newVersion,
        filename: file.originalname,
        storagePath,
        mimeType: file.mimetype,
        uploadedById: user.id,
      },
    });
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
