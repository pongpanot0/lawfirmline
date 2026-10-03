import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.module';
import { CreateUserDto, UpdateUserDto } from './dto/user.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  /**
   * Admin routes see only the caller's own firm. A user row is global (one
   * login across firms), so every lookup is bound to a membership in firmId —
   * an id from another firm must look like it does not exist.
   */
  private static readonly ADMIN_VIEW = {
    id: true, email: true, firstName: true, lastName: true, role: true, createdAt: true, updatedAt: true,
  } as const;

  async findAll(firmId: string) {
    return this.prisma.user.findMany({
      where: { firmMembers: { some: { firmId } } },
      select: UsersService.ADMIN_VIEW,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(firmId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, firmMembers: { some: { firmId } } },
      select: UsersService.ADMIN_VIEW,
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async create(_dto: CreateUserDto) {
    throw new BadRequestException(
      'Direct user creation is disabled. Invite members by email via POST /saas/invitations.',
    );
  }

  /** Names only: email, password and system role belong to the person (or the reset flow), not to one firm's owner. */
  async update(firmId: string, id: string, dto: UpdateUserDto) {
    await this.findOne(firmId, id);
    return this.prisma.user.update({ where: { id }, data: dto, select: UsersService.ADMIN_VIEW });
  }

  async remove() {
    // Deleting the global user would erase them from every firm they belong to.
    throw new BadRequestException('Remove members from your firm via DELETE /saas/members/:userId.');
  }

  async findLawyers(firmId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        role: { in: ['ADMIN', 'LAWYER'] },
        firmMembers: { some: { firmId } },
      },
      // Explicit fields: a whole user row carries the LINE link code, which
      // would let any colleague bind their own LINE to this account.
      select: { ...UsersService.ADMIN_VIEW, firmMembers: { where: { firmId }, select: { role: true } } },
      orderBy: { lastName: 'asc' },
    });
    return users.map(({ firmMembers, ...rest }) => ({ ...rest, firmRole: firmMembers[0]?.role ?? null }));
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
      select: { id: true, firstName: true, lastName: true },
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

  /** Names only, including assistants; court companions belong to the active firm. */
  async findMembers(firmId: string) {
    return this.prisma.user.findMany({
      where: { firmMembers: { some: { firmId } } },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });
  }

  /**
   * Delivery is chosen from the LINE link, so the preference is only whether to
   * receive the digest at all.
   */
  async getPreferences(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dailyDigestEnabled: true, lineUserId: true, email: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return {
      dailyDigestEnabled: user.dailyDigestEnabled,
      digestChannel: user.lineUserId ? 'line' : 'email',
      digestEmail: user.email,
    };
  }

  async updatePreferences(userId: string, dto: { dailyDigestEnabled?: boolean }) {
    await this.prisma.user.update({ where: { id: userId }, data: { ...dto } });
    return this.getPreferences(userId);
  }

}
