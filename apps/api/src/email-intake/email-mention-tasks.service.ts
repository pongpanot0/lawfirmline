import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser, FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';
import { CaseAccessService } from '../common/services/case-access.service';
import { TasksService } from '../tasks/tasks.service';
import { parseEmailMentions } from './email-mentions';
import { CreateMentionTaskDto } from './dto/email-intake.dto';

export interface MentionTaskSuggestion {
  assigneeId: string;
  assigneeName: string;
  email: string;
  title: string;
  /** Full ask, when it is longer than one title. */
  text: string;
  dueDate: string | null;
  /** Set once someone confirmed this suggestion. */
  taskId: string | null;
}

const TITLE_MAX = 200;
const normName = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

type Member = { id: string; email: string; firstName: string; lastName: string };

/**
 * Email match wins; otherwise the Outlook display name against "first last", then a first name only one
 * member has (so "@โบ" never lands on the wrong person when two people share it).
 */
export function matchMentionsToMembers(mentions: { email: string; name: string }[], members: Member[]) {
  const byEmail = new Map(members.map((u) => [u.email.toLowerCase(), u]));
  const byFullName = new Map(members.map((u) => [normName(`${u.firstName} ${u.lastName}`), u]));
  const firstNameCount = new Map<string, number>();
  for (const u of members) firstNameCount.set(normName(u.firstName), (firstNameCount.get(normName(u.firstName)) ?? 0) + 1);
  const byFirstName = new Map(members.filter((u) => firstNameCount.get(normName(u.firstName)) === 1).map((u) => [normName(u.firstName), u]));

  const result = new Map<string, { id: string; name: string }>();
  for (const m of mentions) {
    const name = normName(m.name);
    const u = byEmail.get(m.email) ?? byFullName.get(name) ?? byFirstName.get(name);
    if (u) result.set(m.email, { id: u.id, name: `${u.firstName} ${u.lastName}`.trim() });
  }
  return result;
}
/** Task.createRequestId doubles as the "one task per person per email" key, so a second confirm returns the same task. */
const requestKey = (messageId: string, userId: string) => `email-mention:${messageId}:${userId}`;

/**
 * "@ชื่อ ทำ X" in a case email → a task proposal for that firm member. Parsing is plain text rules, no AI;
 * nothing is created until a person presses สร้างงาน.
 */
@Injectable()
export class EmailMentionTasksService {
  constructor(
    private prisma: PrismaService,
    private caseAccess: CaseAccessService,
    @Inject(forwardRef(() => TasksService)) private tasks: TasksService,
  ) {}

  async suggestionsFor(firmId: string, messages: { id: string; bodyHtml: string | null }[]): Promise<Map<string, MentionTaskSuggestion[]>> {
    const parsed = messages.map((m) => ({ id: m.id, mentions: parseEmailMentions(m.bodyHtml) })).filter((m) => m.mentions.length);
    const result = new Map<string, MentionTaskSuggestion[]>();
    if (!parsed.length) return result;

    const members = await this.matchMembers(firmId, parsed.flatMap((m) => m.mentions));
    const keys = parsed.flatMap((m) => m.mentions.flatMap((x) => (members.has(x.email) ? [requestKey(m.id, members.get(x.email)!.id)] : [])));
    const created = keys.length
      ? await this.prisma.task.findMany({ where: { createRequestId: { in: keys }, firmId }, select: { id: true, createRequestId: true } })
      : [];
    const taskByKey = new Map(created.map((t) => [t.createRequestId, t.id]));

    for (const { id, mentions } of parsed) {
      const suggestions = mentions.flatMap((m) => {
        const member = members.get(m.email);
        if (!member) return [];
        return [{
          assigneeId: member.id,
          assigneeName: member.name,
          email: m.email,
          title: m.text.split('\n')[0].slice(0, TITLE_MAX),
          text: m.text,
          dueDate: m.dueDate,
          taskId: taskByKey.get(requestKey(id, member.id)) ?? null,
        }];
      });
      if (suggestions.length) result.set(id, suggestions);
    }
    return result;
  }

  async createTask(user: AuthUser, caseId: string, messageId: string, dto: CreateMentionTaskDto) {
    const message = await this.prisma.emailMessage.findFirst({
      where: { id: messageId, thread: { AND: [await this.caseAccess.getEmailThreadFilterForUser(user), { caseId }] } },
      select: { id: true, bodyHtml: true, fromName: true, fromAddress: true, thread: { select: { subject: true } } },
    });
    if (!message) throw new NotFoundException('ไม่พบอีเมลนี้ในคดี');

    const suggestion = (await this.suggestionsFor(user.firmId, [message])).get(message.id)?.find((s) => s.assigneeId === dto.assigneeId);
    if (!suggestion) throw new BadRequestException('อีเมลนี้ไม่ได้ @ถึงคนนี้');
    if (suggestion.taskId) return this.tasks.findOne(suggestion.taskId);

    const sender = message.fromName || message.fromAddress || 'ไม่ทราบผู้ส่ง';
    return this.tasks.create(user, caseId, {
      title: dto.title,
      description: `${suggestion.text}\n\nสั่งงานทางอีเมลโดย ${sender} — "${message.thread.subject}"`,
      assigneeId: dto.assigneeId,
      dueDate: dto.dueDate,
      createRequestId: requestKey(message.id, dto.assigneeId),
    });
  }

  /** Mention address → firm member, by login email first, then by the mention's display name. */
  private async matchMembers(firmId: string, mentions: { email: string; name: string }[]) {
    // ponytail: loads the whole (small) staff list; filter in SQL if a firm grows to thousands of members
    const rows = await this.prisma.firmMember.findMany({
      where: { firmId, role: { not: FirmRole.EXTERNAL } },
      select: { user: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    return matchMentionsToMembers(mentions, rows.map((r) => r.user));
  }
}
