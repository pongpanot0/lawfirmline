import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

export interface SopInput {
  title: string;
  content: string;
  category?: string;
}

@Injectable()
export class SopsService {
  constructor(private prisma: PrismaService) {}

  list(user: AuthUser, q?: string) {
    return this.prisma.sop.findMany({
      where: {
        firmId: user.firmId,
        ...(q
          ? {
              OR: [
                { title: { contains: q, mode: 'insensitive' as const } },
                { content: { contains: q, mode: 'insensitive' as const } },
                { category: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      include: { updatedBy: { select: { firstName: true, lastName: true } } },
      orderBy: [{ category: 'asc' }, { title: 'asc' }],
    });
  }

  async findOne(user: AuthUser, id: string) {
    const sop = await this.prisma.sop.findFirst({
      where: { id, firmId: user.firmId },
      include: { updatedBy: { select: { firstName: true, lastName: true } } },
    });
    if (!sop) throw new NotFoundException('ไม่พบ SOP นี้');
    return sop;
  }

  create(user: AuthUser, dto: SopInput) {
    return this.prisma.sop.create({
      data: { firmId: user.firmId, ...dto, updatedById: user.id },
    });
  }

  async update(user: AuthUser, id: string, dto: Partial<SopInput>) {
    await this.findOne(user, id);
    return this.prisma.sop.update({
      where: { id },
      data: { ...dto, updatedById: user.id },
    });
  }

  async remove(user: AuthUser, id: string) {
    await this.findOne(user, id);
    await this.prisma.sop.delete({ where: { id } });
    return { deleted: true };
  }
}
