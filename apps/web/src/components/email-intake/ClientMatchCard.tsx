'use client';

import { useState } from 'react';
import { Building2, Check } from 'lucide-react';
import type { EmailThreadDetail } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const reasonLabel = { EMAIL: 'อีเมลผู้ส่งตรงกับผู้ติดต่อ', DOMAIN: 'โดเมนอีเมลเดียวกัน', NAME: 'ชื่อคล้ายกัน' } as const;

/** Is the sender an existing client? Pick one, or create the client from the sender in one click. */
export function ClientMatchCard({ match, busy, onLink }: {
  match: NonNullable<EmailThreadDetail['clientMatch']>;
  busy: boolean;
  onLink: (data: { clientId: string } | { name: string }) => void;
}) {
  const [name, setName] = useState(match.suggestedName);
  const [creating, setCreating] = useState(match.candidates.length === 0);
  if (match.linked) {
    return <section aria-label="ลูกค้า" className="flex flex-wrap items-center gap-2 rounded-lg border p-3 text-sm">
      <Check className="h-4 w-4 text-success" aria-hidden /><span className="text-muted-foreground">ลูกค้า:</span><span className="font-medium">{match.linked.name}</span>
    </section>;
  }
  return <section aria-label="ลูกค้า" className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
    <h3 className="flex items-center gap-1.5 font-semibold"><Building2 className="h-4 w-4" aria-hidden />ลูกค้าของเรื่องนี้คือใคร</h3>
    {match.candidates.length > 0 && <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">พบลูกค้าเดิมในระบบ</p>
      {match.candidates.map((c) => <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-3 py-2">
        <span className="min-w-0"><span className="block break-words font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{reasonLabel[c.reason]}</span></span>
        <Button size="sm" disabled={busy} onClick={() => onLink({ clientId: c.id })}>ใช้ลูกค้านี้</Button>
      </div>)}
    </div>}
    {creating ? <div className="space-y-1.5">
      <p className="text-xs text-muted-foreground">{match.candidates.length ? 'หรือสร้างลูกค้าใหม่' : 'ยังไม่มีลูกค้านี้ในระบบ — สร้างให้เลยไหม? ผู้ส่งอีเมลจะเป็นผู้ติดต่อ'}</p>
      <div className="flex flex-wrap gap-2">
        <Input aria-label="ชื่อลูกค้าใหม่" value={name} onChange={(e) => setName(e.target.value)} className="min-w-0 flex-1" />
        <Button size="sm" disabled={busy || !name.trim()} onClick={() => onLink({ name: name.trim() })}>สร้างลูกค้าใหม่</Button>
      </div>
    </div> : <button type="button" className="text-xs text-primary underline" onClick={() => setCreating(true)}>ไม่ใช่ทั้งหมด — สร้างลูกค้าใหม่</button>}
  </section>;
}
