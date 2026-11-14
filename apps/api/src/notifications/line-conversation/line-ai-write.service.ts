import { HttpException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
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
/** The ยืนยัน button's postback: it names the one proposal it confirms, so a late tap can't save a newer one. */
export const AI_CONFIRM_ACTION = /^ai-write:confirm:([0-9a-f-]{36})$/i;
export const aiConfirmQuickReply = (id: string): QuickReplyItem[] => [
  { label: '✅ ยืนยัน', text: AI_CONFIRM_COMMAND, data: `ai-write:confirm:${id}` },
  { label: '❌ ยกเลิก', text: CANCEL_COMMAND },
];
const STALE = 'ปุ่มนี้เป็นของรายการเก่าครับ ไม่ได้บันทึก กดยืนยันที่ข้อความตรวจสอบล่าสุด';
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

  /** Holds the proposal in the 1:1 chat (it may name a case the group cannot see); returns its confirm buttons. */
  hold(user: AuthUser, lineUserId: string, proposal: AiWriteProposal): QuickReplyItem[] {
    const id = randomUUID();
    this.store.start({
      lineUserId, userId: user.id, firmId: user.firmId,
      flowType: FlowType.AI_WRITE, step: ConversationStep.AI_WRITE_CONFIRM,
      data: { proposal, id }, target: { sourceType: 'user' },
    });
    return aiConfirmQuickReply(id);
  }

  /** The buttons of the proposal held now, for re-showing them. */
  heldQuickReply(lineUserId: string): QuickReplyItem[] | undefined {
    const held = this.store.get(lineUserId);
    return held?.flowType === FlowType.AI_WRITE ? aiConfirmQuickReply(held.data.id as string) : undefined;
  }

  /**
   * Saves the held proposal and returns the reply, or null when nothing is held. Taking it out of the store
   * happens before any await, so two quick taps (two webhooks) can never both save it.
   */
  async confirm(user: AuthUser, lineUserId: string, id: string): Promise<string | null> {
    const held = this.store.get(lineUserId);
    // Nothing held: the second tap of a button whose first tap already saved it.
    if (held?.flowType !== FlowType.AI_WRITE) return null;
    if (held.data.id !== id) return STALE;
    this.store.clear(lineUserId);
    // Proposed for this person in this firm only — a relinked LINE account or a changed firm never inherits it.
    if (held.userId !== user.id || held.firmId !== user.firmId) return 'รายการนี้หมดอายุแล้วครับ ไม่ได้บันทึก';
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
      case 'create_custom_field':
      case 'update_custom_field':
      case 'archive_custom_field':
      case 'restore_custom_field': return ['✅ บันทึกช่องข้อมูลเพิ่มเติมแล้วครับ', '/settings/custom-fields'];
      case 'set_custom_field_values': return ['✅ บันทึกข้อมูลเพิ่มเติมแล้วครับ', a.entity === 'CASE' ? `/cases/${encodeURIComponent(String(a.id))}` : '/clients'];
      case 'create_task': return [`✅ บันทึกแล้วครับ: สร้างงาน "${a.title}"`, taskPath];
      case 'complete_task': return [`✅ ปิดงาน "${proposal.labels.task}" แล้วครับ`, taskPath];
      case 'add_case_note': return ['✅ เพิ่มบันทึกในคดีแล้วครับ', casePath];
      case 'log_time': return [`✅ ลงเวลา ${a.hours} ชม. แล้วครับ`, casePath];
      case 'propose_court_date': return ['✅ เสนอวันนัดแล้วครับ กดยอมรับในหน้าคดีเพื่อลงปฏิทิน', casePath];
      case 'draft_expense': return ['✅ บันทึกร่างเบิกแล้วครับ แนบใบเสร็จและกดส่งเบิกในแอป', '/expenses'];
      case 'draft_notice': return ['✅ บันทึกร่างหนังสือทวงถามแล้วครับ ทนายตรวจแก้และกดออกหนังสือในแอป', casePath ?? `/intake/${encodeURIComponent(String(saved.intakeId))}`];
      case 'request_leave': return [`✅ ${saved.message}`, '/leaves'];
      case 'create_sop': return [`✅ สร้าง SOP "${a.title}" แล้วครับ แก้ไขหรือลบได้ในแอป`, '/sops'];
      case 'create_workflow': return [`✅ บันทึกชุดขั้นตอนงาน "${a.name}" แล้วครับ เริ่มใช้กับคดีได้ในแอป`, '/workflows'];
    }
  })();
  return path ? `${line}\n🔗 ${origin}${path}` : line;
}
