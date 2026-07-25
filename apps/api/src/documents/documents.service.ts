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

  async uploadNewVersion(
    user: AuthUser,
    documentId: string,
    file: Express.Multer.File,
  ) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!document) throw new NotFoundException('Document not found');

    const newVersion = document.version + 1;
    const uploadDir = path.join(this.getUploadDir(), document.caseId);
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

  async getFilePath(documentId: string, version?: number) {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
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

  async updateVisibility(documentId: string, visibleToClient: boolean) {
    const document = await this.prisma.document.findUnique({ where: { id: documentId } });
    if (!document) throw new NotFoundException('Document not found');
    return this.prisma.document.update({
      where: { id: documentId },
      data: { visibleToClient },
    });
  }
}
