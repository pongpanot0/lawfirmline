import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentsService } from './documents.service';
import { PrismaService } from '../prisma/prisma.module';

describe('DocumentsService', () => {
  let service: DocumentsService;
  const mockPrisma = {
    document: { findUnique: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
    documentVersion: { create: jest.fn() },
  };
  const mockConfig = { get: jest.fn() };

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
