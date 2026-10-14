import { ConflictException, Injectable } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { OutlookConnectionsService } from './outlook-connections.service';
import { connectionHealth, humanizeGraphError } from './connection-health';

const REMIND_COOLDOWN_MS = 10 * 60_000;
const MAX_FAILING_LINKS = 50;

const trunc = (s: string | null) => (s ? s.slice(0, 300) : null);
const fullName = (u: { firstName: string | null; lastName: string | null }) => [u.firstName, u.lastName].filter(Boolean).join(' ');

@Injectable()
export class OutlookAdminStatusService {
  // ponytail: per-process map, a multi-instance deploy could remind twice; move to Redis if that matters.
  private readonly lastRemind = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private connections: OutlookConnectionsService,
  ) {}

  async getStatus(user: AuthUser) {
    const now = new Date();
    const firmId = user.firmId;
    const linkWhere = { firmId, case: { deletedAt: null } };
    const rows = await this.prisma.mailboxConnection.findMany({
      where: { firmId },
      select: {
        id: true, mailboxAddress: true, status: true, lastError: true, lastSyncedAt: true, updatedAt: true,
        syncInboxToIntake: true, syncCalendar: true, subscriptionExpiresAt: true, userId: true, connectedByUserId: true,
        user: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const [linkGroups, failingGroups, copyGroups, failing, members] = await Promise.all([
      this.prisma.caseExternalLink.groupBy({ by: ['connectionId', 'kind'], where: linkWhere, _count: { _all: true } }),
      this.prisma.caseExternalLink.groupBy({
        by: ['connectionId', 'kind'],
        where: { ...linkWhere, lastError: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.calendarEventOutlookCopy.groupBy({
        by: ['connectionId'],
        where: { lastError: { not: null }, connectionId: { in: rows.map((r) => r.id) } },
        _count: { _all: true },
      }),
      this.prisma.caseExternalLink.findMany({
        where: { ...linkWhere, lastError: { not: null } },
        orderBy: { createdAt: 'desc' },
        take: MAX_FAILING_LINKS,
        select: {
          id: true, kind: true, caseId: true, displayPath: true, lastSyncedAt: true, lastError: true,
          case: { select: { ownRef: true, title: true } },
          connection: { select: { mailboxAddress: true } },
        },
      }),
      this.prisma.firmMember.findMany({
        where: { firmId, role: { not: FirmRole.EXTERNAL } },
        select: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
      }),
    ]);
    return this.shape(now, rows, linkGroups, failingGroups, copyGroups, failing, members);
  }

  private shape(now: Date, rows: any[], linkGroups: any[], failingGroups: any[], copyGroups: any[], failing: any[], members: any[]) {
    const folderTotal = new Map<string, number>();
    const driveTotal = new Map<string, number>();
    for (const g of linkGroups) (g.kind === 'OUTLOOK_FOLDER' ? folderTotal : driveTotal).set(g.connectionId, g._count._all);
    const failingFolder = new Map<string, number>();
    for (const g of failingGroups) if (g.kind === 'OUTLOOK_FOLDER') failingFolder.set(g.connectionId, g._count._all);
    const copyErrors = new Map<string, number>(copyGroups.map((g) => [g.connectionId, g._count._all]));

    const connections = rows.map((r) => {
      const { health, reason } = connectionHealth({ ...r, failingFolderLinks: failingFolder.get(r.id) ?? 0 }, now);
      return {
        id: r.id,
        mailboxAddress: r.mailboxAddress,
        user: r.user ? { id: r.user.id, name: fullName(r.user) } : null,
        status: r.status,
        health,
        healthReason: reason,
        lastSyncedAt: r.lastSyncedAt?.toISOString() ?? null,
        lastError: trunc(r.lastError),
        lastErrorThai: humanizeGraphError(trunc(r.lastError)),
        syncInboxToIntake: r.syncInboxToIntake,
        syncCalendar: r.syncCalendar,
        subscriptionExpiresAt: r.subscriptionExpiresAt?.toISOString() ?? null,
        folderLinks: { total: folderTotal.get(r.id) ?? 0, failing: failingFolder.get(r.id) ?? 0 },
        driveLinks: driveTotal.get(r.id) ?? 0,
        calendarCopyErrors: copyErrors.get(r.id) ?? 0,
      };
    });

    const connectedUsers = new Set(rows.filter((r) => r.status === 'ACTIVE').map((r) => r.userId ?? r.connectedByUserId));
    const notConnected = members
      .map((m) => m.user)
      .filter((u) => !connectedUsers.has(u.id))
      .map((u) => ({ userId: u.id, name: fullName(u), email: u.email }));

    return {
      generatedAt: now.toISOString(),
      summary: {
        members: members.length,
        connected: connections.filter((c) => c.status === 'ACTIVE').length,
        problems: connections.filter((c) => c.health !== 'OK').length,
        notConnected: notConnected.length,
      },
      connections,
      failingLinks: failing.map((l) => ({
        linkId: l.id,
        kind: l.kind,
        caseId: l.caseId,
        ownRef: l.case.ownRef,
        caseTitle: l.case.title,
        displayPath: l.displayPath,
        mailboxAddress: l.connection.mailboxAddress,
        lastSyncedAt: l.lastSyncedAt?.toISOString() ?? null,
        lastError: trunc(l.lastError),
        lastErrorThai: humanizeGraphError(trunc(l.lastError)),
      })),
      notConnected,
    };
  }

  async remind(user: AuthUser, connectionId: string) {
    await this.connections.assertOwnership(user.firmId, connectionId);
    const last = this.lastRemind.get(connectionId);
    if (last && Date.now() - last < REMIND_COOLDOWN_MS) throw new ConflictException('เพิ่งแจ้งเตือนไปแล้ว กรุณารอ 10 นาทีก่อนแจ้งอีกครั้ง');
    const conn = await this.prisma.mailboxConnection.findFirstOrThrow({
      where: { id: connectionId, firmId: user.firmId },
      select: { firmId: true, mailboxAddress: true, userId: true, connectedByUserId: true },
    });
    this.lastRemind.set(connectionId, Date.now());
    await this.connections.notifyReconnectNeeded(conn, user.id);
    await this.prisma.auditLog.create({
      data: { firmId: user.firmId, userId: user.id, action: 'M365_RECONNECT_REQUESTED', metadata: { connectionId, mailboxAddress: conn.mailboxAddress } },
    });
    return { notified: true as const };
  }
}
