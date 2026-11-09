'use client';

import { useState } from 'react';
import type { IntakeFieldProposalItem } from '@/lib/api';
import { isPending, moneyFields, parseOtherAmount } from '@/lib/email-intake';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const labels: Record<string, string> = {
  estimatedDamage: 'ยอดเรียกร้อง / ค่าเสียหาย', insurerPaidAmount: 'ประกันจ่ายไปแล้ว', settlementOfferAmount: 'ข้อเสนอไกล่เกลี่ย',
  opposingParty: 'คู่กรณี', insurerName: 'บริษัทประกัน', policyNumber: 'เลขกรมธรรม์', claimNumber: 'เลขเคลม',
  incidentDate: 'วันที่เกิดเหตุ', requestedResponseDate: 'ครบกำหนดตอบ', contactName: 'ผู้ติดต่อ', clientName: 'ชื่อลูกค้า', title: 'ชื่อเรื่อง', description: 'รายละเอียด',
};

function Row({ proposal, proposals, onResolve, resolving }: { proposal: IntakeFieldProposalItem; proposals: IntakeFieldProposalItem[]; onResolve: (id: string, action: 'confirm' | 'reject', value?: string) => void; resolving: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(proposal.proposedValue ?? '');
  const other = proposal.field === 'otherAmount' ? parseOtherAmount(proposal.proposedValue) : null;
  const label = other?.label ?? labels[proposal.field] ?? proposal.field;
  const raw = other ? String(other.amount) : proposal.proposedValue;
  const value = moneyFields.includes(proposal.field) && raw !== null && raw !== '' && Number.isFinite(Number(raw)) ? Number(raw).toLocaleString('th-TH') + ' บาท' : raw || '(ยังไม่พบข้อมูล)';
  const overwritten = proposal.field !== 'otherAmount' && proposals.find((p) => p.id !== proposal.id && p.field === proposal.field && p.status === 'CONFIRMED' && p.matterLabel !== proposal.matterLabel && p.proposedValue !== (editing ? draft : proposal.proposedValue));
  return <div className="rounded-md border p-3" data-pending={isPending(proposal) ? 'true' : undefined}>
    <div className="flex flex-wrap justify-between gap-2"><span className="text-sm text-muted-foreground">{label}</span>{editing ? <textarea aria-label={label} className="w-full rounded border bg-background px-2 py-1 text-sm" value={draft} onChange={(e) => setDraft(e.target.value)} /> : <span className="min-w-0 break-words text-sm font-medium">{value}</span>}</div>
    {proposal.sourceDetail && <p className="mt-2 break-words rounded bg-muted/50 p-2 text-xs text-muted-foreground">“{proposal.sourceDetail}”</p>}
    {isPending(proposal) && overwritten && <p className="mt-2 text-xs text-warning-foreground">จะทับค่าเดิม ({overwritten.proposedValue})</p>}
    {proposal.status === 'CONFIRMED' && <Badge variant="success" className="mt-2">✓ ยืนยันแล้ว</Badge>}
    {proposal.status === 'REJECTED' && <Badge variant="muted" className="mt-2">ตัดออกแล้ว</Badge>}
    {isPending(proposal) && <div className="mt-2 flex flex-wrap justify-end gap-2">
      {editing ? <><Button size="sm" disabled={resolving} onClick={() => { onResolve(proposal.id, 'confirm', draft); setEditing(false); }}>ยืนยันค่าที่แก้ไข</Button><Button size="sm" variant="outline" onClick={() => setEditing(false)}>ยกเลิก</Button></> : <><Button size="sm" variant="outline" disabled={resolving} onClick={() => onResolve(proposal.id, 'reject')}>ไม่ใช่</Button><Button size="sm" variant="outline" disabled={resolving} onClick={() => setEditing(true)}>แก้ไข</Button><Button size="sm" disabled={resolving} onClick={() => onResolve(proposal.id, 'confirm')}>ยืนยัน</Button></>}
    </div>}
  </div>;
}

export function ProposalGroup({ title, items, proposals, onResolve, resolvingId }: { title: string; items: IntakeFieldProposalItem[]; proposals: IntakeFieldProposalItem[]; onResolve: (id: string, action: 'confirm' | 'reject', value?: string) => void; resolvingId: string | null }) {
  const [showRejected, setShowRejected] = useState(false);
  const rejected = items.filter((p) => p.status === 'REJECTED');
  const visible = items.filter((p) => showRejected || p.status !== 'REJECTED');
  const money = visible.filter((p) => moneyFields.includes(p.field));
  const other = visible.filter((p) => !moneyFields.includes(p.field));
  const rows = (list: IntakeFieldProposalItem[]) => list.map((p) => <Row key={p.id} proposal={p} proposals={proposals} onResolve={onResolve} resolving={resolvingId === p.id} />);
  return <section className="space-y-3 rounded-lg border p-3"><h3 className="font-semibold">{title}</h3>
    {money.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">ยอดเงิน</p>{rows(money)}</div>}
    {other.length > 0 && <div className="space-y-2"><p className="text-xs font-medium text-muted-foreground">ข้อมูลคู่กรณีและเงื่อนไข</p>{rows(other)}</div>}
    {rejected.length > 0 && <button type="button" className="text-xs text-primary underline" onClick={() => setShowRejected(!showRejected)}>{showRejected ? 'ซ่อนที่ตัดออก' : `แสดงที่ตัดออก (${rejected.length})`}</button>}
  </section>;
}
