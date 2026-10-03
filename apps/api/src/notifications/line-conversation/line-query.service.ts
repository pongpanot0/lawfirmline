import { forwardRef, Inject, Injectable } from '@nestjs/common';
import { AuthUser, TaskStatus } from '@lawfirm/shared';
import { CaseStatus, Prisma } from '../../generated/prisma';
import { PrismaService } from '../../prisma/prisma.module';
import { CaseAccessService } from '../../common/services/case-access.service';
import { TasksService } from '../../tasks/tasks.service';
import { FirmLinkService } from '../firm-link.service';
import { QuickReplyItem } from '../line-messaging.service';
import { formatBangkokDateTime, formatBangkokDateThai } from '../../common/utils/bangkok-time';

export const OPEN_TASKS_COMMAND = 'งานค้างของฉัน';
export const CASE_SEARCH_COMMAND = 'ค้นคดี';
/** "คดี TSB-001", "คดี TSB-001 นัดครั้งหน้าเมื่อไหร่" — the first word after คดี is the search term. */
const CASE_QUERY = /^คดี\s+(\S+)/;

const OPEN_TASK_LIMIT = 10;
const CASE_MATCH_LIMIT = 5;
const UPCOMING_EVENT_LIMIT = 3;

const STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: 'เปิดคดี',
  DRAFTING: 'ร่างเอกสาร',
  COURT_DATE: 'มีนัดศาล',
  IN_PROGRESS: 'กำลังดำเนินการ',
  PENDING: 'รอดำเนินการ',
  CLOSED: 'ปิดคดี',
  ARCHIVED: 'เก็บเข้าแฟ้ม',
};

export interface QueryReply {
  text: string;
  quickReply?: QuickReplyItem[];
}

/** Read-only answers to questions typed in the LINE chat, within the asker's own case access. */
@Injectable()
export class LineQueryService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
    private firmLink: FirmLinkService,
  ) {}

  /** The search term when `text` is a case question, else null. */
  caseQuery(text: string): string | null {
    return CASE_QUERY.exec(text.trim())?.[1] ?? null;
  }

  async openTasks(user: AuthUser): Promise<QueryReply> {
    const all = await this.tasks.findMine(user, 'mine');
    const open = all
      .filter((task) => task.assigneeId === user.id && task.status !== TaskStatus.DONE)
      .sort((a, b) => (a.dueDate?.getTime() ?? Infinity) - (b.dueDate?.getTime() ?? Infinity));
    const link = `${this.firmLink.originForSlug(user.firmSlug)}/todos`;
    if (!open.length) return { text: `ไม่มีงานค้างครับ 🎉\n\n🔗 ${link}` };

    const now = Date.now();
    const lines = open.slice(0, OPEN_TASK_LIMIT).map((task) => {
      const due = task.dueDate
        ? `${task.dueDate.getTime() < now ? '⏰ เลยกำหนด ' : ''}${formatBangkokDateThai(task.dueDate)}`
        : 'ไม่มีกำหนด';
      const review = task.status === TaskStatus.PENDING_REVIEW ? ' · รอตรวจ' : '';
      return `• ${task.title}${task.case?.ownRef ? ` — ${task.case.ownRef}` : ''}\n   ${due}${review}`;
    });
    const more = open.length > OPEN_TASK_LIMIT ? [`…และอีก ${open.length - OPEN_TASK_LIMIT} งาน`] : [];
    return { text: [`📌 งานค้างของฉัน ${open.length} งาน`, ...lines, ...more, '', `🔗 ${link}`].join('\n') };
  }

  async findCase(user: AuthUser, term: string): Promise<QueryReply> {
    const contains = { contains: term, mode: Prisma.QueryMode.insensitive };
    const matches = await this.prisma.case.findMany({
      where: {
        AND: [
          this.caseAccess.getCaseFilterForUser(user),
          { deletedAt: null },
          { OR: [{ ownRef: contains }, { blackCaseNumber: contains }, { redCaseNumber: contains }, { title: contains }] },
        ],
      },
      select: { id: true, ownRef: true, title: true },
      orderBy: { updatedAt: 'desc' },
      take: CASE_MATCH_LIMIT + 1,
    });
    // An exact reference wins over loose title matches.
    const exact = matches.find((c) => c.ownRef.toLowerCase() === term.toLowerCase());
    if (exact || matches.length === 1) return this.caseDetail(user, (exact ?? matches[0]).id);
    if (!matches.length) {
      return { text: `ไม่พบคดี "${term}" ที่คุณเข้าถึงได้ครับ\nลองพิมพ์ "คดี" ตามด้วยเลขอ้างอิง เลขคดีดำ/แดง หรือชื่อคดี` };
    }
    const shown = matches.slice(0, CASE_MATCH_LIMIT);
    return {
      text: [`พบ ${matches.length > CASE_MATCH_LIMIT ? `มากกว่า ${CASE_MATCH_LIMIT}` : matches.length} คดี เลือกคดีที่ต้องการครับ`,
        ...shown.map((c) => `• ${c.ownRef} — ${c.title}`)].join('\n'),
      quickReply: shown.map((c) => ({ label: c.ownRef, text: `คดี ${c.ownRef}` })),
    };
  }

  private async caseDetail(user: AuthUser, caseId: string): Promise<QueryReply> {
    const now = new Date();
    const c = await this.prisma.case.findUniqueOrThrow({
      where: { id: caseId },
      select: {
        id: true, ownRef: true, title: true, status: true, courtName: true,
        blackCaseNumber: true, redCaseNumber: true, clientName: true, client: { select: { name: true } },
        leadLawyer: { select: { firstName: true, lastName: true } },
        calendarEvents: {
          where: { startAt: { gte: now } },
          orderBy: { startAt: 'asc' },
          take: UPCOMING_EVENT_LIMIT,
          select: { title: true, startAt: true, courtName: true },
        },
        _count: { select: { tasks: { where: { status: { not: TaskStatus.DONE } } } } },
      },
    });
    const events = c.calendarEvents.length
      ? c.calendarEvents.map((e) => `• ${formatBangkokDateTime(e.startAt)} ${e.title}${e.courtName ? ` (${e.courtName})` : ''}`)
      : ['• ยังไม่มีนัดที่จะถึง'];
    const lines = [
      `⚖️ ${c.ownRef} — ${c.title}`,
      `สถานะ: ${STATUS_LABEL[c.status] ?? c.status}`,
      c.client?.name ?? c.clientName ? `ลูกความ: ${c.client?.name ?? c.clientName}` : null,
      c.blackCaseNumber ? `คดีดำ: ${c.blackCaseNumber}` : null,
      c.redCaseNumber ? `คดีแดง: ${c.redCaseNumber}` : null,
      c.courtName ? `ศาล: ${c.courtName}` : null,
      `ทนายเจ้าของคดี: ${c.leadLawyer.firstName} ${c.leadLawyer.lastName}`.trim(),
      '',
      '📅 นัดที่จะถึง',
      ...events,
      '',
      `📌 งานที่ยังไม่เสร็จ ${c._count.tasks} งาน`,
      '',
      `🔗 ${this.firmLink.originForSlug(user.firmSlug)}/cases/${c.id}`,
    ];
    return { text: lines.filter((line) => line !== null).join('\n') };
  }
}
