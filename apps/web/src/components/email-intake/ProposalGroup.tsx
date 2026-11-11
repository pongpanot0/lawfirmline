'use client';

import { useState } from 'react';
import { Check, FileText, Mail } from 'lucide-react';
import type { IntakeFieldProposalItem } from '@/lib/api';
import { groupProposals, isPending, moneyFields, parseOtherAmount, sourceQuote } from '@/lib/email-intake';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const labels: Record<string, string> = {
  estimatedDamage: 'ยอดเรียกร้อง / ค่าเสียหาย', insurerPaidAmount: 'ประกันจ่ายไปแล้ว', settlementOfferAmount: 'ข้อเสนอไกล่เกลี่ย',
  opposingParty: 'คู่กรณี', insurerName: 'บริษัทประกัน', policyNumber: 'เลขกรมธรรม์', claimNumber: 'เลขเคลม',
  incidentDate: 'วันที่เกิดเหตุ', requestedResponseDate: 'ครบกำหนดตอบ', contactName: 'ผู้ติดต่อ', clientName: 'ชื่อลูกความ', title: 'ชื่อเรื่อง', description: 'รายละเอียด',
  matterType: 'ประเภทเรื่อง', customerRef: 'เลขอ้างอิงของผู้ส่ง', externalCaseNumber: 'หมายเลขคดีดำ', deadlineDate: 'วันครบกำหนดตามกฎหมาย / โนติส',
  partyRole: 'บทบาทลูกความ', caseType: 'ประเภทคดีในระบบ', docRequest: 'เอกสารที่ควรขอเพิ่ม',
};
const partyRoles: Record<string, string> = { PLAINTIFF: 'โจทก์ / ผู้เรียกร้อง', DEFENDANT: 'จำเลย / ผู้ถูกเรียกร้อง', PETITIONER: 'ผู้ร้อง', RESPONDENT: 'ผู้คัดค้าน' };

type Resolve = (id: string, action: 'confirm' | 'reject', value?: string) => void;

