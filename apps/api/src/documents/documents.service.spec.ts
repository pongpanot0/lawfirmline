import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.module';
import { FileStorageService } from '../common/services/file-storage.service';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
  unlinkSync: jest.fn(),
}));

describe('DocumentsService', () => {
  let service: DocumentsService;
  const mockPrisma = {
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      createMany: jest.fn(),
      update: jest.fn(),
    },
    documentVersion: { create: jest.fn() },
    intake: { findFirst: jest.fn() },
    intakeAttachment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const mockFileStorage = {
    put: jest.fn(async (key: string) => `./uploads/${key}`),
    delete: jest.fn(),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  describe('updateVisibility', () => {
    it('throws NotFoundException when the document does not belong to the given case', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(
        service.updateVisibility('case-1', 'doc-1', true),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.document.findFirst).toHaveBeenCalledWith({
        where: { id: 'doc-1', caseId: 'case-1' },
      });
    });

    it('updates visibility when the document belongs to the case', async () => {
      mockPrisma.document.findFirst.mockResolvedValue({ id: 'doc-1', caseId: 'case-1' });
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-1', visibleToClient: true });

      await service.updateVisibility('case-1', 'doc-1', true);

      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-1' },
        data: { visibleToClient: true },
      });
    });
  });

  describe('getFilePath', () => {
    it('throws NotFoundException when the document does not belong to the given case', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);

      await expect(service.getFilePath('case-1', 'doc-1')).rejects.toThrow(NotFoundException);
    });
  });
});

