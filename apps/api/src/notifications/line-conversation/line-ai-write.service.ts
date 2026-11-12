import { HttpException, Injectable, Logger } from '@nestjs/common';
import type { AuthUser } from '@lawfirm/shared';
import { AI_WRITE_TOOLS, AiWriteProposal, AiWriteTool, AiWriteToolsService, AiWriteVia } from '../../secretary/ai-write-tools.service';
import { SecretaryChatService } from '../../secretary/secretary-chat.service';
import { FirmLinkService } from '../firm-link.service';
import { QuickReplyItem } from '../line-messaging.service';
import { LineConversationStoreService } from './line-conversation-store.service';
import { ConversationStep, FlowType } from './line-conversation.types';
import { CANCEL_COMMAND } from './line-menu';

/** The LINE AI offers every MCP write; each still waits for the person's "ยืนยัน". */
export const LINE_AI_WRITES: AiWriteTool[] = AI_WRITE_TOOLS;
export const AI_CONFIRM_COMMAND = 'ยืนยัน';
export const AI_CONFIRM_QUICK_REPLY: QuickReplyItem[] = [
  { label: '✅ ยืนยัน', text: AI_CONFIRM_COMMAND },
  { label: '❌ ยกเลิก', text: CANCEL_COMMAND },
];
const VIA: AiWriteVia = { auditPrefix: 'line_ai', auditMetadata: { channel: 'line' }, clientName: 'LINE' };

/**
 * The confirm step for a write the LINE AI proposed. The proposal waits in the conversation store
 * (10-minute expiry); only the person's "ยืนยัน" saves it, and it is saved once even if tapped twice.
 */
@Injectable()
export class LineAiWriteService {
  private readonly logger = new Logger(LineAiWriteService.name);

  constructor(
    private store: LineConversationStoreService,
    private writes: AiWriteToolsService,
    private secretary: SecretaryChatService,
    private firmLink: FirmLinkService,
  ) {}

  /** Holds the proposal in the 1:1 chat — it may name a case the group cannot see. */
  hold(user: AuthUser, lineUserId: string, proposal: AiWriteProposal): void {
    this.store.start({
      lineUserId, userId: user.id, firmId: user.firmId,
      flowType: FlowType.AI_WRITE, step: ConversationStep.AI_WRITE_CONFIRM,
      data: { proposal }, target: { sourceType: 'user' },
    });
  }

  /**
   * Saves the held proposal and returns the reply, or null when nothing is held. Taking it out of the store
   * happens before any await, so two quick taps (two webhooks) can never both save it.
   */
  async confirm(user: AuthUser, lineUserId: string): Promise<string | null> {
    const held = this.store.get(lineUserId);
    if (held?.flowType !== FlowType.AI_WRITE) return null;
    this.store.clear(lineUserId);
    const proposal = held.data.proposal as AiWriteProposal;
    let reply: string;
    try {
      const saved = await this.writes.run(user, proposal.tool, proposal.args, VIA);
      reply = savedText(proposal, saved, this.firmLink.originForSlug(user.firmSlug));
    } catch (e) {
      if (!(e instanceof HttpException)) this.logger.error(`LINE AI write ${proposal.tool} failed`, e instanceof Error ? e.stack : String(e));
      const reason = e instanceof HttpException && /[ก-๙]/.test(e.message) ? e.message : 'กรุณาลองใหม่ หรือทำรายการในแอป';
      reply = `บันทึกไม่สำเร็จครับ: ${reason}`;
    }
    // The AI reads this chat as history: without the outcome it would offer the same write again.
    await this.secretary.record(user, AI_CONFIRM_COMMAND, reply);
    return reply;
  }
}

/** The one line that says what was saved, plus where to open it. */
export function savedText(proposal: AiWriteProposal, saved: Record<string, unknown>, origin: string): string {
  const caseId = saved.caseId as string | null;
  const casePath = caseId ? `/cases/${encodeURIComponent(caseId)}` : null;
  const taskPath = `${casePath ?? '/todos'}?task=${encodeURIComponent(String(saved.id))}`;
  const [line, path]: [string, string | null] = (() => {
    const a = proposal.args;
    switch (proposal.tool) {
      case 'create_task': return [`✅ บันทึกแล้วครับ: สร้างงาน "${a.title}"`, taskPath];
      case 'complete_task': return [`✅ ปิดงาน "${proposal.labels.task}" แล้วครับ`, taskPath];
      case 'add_case_note': return ['✅ เพิ่มบันทึกในคดีแล้วครับ', casePath];
      case 'log_time': return [`✅ ลงเวลา ${a.hours} ชม. แล้วครับ`, casePath];
      case 'propose_court_date': return ['✅ เสนอวันนัดแล้วครับ กดยอมรับในหน้าคดีเพื่อลงปฏิทิน', casePath];
      case 'draft_expense': return ['✅ บันทึกร่างเบิกแล้วครับ แนบใบเสร็จและกดส่งเบิกในแอป', '/expenses'];
      case 'draft_notice': return ['✅ บันทึกร่างหนังสือทวงถามแล้วครับ ทนายตรวจแก้และกดออกหนังสือในแอป', casePath ?? `/intake/${encodeURIComponent(String(saved.intakeId))}`];
      case 'request_leave': return [`✅ ${saved.message}`, '/leaves'];
    }
  })();
  return path ? `${line}\n🔗 ${origin}${path}` : line;
}