/** One value to check: label above, value large below, then where AI found it — a single primary action. */
function Row({ proposal, proposals, fileNames, onResolve, resolving }: { proposal: IntakeFieldProposalItem; proposals: IntakeFieldProposalItem[]; fileNames: Map<string, string>; onResolve: Resolve; resolving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(proposal.proposedValue ?? '');
  const other = proposal.field === 'otherAmount' ? parseOtherAmount(proposal.proposedValue) : null;
  const label = other?.label ?? labels[proposal.field] ?? proposal.field;
  const raw = other ? String(other.amount) : proposal.proposedValue;
  const money = moneyFields.includes(proposal.field);
  const value = money && raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw).toLocaleString('th-TH') + ' บาท'
    : proposal.field === 'partyRole' && raw ? partyRoles[raw] ?? raw : raw || '(ยังไม่พบข้อมูล)';
  const overwritten = proposal.field !== 'otherAmount' && proposals.find((p) => p.id !== proposal.id && p.field === proposal.field && p.status === 'CONFIRMED' && p.matterLabel !== proposal.matterLabel && p.proposedValue !== (editing ? draft : proposal.proposedValue));
  const pending = isPending(proposal);
  const confirmed = proposal.status === 'CONFIRMED';
  const request = proposal.field === 'docRequest';
  const quote = sourceQuote(proposal.sourceDetail);
  const source = proposal.sourceDocumentId ? fileNames.get(proposal.sourceDocumentId) ?? 'ไฟล์แนบ' : proposal.sourceType === 'EMAIL_BODY' && !request ? 'อีเมล' : null;

  if (confirmed) return <div className="rounded-md bg-muted/40 px-3 py-2 text-sm"><Check className="mr-1 inline h-4 w-4 text-success" aria-hidden /> {label}: <strong>{value}</strong></div>;

  return <div data-pending={pending ? 'true' : undefined} className="rounded-lg border bg-card p-3">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-xs text-muted-foreground">{label} <span className="rounded border border-amber-200 px-1 text-amber-700">AI</span></p>
        {editing ? <textarea aria-label={label} className="mt-1 w-full rounded border bg-background px-2 py-1 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} /> : <p className={cn('mt-1 font-semibold', money && 'tabular-nums')}>{value}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {proposal.status === 'REJECTED' && <Badge variant="muted">ตัดออกแล้ว</Badge>}
        {pending && (editing
          ? <><Button size="sm" disabled={resolving} onClick={() => { onResolve(proposal.id, 'confirm', draft); setEditing(false); }}>ยืนยันค่าที่แก้ไข</Button><Button size="sm" variant="ghost" onClick={() => setEditing(false)}>ยกเลิก</Button></>
          : <><Button size="sm" variant="outline" disabled={resolving} onClick={() => onResolve(proposal.id, 'confirm')}>{request ? 'ขอเอกสารนี้' : 'ใช่'}</Button>{!request && <Button size="sm" variant="ghost" disabled={resolving} onClick={() => setEditing(true)}>แก้</Button>}<Button size="sm" variant="ghost" disabled={resolving} onClick={() => onResolve(proposal.id, 'reject')}>{request ? 'ไม่ต้อง' : 'ไม่ใช่'}</Button></>)}
      </div>
    </div>
    {(quote || pending) && <div className="mt-2 flex flex-wrap items-start justify-between gap-1 border-t border-dashed pt-2 text-xs text-muted-foreground">{quote && <details><summary className="cursor-pointer text-primary">↳ ดูข้อความต้นทาง</summary><div className="flex flex-wrap items-start gap-2 pt-1">
      {source && <span className="inline-flex max-w-full items-center gap-1 rounded border bg-muted/50 px-1.5 py-0.5">{proposal.sourceDocumentId ? <FileText className="h-3 w-3" aria-hidden /> : <Mail className="h-3 w-3" aria-hidden />}{source}</span>}
      <span className="break-words border-l-2 pl-2 italic">{quote}</span></div></details>}{pending && <span>กดยืนยันเพื่อบันทึก</span>}</div>}
    {pending && overwritten && <p className="mt-1 text-xs text-warning-foreground">จะทับค่าเดิม ({overwritten.proposedValue})</p>}
  </div>;
}

function Block({ title, hint, items, render }: { title: string; hint?: string; items: IntakeFieldProposalItem[]; render: (list: IntakeFieldProposalItem[]) => React.ReactNode }) {
  if (!items.length) return null;
  return <div>
    <div className="flex items-baseline justify-between gap-2 border-b pb-1">
      <h4 className="border-l-4 border-primary pl-2 text-sm font-semibold">{title}</h4>
      <span className="text-xs text-muted-foreground">{hint ?? `${items.length} รายการ`}</span>
    </div>
    <div className="divide-y">{render(items)}</div>
  </div>;
}

const NO_FILES = new Map<string, string>();

export function ProposalGroup({ title, items, proposals, fileNames = NO_FILES, onResolve, resolvingId }: { title: string; items: IntakeFieldProposalItem[]; proposals: IntakeFieldProposalItem[]; fileNames?: Map<string, string>; onResolve: Resolve; resolvingId: string | null }) {
  const [showRejected, setShowRejected] = useState(false);
  const rejected = items.filter((p) => p.status === 'REJECTED');
  const visible = items.filter((p) => showRejected || p.status !== 'REJECTED');
  const rows = (list: IntakeFieldProposalItem[]) => list.map((p) => <Row key={p.id} proposal={p} proposals={proposals} fileNames={fileNames} onResolve={onResolve} resolving={resolvingId === p.id} />);
  return <section className="space-y-2 border-t pt-3 first:border-t-0 first:pt-0">
    {title && <h3 className="text-sm font-semibold">{title}</h3>}
    <div className="space-y-2">{rows(visible)}</div>
    {rejected.length > 0 && <button type="button" className="text-xs text-primary underline" onClick={() => setShowRejected(!showRejected)}>{showRejected ? 'ซ่อนที่ตัดออก' : `แสดงที่ตัดออก (${rejected.length})`}</button>}
  </section>;
}

/**
 * On a case the AI's values are already applied once confirmed, so only what still needs a decision
 * is shown; everything decided folds into one line the lawyer can open.
 */
export function ProposalReview({ proposals, onResolve, resolvingId }: { proposals: IntakeFieldProposalItem[]; onResolve: Resolve; resolvingId: string | null }) {
  const [showDecided, setShowDecided] = useState(false);
  const fields = proposals.filter((p) => p.field !== 'document');
  const pending = fields.filter(isPending);
  const decided = fields.length - pending.length;
  if (!fields.length) return null;
  const shown = showDecided ? fields : pending;
  return <div className="space-y-3">
    {groupProposals(shown).map(([label, items]) => <ProposalGroup key={label ?? ''} title={label ?? 'ข้อมูลจาก AI ที่รอยืนยัน'} items={items} proposals={proposals} resolvingId={resolvingId} onResolve={onResolve} />)}
    {decided > 0 && <button type="button" className="text-sm text-primary underline-offset-4 hover:underline" onClick={() => setShowDecided(!showDecided)}>
      {showDecided ? 'ซ่อนข้อมูลที่ตรวจแล้ว' : `ข้อมูลจาก AI ตรวจแล้ว ${decided} รายการ · ดู`}
    </button>}
  </div>;
}
