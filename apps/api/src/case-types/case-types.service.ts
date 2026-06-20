import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { CreateCaseTypeDto, UpdateCaseTypeDto } from './dto/case-type.dto';

@Injectable()
export class CaseTypesService {
  constructor(private prisma: PrismaService) {}

  findAll(activeOnly = false) {
    return this.prisma.caseType.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { name: 'asc' },
      include: { _count: { select: { cases: true } } },
    });
  }

  async findOne(id: string) {
    const caseType = await this.prisma.caseType.findUnique({ where: { id } });
    if (!caseType) throw new NotFoundException('Case type not found');
    return caseType;
  }

  async create(dto: CreateCaseTypeDto) {
    const existing = await this.prisma.caseType.findUnique({
      where: { name: dto.name },
    });
    if (existing) throw new ConflictException('Case type name already exists');
    return this.prisma.caseType.create({ data: dto });
  }

  async update(id: string, dto: UpdateCaseTypeDto) {
    await this.findOne(id);
    return this.prisma.caseType.update({ where: { id }, data: dto });
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.caseType.update({
      where: { id },
      data: { isActive: false },
    });
    return { deleted: true };
  }
}
