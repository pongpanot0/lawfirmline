import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole, InvoiceStatus } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { ClientContactDto, CreateClientDto, UpdateClientDto } from './dto/client.dto';
import { CLIENT_CONTACT_SELECT } from './client-contact.select';

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
  ) {}

  private include = {
    contacts: {
      select: CLIENT_CONTACT_SELECT,
      orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }],
    },
    _count: { select: { cases: true } },
  };

  private includeForUser(user: AuthUser) {
    return {
      ...this.include,
      _count: { select: { cases: { where: this.caseAccess.getCaseFilterForUser(user) } } },
    };
  }

  async findAll(user: AuthUser, search?: string) {
    return this.prisma.client.findMany({
      where: {
        ...this.caseAccess.getClientFilterForUser(user),
        ...(search
          ? { name: { contains: search, mode: 'insensitive' as const } }
          : {}),
      },
      include: this.includeForUser(user),
      orderBy: { name: 'asc' },
    });
  }

  async findOne(user: AuthUser, id: string) {
    const client = await this.prisma.client.findFirst({
      where: { id, ...this.caseAccess.getClientFilterForUser(user) },
      include: {
        ...this.includeForUser(user),
        cases: {
          where: this.caseAccess.getCaseFilterForUser(user),
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
        taxId: dto.taxId,
        branch: dto.branch,
        address: dto.address,
        billingEmail: dto.billingEmail,
        billingPhone: dto.billingPhone,
        contacts: {
          create: contacts.map((c, i) => ({
            name: c.name,
            nickname: c.nickname,
            email: c.email,
            phone: c.phone,
            position: c.position,
            notes: c.notes,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          })),
        },
      },
      include: this.include,
    });
  }

  /** Adds one contact without resending the list, so a colleague's concurrent edit can't be overwritten or deleted. */
  async addContact(user: AuthUser, clientId: string, dto: ClientContactDto) {
    await this.findOne(user, clientId);
    const contact = await this.prisma.$transaction(async (tx) => {
      const isFirst = (await tx.clientContact.count({ where: { clientId } })) === 0;
      return tx.clientContact.create({
        data: {
          clientId,
          name: dto.name,
          nickname: dto.nickname,
          email: dto.email,
          phone: dto.phone,
          position: dto.position,
          notes: dto.notes,
          isPrimary: isFirst,
          portalEnabled: dto.portalEnabled ?? false,
        },
        select: CLIENT_CONTACT_SELECT,
      });
    });
    return { client: await this.findOne(user, clientId), contact };
  }

  async update(user: AuthUser, id: string, dto: UpdateClientDto) {
    await this.findOne(user, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.contacts) {
        const existing = await tx.clientContact.findMany({ where: { clientId: id } });
        const incomingIds = new Set(dto.contacts.filter((c) => c.id).map((c) => c.id!));
        const toDelete = existing.filter((c) => !incomingIds.has(c.id)).map((c) => c.id);
        if (toDelete.length) {
          await tx.clientContact.deleteMany({ where: { id: { in: toDelete } } });
        }
        for (const [i, c] of dto.contacts.entries()) {
          const data = {
            name: c.name,
            nickname: c.nickname,
            email: c.email,
            phone: c.phone,
            position: c.position,
            notes: c.notes,
            isPrimary: c.isPrimary ?? i === 0,
            portalEnabled: c.portalEnabled ?? false,
          };
          if (c.id) {
            // Only this client's own contacts: an id from elsewhere must not be rewritten here.
            if (!existing.some((e) => e.id === c.id)) throw new BadRequestException('ผู้ติดต่อนี้ไม่ได้อยู่กับลูกความรายนี้');
            await tx.clientContact.update({ where: { id: c.id }, data });
          } else {
            await tx.clientContact.create({ data: { ...data, clientId: id } });
          }
        }
      }

      return tx.client.update({
        where: { id },
        data: {
          name: dto.name,
          type: dto.type,
          notes: dto.notes,
          taxId: dto.taxId,
          branch: dto.branch,
          address: dto.address,
          billingEmail: dto.billingEmail,
          billingPhone: dto.billingPhone,
        },
        include: this.includeForUser(user),
      });
    });
  }

  /**
   * Hard delete (contacts and portal rows cascade). Refused while a live case or a
   * sent invoice still points at the client: deleted cases and drafts just lose the link.
   */
  async remove(user: AuthUser, id: string) {
    if (user.firmRole !== FirmRole.OWNER) {
      throw new ForbiddenException('Only owners can delete clients');
    }
    const liveCase = { case: { deletedAt: null } };
    const client = await this.prisma.client.findFirst({
      where: { id, firmId: user.firmId },
      select: {
        name: true,
        _count: {
          select: {
            cases: { where: { deletedAt: null } },
            additionalCaseRoles: { where: liveCase },
            caseCustomerRoles: { where: liveCase },
            billedInvoices: {
              where: { status: { not: InvoiceStatus.DRAFT }, OR: [{ caseId: null }, liveCase] },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    const { cases, additionalCaseRoles, caseCustomerRoles, billedInvoices } = client._count;
    if (cases + additionalCaseRoles + caseCustomerRoles > 0) {
      throw new ConflictException('ลูกความนี้ยังมีคดีอยู่ ลบคดีของลูกความนี้ก่อน');
    }
    if (billedInvoices > 0) {
      throw new ConflictException('ลูกความนี้มีใบแจ้งหนี้ที่ส่งแล้ว จึงลบไม่ได้');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.client.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          firmId: user.firmId,
          userId: user.id,
          action: 'CLIENT_DELETED',
          metadata: { clientId: id, name: client.name },
        },
      });
    });
    return { deleted: true };
  }
}
