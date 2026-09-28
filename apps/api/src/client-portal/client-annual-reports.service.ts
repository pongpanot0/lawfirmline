import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { AuthUser } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { Prisma } from '../generated/prisma';
import { PortalIdentity } from './client-portal-jwt.strategy';

export type ReportAudience = 'REPRESENTED' | 'PAYER';

export interface AnnualReportSnapshot {
  clientName: string;
  year: number;
  audience: ReportAudience;
  cases: Array<{
    id: string;
    ownRef: string;
    customerRef: string | null;
    policyRef: string | null;
    policyRelevant: boolean;
    blackCaseNumber: string | null;
    redCaseNumber: string | null;
    title: string;
    clientName: string | null;
    caseType: string | null;
    openedAt: string;
    stageAtPublication: string;
    statusAtYearEnd: string;
    closedAt: string | null;
    outcome: string | null;
    closingSummary: string | null;
    leadLawyer: string;
    claimedAmount: number | null;
  }>;
  totals: {
    cases: number;
    opened: number;
    closedInYear: number;
    closedAtYearEnd: number;
    ongoing: number;
    claimedAmount: number;
    claimedCaseCount: number;
    invoicedAmount: number;
    receivedAmount: number;
    unassignedInvoiceCount: number;
  };
}

const closed = (status: string) => status === 'CLOSED' || status === 'ARCHIVED';

function yearBounds(year: number) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    throw new BadRequestException('Invalid report year');
  }
  // Bangkok midnight, expressed as UTC. The annual boundary is always UTC+7.
  return {
    start: new Date(Date.UTC(year - 1, 11, 31, 17)),
    end: new Date(Date.UTC(year, 11, 31, 17)),
  };
}

function statusAt(
  current: string,
  logs: Array<{ fromStatus: string; toStatus: string; createdAt: Date }>,
  at: Date,
  closedAt?: Date | null,
) {
  const previous = [...logs].reverse().find((log) => log.createdAt < at);
  if (previous) return previous.toStatus;
  const next = logs.find((log) => log.createdAt >= at);
  if (next) return next.fromStatus;
  if (closed(current) && closedAt && closedAt >= at) return 'IN_PROGRESS';
  return current;
}

function overlapsYear(
  openedAt: Date,
  current: string,
  logs: Array<{ fromStatus: string; toStatus: string; createdAt: Date }>,
  start: Date,
  end: Date,
  closedAt?: Date | null,
) {
  if (openedAt >= end) return false;
  if (openedAt >= start || !closed(statusAt(current, logs, start, closedAt))) return true;
  return logs.some((log) => log.createdAt >= start && log.createdAt < end && !closed(log.toStatus));
}

@Injectable()
export class ClientAnnualReportsService {
  constructor(private prisma: PrismaService) {}

