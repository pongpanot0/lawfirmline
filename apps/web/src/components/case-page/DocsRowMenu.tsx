'use client';

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import v2 from './v2.module.css';

type Item = { label: string; hint: string; icon: LucideIcon; onClick: () => void; disabled?: boolean };
export function DocsRowMenu({ name, items }: { name: string; items: Item[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    nodes[event.key === 'ArrowDown' ? (index + 1) % nodes.length : (index <= 0 ? nodes.length - 1 : index - 1)]?.focus();
  };
  if (!items.length) return null;
  return <div ref={root} className="relative" onKeyDown={keyDown}>
    <button ref={trigger} type="button" aria-label={`ตัวเลือกของ ${name}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={`${v2.btn} ${v2.ghost}`}><Ellipsis aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>
    {open && <div role="menu" aria-label={`ตัวเลือกของ ${name}`} className="absolute right-0 z-50 mt-1 w-[min(90vw,310px)] rounded-xl border border-[#e2e0d8] bg-white p-2 shadow-2xl">{items.map(({ label, hint, icon: Icon, onClick, disabled }) => <button key={label} role="menuitem" type="button" disabled={disabled} onClick={() => { setOpen(false); onClick(); }} className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f3f1ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"><Icon aria-hidden="true" className="mt-1 h-[1.1em] w-[1.1em] shrink-0" /><span><b className="block">{label}</b><span className={`block ${v2.hint}`}>{hint}</span></span></button>)}</div>}
  </div>;
}
