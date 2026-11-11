'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ClipboardCheck, Ellipsis, Send, SkipForward } from 'lucide-react';
import type { TaskItem } from '@/lib/api';
import v2 from './v2.module.css';

export function TasksRowMenu({ task, onOpen, onSkip }: { task: TaskItem; onOpen: (id: string) => void; onSkip: (task: TaskItem, reason: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); setSkipping(false); trigger.current?.focus(); return; }
    if (!open || !['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : event.key === 'ArrowDown' ? (index + 1) % nodes.length : (index <= 0 ? nodes.length - 1 : index - 1);
    nodes[next]?.focus();
  };
  const items = [
    { label: 'ส่งต่อให้คนอื่น', hint: 'เปลี่ยนคนทำ พร้อมโน้ตบอกต่อ', Icon: Send, action: () => onOpen(task.id) },
    { label: 'ส่งตรวจ', hint: 'ให้หัวหน้าตรวจก่อนปิดงาน', Icon: ClipboardCheck, action: () => onOpen(task.id) },
    { label: 'ข้ามงานนี้', hint: 'ไม่ต้องทำในคดีนี้ — ระบุเหตุผล', Icon: SkipForward, action: () => { setReason(''); setError(''); setSkipping(true); } },
  ];
  return <div ref={root} className="relative" onKeyDown={keyDown}>
    <button ref={trigger} type="button" aria-label={`ตัวเลือกของ ${task.title}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={`${v2.btn} ${v2.ghost}`}><Ellipsis aria-hidden="true" className="h-5 w-5" /></button>
    {open && <div role="menu" aria-label={`ตัวเลือกของ ${task.title}`} className="absolute right-0 z-50 mt-1 w-[min(90vw,300px)] rounded-xl border border-[#e2e0d8] bg-white p-2 shadow-2xl">{items.map(({ label, hint, Icon, action }) => <button key={label} type="button" role="menuitem" onClick={() => { setOpen(false); action(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f3f1ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><Icon aria-hidden="true" className="mt-1 h-5 w-5 shrink-0" /><span><b className="block">{label}</b><span className={`block ${v2.hint}`}>{hint}</span></span></button>)}</div>}
    {skipping && <form className="absolute right-0 z-40 mt-1 w-[min(90vw,300px)] space-y-2 rounded-xl border border-[#e2e0d8] bg-white p-3 shadow-2xl" onSubmit={(event) => { event.preventDefault(); if (reason.trim().length < 3 || busy) return; setBusy(true); setError(''); void onSkip(task, reason.trim()).then(() => { setSkipping(false); trigger.current?.focus(); }).catch((err: unknown) => setError(err instanceof Error ? err.message : 'ข้ามงานไม่สำเร็จ')).finally(() => setBusy(false)); }}><label className="block font-semibold">เหตุผลที่ข้ามงาน<textarea autoFocus required minLength={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} className={v2.field} /></label>{error && <p role="alert" className={v2.error}>{error}</p>}<div className="flex gap-2"><button type="submit" disabled={busy || reason.trim().length < 3} className={`${v2.btn} ${v2.primary} disabled:opacity-60`}>ยืนยัน</button><button type="button" onClick={() => { setSkipping(false); trigger.current?.focus(); }} className={`${v2.btn} ${v2.outline}`}>ยกเลิก</button></div></form>}
  </div>;
}