  private async client(user: AuthUser, clientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: clientId, firmId: user.firmId },
      select: { id: true, name: true },
    });
    if (!client) throw new NotFoundException('Client not found');
    return client;
  }

  async preview(
    user: AuthUser,
    clientId: string,
    year: number,
    audience: ReportAudience,
    caseIds?: string[],
  ) {
    const client = await this.client(user, clientId);
    if (audience !== 'REPRESENTED' && audience !== 'PAYER') {
      throw new BadRequestException('Invalid report audience');
    }
    const { start, end } = yearBounds(year);
    // InvoicePayment.receivedAt is a SQL DATE, unlike the timestamp fields above.
    const paymentStart = new Date(Date.UTC(year, 0, 1));
    const paymentEnd = new Date(Date.UTC(year + 1, 0, 1));
    const cases = await this.prisma.case.findMany({
      where: {
        firmId: user.firmId,
        deletedAt: null,
        openedAt: { lt: end },
        ...(audience === 'PAYER'
          ? { customers: { some: { customerId: clientId } } }
          : { OR: [{ clientId }, { additionalClients: { some: { clientId } } }] }),
      },
      select: {
        id: true, ownRef: true, customerRef: true, blackCaseNumber: true, redCaseNumber: true,
        title: true, clientName: true, openedAt: true, closedAt: true, status: true, stage: true,
        outcome: true, closingSummary: true, claimedAmount: true,
        caseType: { select: { name: true } },
        leadLawyer: { select: { firstName: true, lastName: true } },
        insuranceClaim: { select: { policyNumber: true } },
        intake: { select: { policyNumber: true } },
        statusLogs: {
          select: { fromStatus: true, toStatus: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
        activities: {
          where: { type: 'STATUS_CHANGE', title: 'ปิดคดี / Case Closed', activityAt: { lt: end } },
          select: { description: true },
          orderBy: { activityAt: 'desc' },
          take: 1,
        },
      },
      orderBy: [{ openedAt: 'asc' }, { id: 'asc' }],
    });
    const eligible = cases.filter((item) =>
      overlapsYear(item.openedAt, item.status, item.statusLogs, start, end, item.closedAt),
    );
    const eligibleIds = new Set(eligible.map((item) => item.id));
    if (caseIds && (caseIds.length === 0 || caseIds.some((id) => !eligibleIds.has(id)))) {
      throw new BadRequestException('มีคดีที่เลือกอยู่นอกขอบเขตรายงานของลูกค้ารายนี้');
    }
    const selectedIds = new Set(caseIds ?? eligible.map((item) => item.id));
    const selected = eligible.filter((item) => selectedIds.has(item.id));
    const rows: AnnualReportSnapshot['cases'] = selected.map((item) => {
      const statusAtYearEnd = statusAt(item.status, item.statusLogs, end, item.closedAt);
      const closure = [...item.statusLogs].reverse().find(
        (log) => log.createdAt < end && log.toStatus === 'CLOSED',
      );
      const closedAt = closed(statusAtYearEnd)
        ? (closure?.createdAt ?? item.closedAt)?.toISOString() ?? null
        : null;
      const currentClosure = closedAt && closed(item.status) && item.closedAt && item.closedAt < end;
      const historicalDetails = item.activities[0]?.description?.split('\n') ?? [];
      return {
        id: item.id,
        ownRef: item.ownRef,
        customerRef: item.customerRef,
        policyRef: item.insuranceClaim?.policyNumber ?? item.intake?.policyNumber ?? null,
        policyRelevant: Boolean(item.insuranceClaim || item.intake?.policyNumber),
        blackCaseNumber: item.blackCaseNumber,
        redCaseNumber: item.redCaseNumber,
        title: item.title,
        clientName: item.clientName,
        caseType: item.caseType?.name ?? null,
        openedAt: item.openedAt.toISOString(),
        stageAtPublication: item.stage,
        statusAtYearEnd,
        closedAt,
        outcome: closedAt
          ? (currentClosure ? item.outcome : historicalDetails.find((line) => line.startsWith('ผลคดี: '))?.slice('ผลคดี: '.length) ?? null)
          : null,
        closingSummary: closedAt ? (currentClosure ? item.closingSummary : historicalDetails[0] ?? null) : null,
        leadLawyer: `${item.leadLawyer.firstName} ${item.leadLawyer.lastName}`.trim(),
        claimedAmount: item.claimedAmount,
      };
    });
    const ids = rows.map((item) => item.id);
    const [invoices, payments, unassignedInvoiceCount] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          firmId: user.firmId, caseId: { in: ids }, billToCustomerId: clientId,
          status: { in: ['SENT', 'PAID'] }, issuedAt: { gte: start, lt: end },
        },
        select: { totalAmount: true },
      }),
      this.prisma.invoicePayment.findMany({
        where: {
          firmId: user.firmId, receivedAt: { gte: paymentStart, lt: paymentEnd },
          invoice: { firmId: user.firmId, caseId: { in: ids }, billToCustomerId: clientId },
        },
        select: { amount: true },
      }),
      this.prisma.invoice.count({
        where: {
          firmId: user.firmId, caseId: { in: ids }, billToCustomerId: null,
          status: { in: ['SENT', 'PAID'] }, issuedAt: { gte: start, lt: end },
        },
      }),
    ]);
    const snapshot: AnnualReportSnapshot = {
      clientName: client.name,
      year,
      audience,
      cases: rows,
      totals: {
        cases: rows.length,
        opened: rows.filter((item) => new Date(item.openedAt) >= start).length,
        closedInYear: selected.filter((item) =>
          item.statusLogs.some((log) =>
            log.toStatus === 'CLOSED' && log.createdAt >= start && log.createdAt < end,
          ) || (item.closedAt && item.closedAt >= start && item.closedAt < end),
        ).length,
        closedAtYearEnd: rows.filter((item) => closed(item.statusAtYearEnd)).length,
        ongoing: rows.filter((item) => !closed(item.statusAtYearEnd)).length,
        claimedAmount: rows.reduce((sum, item) => sum + (item.claimedAmount ?? 0), 0),
        claimedCaseCount: rows.filter((item) => item.claimedAmount != null).length,
        invoicedAmount: invoices.reduce((sum, item) => sum + item.totalAmount, 0),
        receivedAmount: payments.reduce((sum, item) => sum + item.amount, 0),
        unassignedInvoiceCount,
      },
    };
    return {
      snapshot,
      fingerprint: createHash('sha256').update(JSON.stringify(snapshot)).digest('hex'),
    };
  }

  async publish(
    user: AuthUser,
    clientId: string,
    year: number,
    audience: ReportAudience,
    caseIds: string[],
    contactIds: string[],
    fingerprint: string,
  ) {
    if (new Date() < yearBounds(year).end) {
      throw new BadRequestException('เผยแพร่รายงานประจำปีได้หลังสิ้นปีที่เลือก');
    }
    if (!contactIds.length || new Set(contactIds).size !== contactIds.length) {
      throw new BadRequestException('เลือกผู้ติดต่อที่จะได้รับรายงาน');
    }
    const contacts = await this.prisma.clientContact.findMany({
      where: { id: { in: contactIds }, clientId, portalEnabled: true },
      select: { id: true },
    });
    if (contacts.length !== contactIds.length) {
      throw new BadRequestException('ผู้ติดต่อที่เลือกบางรายยังไม่ได้เปิดสิทธิ์พอร์ทัล');
    }
    const preview = await this.preview(user, clientId, year, audience, caseIds);
    if (!preview.snapshot.cases.length) throw new BadRequestException('เลือกคดีอย่างน้อยหนึ่งเรื่อง');
    if (preview.snapshot.totals.unassignedInvoiceCount) {
      throw new BadRequestException('ระบุผู้รับใบแจ้งหนี้ที่ออกแล้วก่อนเผยแพร่รายงาน');
    }
    if (preview.fingerprint !== fingerprint) {
      throw new ConflictException('ข้อมูลรายงานเปลี่ยนแล้ว กรุณาตรวจตัวอย่างอีกครั้ง');
    }
    const missingClose = preview.snapshot.cases.find(
      (item) => item.closedAt && !item.closingSummary?.trim(),
    );
    if (missingClose) {
      throw new BadRequestException(`คดี ${missingClose.ownRef} ยังไม่มีรายละเอียดปิดคดี`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.clientAnnualReport.updateMany({
        where: { firmId: user.firmId, clientId, year, audience, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      return tx.clientAnnualReport.create({
        data: {
          firmId: user.firmId,
          clientId,
          year,
          audience,
          snapshot: preview.snapshot as unknown as Prisma.InputJsonValue,
          fingerprint,
          recipientContactIds: contactIds,
          publishedById: user.id,
        },
      });
    });
  }

  async listStaff(user: AuthUser, clientId: string) {
    await this.client(user, clientId);
    return this.prisma.clientAnnualReport.findMany({
      where: { firmId: user.firmId, clientId },
      select: {
        id: true, year: true, audience: true, publishedAt: true, revokedAt: true,
        recipientContactIds: true, snapshot: true,
      },
      orderBy: { publishedAt: 'desc' },
    });
  }

  async revoke(user: AuthUser, clientId: string, reportId: string) {
    await this.client(user, clientId);
    const result = await this.prisma.clientAnnualReport.updateMany({
      where: { id: reportId, clientId, firmId: user.firmId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (!result.count) throw new NotFoundException('Published report not found');
    return { revoked: true };
  }

  async listPortal(portalUser: PortalIdentity) {
    const reports = await this.prisma.clientAnnualReport.findMany({
      where: {
        firmId: portalUser.firmId,
        clientId: portalUser.clientId,
        recipientContactIds: { has: portalUser.clientContactId },
        revokedAt: null,
      },
      select: { id: true, year: true, audience: true, publishedAt: true, snapshot: true },
      orderBy: { publishedAt: 'desc' },
    });
    return reports.map(({ snapshot, ...report }) => ({
      ...report,
      totals: (snapshot as unknown as AnnualReportSnapshot).totals,
    }));
  }

  async getPortal(portalUser: PortalIdentity, reportId: string) {
    const report = await this.prisma.clientAnnualReport.findFirst({
      where: {
        id: reportId,
        firmId: portalUser.firmId,
        clientId: portalUser.clientId,
        recipientContactIds: { has: portalUser.clientContactId },
        revokedAt: null,
      },
      select: { id: true, year: true, audience: true, publishedAt: true, snapshot: true },
    });
    if (!report) throw new NotFoundException('Report not found');
    const snapshot = report.snapshot as unknown as AnnualReportSnapshot;
    const access = await this.prisma.contactCaseAccess.findMany({
      where: {
        clientContactId: portalUser.clientContactId,
        caseId: { in: snapshot.cases.map((item) => item.id) },
        revokedAt: null,
        startDate: { lte: new Date() },
        OR: [{ endDate: null }, { endDate: { gte: new Date() } }],
        case: { firmId: portalUser.firmId, clientId: portalUser.clientId, deletedAt: null },
      },
      select: { caseId: true },
    });
    const accessible = new Set(access.map((item) => item.caseId));
    return {
      ...report,
      snapshot: {
        ...snapshot,
        cases: snapshot.cases.map((item) => ({ ...item, canOpenCase: accessible.has(item.id) })),
      },
    };
  }
}
