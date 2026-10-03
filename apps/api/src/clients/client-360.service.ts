import { taskAppRoute } from '../notifications/app-route';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { NotificationCategory, Prisma } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { CLIENT_CONTACT_SELECT } from './client-contact.select';
import { LogClientContactDto } from './dto/contact-log.dto';

function bangkokToday() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function bangkokEndOfDay(date: string) {
  const value = new Date(`${date}T16:59:59.000Z`);
  if (Number.isNaN(value.getTime()) || value.toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('วันที่ติดตามไม่ถูกต้อง');
  }
  return value;
}

@Injectable()
export class Client360Service {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    private assignmentNotifier: AssignmentNotifierService,
  ) {}

  private relatedCases(user: AuthUser, clientId: string): Prisma.CaseWhereInput {
    return {
      AND: [
        this.caseAccess.getCaseFilterForUser(user),
        { OR: [
          { clientId },
          { additionalClients: { some: { clientId } } },
          { customers: { some: { customerId: clientId } } },
        ] },
      ],
    };
  }

  private async visibleClient(user: AuthUser, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, ...this.caseAccess.getClientFilterForUser(user) },
      select: {
        id: true, name: true, type: true,
        contacts: {
          select: CLIENT_CONTACT_SELECT,
          orderBy: [{ isPrimary: 'desc' as const }, { name: 'asc' as const }],
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async overview(user: AuthUser, clientId: string) {
    const client = await this.visibleClient(user, clientId);
    const cases = await this.prisma.case.findMany({
      where: this.relatedCases(user, clientId),
      select: {
        id: true, ownRef: true, customerRef: true, title: true, status: true,
        stage: true, outcome: true, openedAt: true, closedAt: true, closingSummary: true,
        blackCaseNumber: true, redCaseNumber: true, clientId: true,
        leadLawyer: { select: { id: true, firstName: true, lastName: true } },
        additionalClients: { where: { clientId }, select: { id: true } },
        customers: { where: { customerId: clientId }, select: { id: true } },
        insuranceClaim: { select: { policyNumber: true } },
        intake: { select: { policyNumber: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
    const caseIds = cases.map((item) => item.id);
    const [tasks, activities, members, latestReport] = await Promise.all([
      caseIds.length ? this.prisma.task.findMany({
        where: {
          AND: [
            { caseId: { in: caseIds }, parentId: null, status: { not: 'DONE' } },
            { OR: [this.caseAccess.getTaskFilterForUser(user), { createdById: user.id }] },
          ],
        },
        select: {
          id: true, caseId: true, title: true, description: true, status: true, dueDate: true,
          assignee: { select: { id: true, firstName: true, lastName: true } },
        },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }],
        take: 30,
      }) : [],
      caseIds.length ? this.prisma.caseActivity.findMany({
        where: { caseId: { in: caseIds } },
        select: {
          id: true, caseId: true, title: true, description: true, activityAt: true,
          type: true, contactData: true,
          createdBy: { select: { firstName: true, lastName: true } },
        },
        orderBy: { activityAt: 'desc' },
        take: 30,
      }) : [],
      this.prisma.firmMember.findMany({
        where: { firmId: user.firmId, role: { in: ['OWNER', 'SENIOR_LAWYER', 'LAWYER'] } },
        select: { userId: true, role: true, user: { select: { firstName: true, lastName: true } } },
        orderBy: { user: { lastName: 'asc' } },
      }),
      user.firmRole === FirmRole.OWNER
        ? this.prisma.clientAnnualReport.findFirst({
          where: { firmId: user.firmId, clientId, revokedAt: null },
          select: { id: true, year: true, audience: true, publishedAt: true },
          orderBy: { publishedAt: 'desc' },
        })
        : null,
    ]);

    return {
      client,
      cases: cases.map((item) => ({
        id: item.id, ownRef: item.ownRef, customerRef: item.customerRef,
        title: item.title, status: item.status, stage: item.stage, outcome: item.outcome,
        openedAt: item.openedAt, closedAt: item.closedAt, closingSummary: item.closingSummary,
        blackCaseNumber: item.blackCaseNumber, redCaseNumber: item.redCaseNumber,
        policyRef: item.insuranceClaim?.policyNumber ?? item.intake?.policyNumber ?? null,
        leadLawyer: item.leadLawyer,
        roles: [
          ...((item.clientId === clientId || item.additionalClients.length) ? ['REPRESENTED'] : []),
          ...(item.customers.length ? ['PAYER'] : []),
        ],
      })),
      tasks,
      activities,
      lawyers: members.map((member) => ({
        id: member.userId, firstName: member.user.firstName,
        lastName: member.user.lastName, role: member.role,
      })),
      latestReport,
    };
  }

  async logContact(user: AuthUser, clientId: string, dto: LogClientContactDto) {
    await this.visibleClient(user, clientId);
    const [legalCase, contact, recipient] = await Promise.all([
      this.prisma.case.findFirst({
        where: { id: dto.caseId, ...this.relatedCases(user, clientId) },
        select: { id: true, ownRef: true },
      }),
      this.prisma.clientContact.findFirst({
        where: { id: dto.contactId, clientId },
        select: { id: true, name: true, phone: true, email: true },
      }),
      this.prisma.firmMember.findFirst({
        where: {
          firmId: user.firmId, userId: dto.recipientUserId,
          role: { in: ['OWNER', 'SENIOR_LAWYER', 'LAWYER'] },
        },
        select: { userId: true, user: { select: { firstName: true, lastName: true } } },
      }),
    ]);
    if (!legalCase || !contact || !recipient) throw new NotFoundException('Case, contact or lawyer not found');
    const note = dto.note?.trim();
    if (!note) throw new BadRequestException('ระบุผลการคุยหรือข้อความที่ฝากไว้');
    if (!dto.reached && (dto.followupTitle || dto.followupDueDate)) {
      throw new BadRequestException('สายที่ยังไม่ได้คุยจะสร้างงานโทรกลับให้อัตโนมัติ');
    }
    if (dto.reached && Boolean(dto.followupTitle) !== Boolean(dto.followupDueDate)) {
      throw new BadRequestException('ระบุทั้งชื่องานและวันติดตาม');
    }
    const lawyerName = `${recipient.user.firstName} ${recipient.user.lastName}`.trim();
    const callback = !dto.reached;
    const taskTitle = callback
      ? `${dto.channel === 'INBOUND_CALL' ? 'โทรกลับ' : 'ติดต่อกลับ'} ${contact.name}`
      : dto.followupTitle?.trim();
    const dueDate = callback ? bangkokEndOfDay(bangkokToday())
      : dto.followupDueDate ? bangkokEndOfDay(dto.followupDueDate) : null;
    const taskDescription = `ลูกค้า: ${contact.name}\nเบอร์โทร: ${contact.phone || 'ไม่ระบุ'}\nอีเมล: ${contact.email || 'ไม่ระบุ'}\nCase: ${legalCase.ownRef}\nข้อความ: ${note}`;

    const result = await this.prisma.$transaction(async (tx) => {
      const task = taskTitle && dueDate ? await tx.task.create({
        data: {
          firmId: user.firmId, caseId: legalCase.id, title: taskTitle,
          description: taskDescription, assigneeId: recipient.userId,
          createdById: user.id, dueDate, source: 'WEB', status: 'TODO',
          assignedAt: recipient.userId === user.id ? undefined : new Date(),
          acknowledgedAt: recipient.userId === user.id ? new Date() : undefined,
        },
        select: { id: true },
      }) : null;
      if (task) {
        await tx.taskAssignmentLog.create({
          data: {
            taskId: task.id, action: 'ASSIGNED', toUserId: recipient.userId,
            performedById: user.id, stageDueDate: dueDate!,
          },
        });
      }
      const activity = await tx.caseActivity.create({
        data: {
          caseId: legalCase.id, createdById: user.id, type: 'NOTE',
          title: dto.reached
            ? `${contact.name} ได้คุยกับ ${lawyerName}`
            : `${contact.name} ติดต่อหา ${lawyerName} แต่ยังไม่ได้คุย`,
          description: note,
          contactData: {
            clientId, contactId: contact.id, contactName: contact.name,
            contactPhone: contact.phone, channel: dto.channel,
            recipientUserId: recipient.userId, recipientName: lawyerName,
            reached: dto.reached, taskId: task?.id ?? null,
          },
        },
        select: { id: true },
      });
      return { activityId: activity.id, taskId: task?.id ?? null };
    });

    if (result.taskId && recipient.userId !== user.id) {
      await this.assignmentNotifier.notifyAssigned({
        category: NotificationCategory.TASK,
        firmId: user.firmId, userIds: [recipient.userId], actorUserId: user.id,
        summaryText: `${taskTitle} · ${legalCase.ownRef}`,
        entityPath: `/cases/${legalCase.id}`, appPath: taskAppRoute(result.taskId),
      });
    }
    return result;
  }
}