describe('DocumentsService — intake-scoped methods', () => {
  let service: DocumentsService;
  const mockPrisma = {
    document: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    documentVersion: { create: jest.fn() },
    intakeAttachment: { findMany: jest.fn().mockResolvedValue([]) },
    intake: { findFirst: jest.fn() },
  };
  const mockFileStorage = {
    put: jest.fn(async (key: string) => `./uploads/${key}`),
    delete: jest.fn(),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  describe('findByIntake', () => {
    it('queries Document filtered by intakeId', async () => {
      mockPrisma.document.findMany.mockResolvedValue([]);
      await service.findByIntake(user, 'intake-1');
      expect(mockPrisma.document.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { intakeId: 'intake-1' } }),
      );
    });

    it('throws NotFoundException when the intake does not belong to the caller firm', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(null);

      await expect(service.findByIntake(user, 'intake-1')).rejects.toThrow(NotFoundException);
      expect(mockPrisma.intake.findFirst).toHaveBeenCalledWith({
        where: { id: 'intake-1', firmId: 'firm-1' },
      });
      expect(mockPrisma.document.findMany).not.toHaveBeenCalled();
    });
  });

  describe('uploadForIntake', () => {
    it('creates a Document row with intakeId set and caseId omitted', async () => {
      mockPrisma.document.create.mockResolvedValue({ id: 'doc-1', intakeId: 'intake-1' });
      mockPrisma.document.update.mockResolvedValue({ id: 'doc-1', intakeId: 'intake-1' });
      const file = { originalname: 'a.pdf', mimetype: 'application/pdf', buffer: Buffer.from('x') } as any;

      await service.uploadForIntake(user, 'intake-1', file);

      expect(mockPrisma.document.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ intakeId: 'intake-1', caseId: undefined }),
        }),
      );
    });
  });

  describe('getFilePathForIntake', () => {
    it('throws NotFoundException when the document does not belong to that intake', async () => {
      mockPrisma.document.findFirst.mockResolvedValue(null);
      await expect(service.getFilePathForIntake(user, 'intake-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the intake belongs to a different firm', async () => {
      mockPrisma.intake.findFirst.mockResolvedValue(null);

      await expect(service.getFilePathForIntake(user, 'intake-1', 'doc-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.document.findFirst).not.toHaveBeenCalled();
    });
  });
});

describe('DocumentsService.adoptIntakeAttachments', () => {
  let service: DocumentsService;
  const mockPrisma = {
    document: {
      findMany: jest.fn().mockResolvedValue([]),
      createMany: jest.fn(),
    },
    intakeAttachment: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const mockFileStorage = {
    put: jest.fn(async (key: string) => `./uploads/${key}`),
    delete: jest.fn(),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };

  const attachment = {
    id: 'att-1',
    intakeId: 'intake-1',
    filename: 'ใบเสร็จ.pdf',
    storagePath: './uploads/intake/intake-1/att-1.pdf',
    mimeType: 'application/pdf',
    uploadedById: 'user-9',
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.document.findMany.mockResolvedValue([]);
    mockPrisma.intakeAttachment.findMany.mockResolvedValue([]);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('adopts an attachment as a document pointing at the file already on disk', async () => {
    mockPrisma.intakeAttachment.findMany.mockResolvedValue([attachment]);

    await service.adoptIntakeAttachments('intake-1');

    expect(mockPrisma.document.createMany).toHaveBeenCalledWith({
      data: [
        {
          caseId: null,
          intakeId: 'intake-1',
          filename: 'ใบเสร็จ.pdf',
          // Not copied, not moved: the row points where the file already is,
          // so a failure part-way cannot lose it.
          storagePath: './uploads/intake/intake-1/att-1.pdf',
          mimeType: 'application/pdf',
          version: 1,
          uploadedById: 'user-9',
        },
      ],
    });
  });

  it('adopts straight onto the case when the intake is becoming one', async () => {
    mockPrisma.intakeAttachment.findMany.mockResolvedValue([attachment]);

    await service.adoptIntakeAttachments('intake-1', 'case-1');

    expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
      where: { OR: [{ intakeId: 'intake-1' }, { caseId: 'case-1' }] },
      select: { storagePath: true },
    });
    expect(mockPrisma.document.createMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({ caseId: 'case-1', intakeId: null })],
    });
  });

  it('adds nothing the second time, so a retried conversion cannot duplicate a file', async () => {
    mockPrisma.intakeAttachment.findMany.mockResolvedValue([attachment]);
    mockPrisma.document.findMany.mockResolvedValue([
      { storagePath: './uploads/intake/intake-1/att-1.pdf' },
    ]);

    await service.adoptIntakeAttachments('intake-1', 'case-1');

    expect(mockPrisma.document.createMany).not.toHaveBeenCalled();
  });
});

describe('DocumentsService.removeFromIntake', () => {
  let service: DocumentsService;
  const mockPrisma = {
    intake: { findFirst: jest.fn() },
    document: {
      findFirst: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    documentVersion: { findMany: jest.fn(), count: jest.fn() },
    intakeAttachment: { deleteMany: jest.fn() },
  };
  const mockFileStorage = {
    put: jest.fn(async (key: string) => `./uploads/${key}`),
    delete: jest.fn(),
    getBuffer: jest.fn(),
    openDownloadStream: jest.fn(),
  };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
    mockPrisma.document.findFirst.mockResolvedValue({
      id: 'doc-1',
      storagePath: './uploads/intake/intake-1/doc-1_v1.pdf',
    });
    mockPrisma.documentVersion.findMany.mockResolvedValue([]);
    mockPrisma.document.count.mockResolvedValue(0);
    mockPrisma.documentVersion.count.mockResolvedValue(0);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: FileStorageService, useValue: mockFileStorage },
      ],
    }).compile();
    service = module.get(DocumentsService);
  });

  it('also removes the attachment row, so the file is not re-listed on the next load', async () => {
    await service.removeFromIntake(user, 'intake-1', 'doc-1');

    expect(mockPrisma.intakeAttachment.deleteMany).toHaveBeenCalledWith({
      where: {
        intakeId: 'intake-1',
        storagePath: { in: ['./uploads/intake/intake-1/doc-1_v1.pdf'] },
      },
    });
    expect(mockFileStorage.delete).toHaveBeenCalledWith('./uploads/intake/intake-1/doc-1_v1.pdf');
  });

  it('leaves the file alone while another document still points at it', async () => {
    mockPrisma.document.count.mockResolvedValue(1);

    await service.removeFromIntake(user, 'intake-1', 'doc-1');

    expect(mockFileStorage.delete).not.toHaveBeenCalled();
  });

  it('refuses a document that belongs to a different intake', async () => {
    mockPrisma.document.findFirst.mockResolvedValue(null);

    await expect(service.removeFromIntake(user, 'intake-1', 'doc-1')).rejects.toThrow(
      NotFoundException,
    );
    expect(mockPrisma.document.delete).not.toHaveBeenCalled();
  });
});
