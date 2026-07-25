import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { AuthUser, DEFAULT_CASE_TYPES } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CreateCaseTypeDto, UpdateCaseTypeDto } from './dto/case-type.dto';
import { Prisma } from '../generated/prisma';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CaseTypesService {
  constructor(private prisma: PrismaService) {}

  async provisionDefaults(firmId: string, client: PrismaClientLike = this.prisma) {
    const existing = await client.caseType.count({ where: { firmId } });
    if (existing > 0) return;

    await client.caseType.createMany({
      data: DEFAULT_CASE_TYPES.map((type) => ({
        firmId,
        name: type.name,
        description: type.description,
        fieldSchema: type.fieldSchema as Prisma.InputJsonValue | undefined,
      })),
      skipDuplicates: true,
    });
  }

  async findAll(user: AuthUser, activeOnly = false) {
    await this.provisionDefaults(user.firmId);

    return this.prisma.caseType.findMany({
      where: {
        firmId: user.firmId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
      include: { _count: { select: { cases: true } } },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const caseType = await this.prisma.caseType.findFirst({
      where: { id, firmId: user.firmId },
    });
    if (!caseType) throw new NotFoundException('Case type not found');
    return caseType;
  }

  async create(user: AuthUser, dto: CreateCaseTypeDto) {
    const existing = await this.prisma.caseType.findUnique({
      where: { firmId_name: { firmId: user.firmId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Case type name already exists');
    return this.prisma.caseType.create({
      data: { ...dto, firmId: user.firmId },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCaseTypeDto) {
    await this.findOne(user, id);
    return this.prisma.caseType.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.caseType.update({
      where: { id },
      data: { isActive: false },
    });
    return { deleted: true };
  }
}
