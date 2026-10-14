import { Injectable, Logger } from '@nestjs/common';
import { NotificationCategory } from '../generated/prisma';
import { PrismaService } from '../prisma/prisma.module';
import { AssignmentNotifierService } from '../notifications/assignment-notifier.service';
import { LineLinkService } from '../notifications/line-link.service';
import { GraphMessage } from './outlook-graph.client';

export interface NewInboundItem {
  fromName: string | null;
  fromAddress: string | null;
  subject: string;
}

/** caseId → mail that newly arrived there during one sync run. */
export type NewInboundBatch = Map<string, NewInboundItem[]>;

const FRESH_WINDOW_MS = 24 * 60 * 60 * 1000;
const LISTED = 3;

/** Adds a freshly stored inbound message to the batch; backfill (older than 24 h), repeats and other directions are ignored. */
export function trackNewInbound(
  batch: NewInboundBatch,
  result: { created: boolean; caseId: string | null } | null,
  direction: 'INBOUND' | 'OUTBOUND',
  message: GraphMessage,
  now = Date.now(),
) {
  if (!result?.created || !result.caseId || direction !== 'INBOUND') return;
  const received = Date.parse(message.receivedDateTime ?? '');
  if (!Number.isFinite(received) || now - received > FRESH_WINDOW_MS) return;
  const list = batch.get(result.caseId) ?? [];
  list.push({
    fromName: message.from?.emailAddress?.name ?? null,
    fromAddress: message.from?.emailAddress?.address ?? null,
    subject: message.subject ?? '(ไม่มีหัวข้อ)',
  });
  batch.set(result.caseId, list);
}

/** In-app + LINE alert to a case's team when mail lands in it — one per case per sync run. */
@Injectable()
export class CaseEmailNotifier {
  private readonly logger = new Logger(CaseEmailNotifier.name);

  constructor(
    private prisma: PrismaService,
    private notifier: AssignmentNotifierService,
    private lineLink: LineLinkService,
  ) {}

  async notifyBatch(batch: NewInboundBatch, mailboxOwnerUserId: string) {
    for (const [caseId, items] of batch) await this.notifyNewInbound(caseId, items, mailboxOwnerUserId);
  }

  /** Never throws: a failed alert must not fail the sync. */
  async notifyNewInbound(caseId: string, items: NewInboundItem[], mailboxOwnerUserId: string) {
    if (!items.length) return;
    try {
      const legalCase = await this.prisma.case.findUnique({ where: { id: caseId }, select: { firmId: true, ownRef: true } });
      if (!legalCase) return;
      const team = await this.lineLink.getCaseTeamUserIds(caseId);
      const lines = items.slice(0, LISTED).map((i) => `${i.fromName || i.fromAddress || '-'}: ${i.subject}`);
      if (items.length > LISTED) lines.push(`และอีก ${items.length - LISTED} ฉบับ`);
      await this.notifier.notifyAssigned({
        firmId: legalCase.firmId,
        userIds: team.filter((id) => id !== mailboxOwnerUserId),
        actorUserId: '',
        category: NotificationCategory.EMAIL,
        summaryText: [`📧 อีเมลใหม่ ${items.length} ฉบับ · ${legalCase.ownRef}`, ...lines].join('\n'),
        entityPath: `/cases/${caseId}?tab=email`,
      });
    } catch (error) {
      this.logger.warn(`New-email alert for case ${caseId} failed: ${error}`);
    }
  }
}
