import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.module';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private sanitize(user: {
    id: string;
    email: string;
    passwordHash: string;
    firstName: string;
    lastName: string;
    role: string;
    createdAt: Date;
    updatedAt: Date;
  }) {
    const { passwordHash, ...rest } = user;
    return rest;
  }

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map((u) => this.sanitize(u));
  }

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('User not found');
    return this.sanitize(user);
  }

  async create(dto: CreateUserDto) {
    throw new BadRequestException(
      'Direct user creation is disabled. Invite members by email via POST /saas/invitations.',
    );
  }

  async update(id: string, dto: UpdateUserDto) {
    await this.findOne(id);
    const data: Record<string, unknown> = { ...dto };
    if (dto.password) {
      data.passwordHash = await bcrypt.hash(dto.password, 10);
      delete data.password;
    }
    const user = await this.prisma.user.update({ where: { id }, data });
    return this.sanitize(user);
  }

  async remove(id: string) {
    await this.findOne(id);
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }

  async findLawyers(firmId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'LAWYER'] },
        firmMembers: { some: { firmId } },
      },
      orderBy: { lastName: 'asc' },
    });
    return users.map((u) => this.sanitize(u));
  }

  async findAllByFirm(
    firmId: string,
    offset = 0,
    limit = 13,
  ): Promise<{ items: Array<{ id: string; label: string }>; hasMore: boolean }> {
    const users = await this.prisma.user.findMany({
      where: {
        firmMembers: { some: { firmId } },
      },
      orderBy: { lastName: 'asc' },
      skip: offset,
      take: limit + 1,
    });
    const hasMore = users.length > limit;
    const page = users.slice(0, limit);
    return {
      items: page.map((u) => ({
        id: u.id,
        label: `${u.firstName} ${u.lastName}`,
      })),
      hasMore,
    };
  }
}
