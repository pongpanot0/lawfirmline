import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.module';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  writeFileSync: jest.fn(),
  readFileSync: jest.fn(),
}));

describe('DocumentsService', () => {
  let service: DocumentsService;
  const mockPrisma = {
    document: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    documentVersion: { create: jest.fn() },
  };
  const mockConfig = { get: jest.fn().mockReturnValue('./uploads') };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
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
    intake: { findFirst: jest.fn() },
  };
  const mockConfig = { get: jest.fn().mockReturnValue('./uploads') };
  const user = { id: 'user-1', firmId: 'firm-1' } as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockPrisma.intake.findFirst.mockResolvedValue({ id: 'intake-1', firmId: 'firm-1' });
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentsService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
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
