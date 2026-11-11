'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type AssigneeLoad } from '@/lib/api';
import { ROLE_LABELS } from '@/lib/daily-workboard';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';
import styles from '@/components/case-page/v2.module.css';

export function OwnerPicker({ token, value, onChange, onResolvedName, currentUserId, locked, lockedHint, id }: {
  token: string; value: string; onChange: (id: string) => void; onResolvedName?: (name: string | null) => void; currentUserId?: string; locked?: boolean; lockedHint?: string; id?: string;
}) {
  const [rows, setRows] = useState<AssigneeLoad[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let active = true; setFailed(false); setRows(null);
    api.getAssignees(token).then((data) => { if (active) setRows(data); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [token, retry]);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', outside); return () => document.removeEventListener('mousedown', outside);
  }, []);
  const filtered = rows?.filter((row) => `${row.firstName} ${row.lastName}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) ?? [];
  const selected = rows?.find((row) => row.userId === value);
  const selectedName = selected ? `${selected.firstName} ${selected.lastName}` : null;
  useEffect(() => { onResolvedName?.(selectedName); }, [selectedName]); // eslint-disable-line react-hooks/exhaustive-deps
  const choose = (row: AssigneeLoad) => { onChange(row.userId); setOpen(false); setQuery(''); root.current?.querySelector<HTMLButtonElement>('button')?.focus(); };
  const keyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); root.current?.querySelector<HTMLButtonElement>('button')?.focus(); }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); setOpen(true); setIndex((i) => Math.max(0, Math.min(filtered.length - 1, i + (event.key === 'ArrowDown' ? 1 : -1)))); }
    if (event.key === 'Enter' && open && filtered[index]) { event.preventDefault(); choose(filtered[index]); }
  };
  const initials = (row: AssigneeLoad) => `${row.firstName.charAt(0)}${row.lastName.charAt(0)}`;
  const leave = (row: AssigneeLoad) => row.leave ? `ลา ${new Date(`${row.leave.startDate}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}–${new Date(`${row.leave.endDate}T12:00:00+07:00`).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' })}` : '';
  return <div ref={root} className="relative mt-1" onKeyDown={keyDown}>
    <button id={id} type="button" disabled={locked} aria-haspopup="listbox" aria-expanded={open} onClick={() => { setOpen(!open); setIndex(0); }} className={`${styles.field} flex items-center gap-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60`}>
      {selected ? <><span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-full bg-[#243c50] text-xs text-white">{initials(selected)}</span><b>{selected.firstName} {selected.lastName}{selected.userId === currentUserId ? ' (ฉัน)' : ''}</b><span className={styles.label}>· มีคดีอยู่ {selected.openCaseCount}</span></> : rows ? 'เลือกเจ้าของคดี' : failed ? 'โหลดรายชื่อไม่สำเร็จ ลองโหลดหน้าใหม่' : 'กำลังโหลดรายชื่อ…'}
    </button>
    {locked && lockedHint && <p className="mt-1 text-xs text-muted-foreground">{lockedHint}</p>}
    {open && <div className="absolute z-30 mt-1 w-full rounded-lg border bg-card p-2 shadow-lg">
      <input autoFocus aria-label="ค้นหาผู้รับผิดชอบ" value={query} onChange={(e) => { setQuery(e.target.value); setIndex(0); }} placeholder="ค้นหาชื่อ" className="min-h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
      {!rows && !failed && <div aria-label="กำลังโหลดรายชื่อ" aria-busy="true" className="space-y-2 p-2">{[1, 2, 3].map((n) => <div key={n} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div>}
      {failed && <div role="alert" className="p-2 text-sm text-destructive">โหลดรายชื่อไม่สำเร็จ ลองโหลดหน้าใหม่ <Button type="button" variant="outline" onClick={() => setRetry((n) => n + 1)}>ลองใหม่</Button></div>}
      {rows && <div role="listbox" aria-label="ผู้รับผิดชอบ" className="max-h-72 overflow-y-auto">{filtered.length === 0 ? <p className="p-3 text-sm text-muted-foreground">ไม่พบชื่อนี้ในสำนักงาน</p> : filtered.map((row, i) => <button type="button" role="option" aria-selected={row.userId === value} key={row.userId} onMouseEnter={() => setIndex(i)} onClick={() => choose(row)} className={`min-h-11 w-full rounded-lg p-3 text-left text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:bg-accent ${i === index ? 'bg-accent/50' : ''}`}>
        <span aria-hidden="true" className="mr-2 inline-flex size-8 items-center justify-center rounded-full bg-muted text-xs">{initials(row)}</span><span className="font-medium">{row.firstName} {row.lastName}{row.userId === currentUserId ? ' (ฉัน)' : ''}</span> <span className="rounded border px-1 text-xs">{ROLE_LABELS[row.firmRole] ?? row.firmRole}</span>{row.userId === value && <><Check aria-hidden="true" className="inline h-[1.1em] w-[1.1em]" /> ปัจจุบัน</>}<br /><span className="text-muted-foreground">เปิดอยู่ {row.openCaseCount} · </span><span className={row.overdueTaskCount ? 'text-destructive' : 'text-muted-foreground'}>เลยกำหนด {row.overdueTaskCount}</span>{row.leave && <span className="ml-2 rounded border px-1 text-xs">{leave(row)}</span>}
      </button>)}</div>}
      <p className="border-t p-2 text-xs text-muted-foreground">ใช้ปุ่มลูกศรเพื่อเลื่อน และกด Enter เพื่อเลือก · Esc เพื่อปิด</p>
    </div>}
  </div>;
}
