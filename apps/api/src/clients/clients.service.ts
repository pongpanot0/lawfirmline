import { Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CreateClientDto, UpdateClientDto } from './dto/client.dto';

@Injectable()
export class ClientsService {
  constructor(private prisma: PrismaService) {}

  private include = {
    contacts: { orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }] },
    _count: { select: { cases: true } },
  };

  async findAll(user: AuthUser, search?: string) {
    return this.prisma.client.findMany({
      where: {
        firmId: user.firmId,
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      include: this.include,
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, firmId: user.firmId },
      include: {
        ...this.include,
        cases: {
          select: {
            id: true,
            ownRef: true,
            title: true,
            status: true,
            courtName: true,
          },
          orderBy: { updatedAt: 'desc' },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async create(user: AuthUser, dto: CreateClientDto) {
    const contacts = dto.contacts.length
      ? dto.contacts
      : [{ name: dto.name, isPrimary: true }];

    return this.prisma.client.create({
      data: {
        firmId: user.firmId,
        name: dto.name,
        type: dto.type,
        notes: dto.notes,
        contacts: {
          create: contacts.map((c, i) => ({
            name: c.name,
            email: c.email,
            phone: c.phone,
            position: c.position,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          })),
        },
      },
      include: this.include,
    });
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.contacts) {
        await tx.clientContact.deleteMany({ where: { clientId: id } });
        await tx.clientContact.createMany({
          data: dto.contacts.map((c, i) => ({
            clientId: id,
            name: c.name,
            email: c.email,
            phone: c.phone,
            position: c.position,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          })),
        });
      }

      return tx.client.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          notes: dto.notes,
        },
        include: this.include,
      });
    });
  }
}
