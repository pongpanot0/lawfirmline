import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { AuthUser, DEFAULT_THAI_COURTS } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CreateCourtDto, UpdateCourtDto } from './dto/court.dto';
import { Prisma } from '../generated/prisma';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

@Injectable()
export class CourtsService {
  constructor(private prisma: PrismaService) {}

  async provisionDefaults(firmId: string, db: PrismaClientLike = this.prisma) {
    const existing = await db.court.count({ where: { firmId } });
    if (existing > 0) return;

    await db.court.createMany({
      data: DEFAULT_THAI_COURTS.map((name) => ({ firmId, name })),
    });
  }

  async findAll(user: AuthUser, activeOnly = false) {
    await this.provisionDefaults(user.firmId);

    return this.prisma.court.findMany({
      where: {
        firmId: user.firmId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const court = await this.prisma.court.findFirst({
      where: { id, firmId: user.firmId },
    });
    if (!court) throw new NotFoundException('Court not found');
    return court;
  }

  async create(user: AuthUser, dto: CreateCourtDto) {
    const existing = await this.prisma.court.findUnique({
      where: { firmId_name: { firmId: user.firmId, name: dto.name } },
    });
    if (existing) throw new ConflictException('Court name already exists');

    return this.prisma.court.create({
      data: { ...dto, firmId: user.firmId },
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateCourtDto) {
    await this.findOne(user, id);
    return this.prisma.court.update({ where: { id }, data: dto });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.court.update({
      where: { id },
      data: { isActive: false },
    });
    return { deleted: true };
  }
}
