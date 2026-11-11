'use client';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Link from 'next/link';
import { Ellipsis, type LucideIcon } from 'lucide-react';
import v2 from './v2.module.css';

type Item = { label: string; hint: string; icon: LucideIcon; href?: string; onClick?: () => void; separator?: boolean; disabled?: boolean };
export function CaseMoreMenu({ items }: { items: Item[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    root.current?.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus();
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [open]);
  const keyDown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nodes = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? []);
    if (!nodes.length) return;
    const index = nodes.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? nodes.length - 1 : event.key === 'ArrowDown' ? (index + 1) % nodes.length : (index <= 0 ? nodes.length - 1 : index - 1);
    nodes[next]?.focus();
  };
  return <div ref={root} className="relative" onKeyDown={keyDown}>
    <button ref={trigger} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)} className={`${v2.btn} ${v2.outline} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}><Ellipsis aria-hidden="true" className="h-[1.1em] w-[1.1em]" />อื่น ๆ</button>
    {open && <div role="menu" aria-label="อื่น ๆ" className="absolute right-0 z-50 mt-1 max-h-[70vh] w-[min(90vw,360px)] overflow-auto rounded-xl border border-border bg-white p-2 shadow-2xl">{items.map(({ label, hint, icon: Icon, href, onClick, separator, disabled }) => {
      const content = <><Icon aria-hidden="true" className="mt-1 h-[1.1em] w-[1.1em] shrink-0" /><span><strong className="block">{label}</strong><span className={`block font-normal ${v2.hint}`}>{hint}</span></span></>;
      const className = 'flex min-h-11 w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#f3f1ea] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50';
      return <div key={label}>{separator && <div role="separator" className="my-1 border-t" />}{href ? <Link id={label === 'ถาม AI เรื่องคดีนี้' ? 'case-tab-ask-ai' : undefined} role="menuitem" href={href} onClick={() => setOpen(false)} className={className}>{content}</Link> : <button role="menuitem" type="button" disabled={disabled} onClick={() => { setOpen(false); onClick?.(); }} className={className}>{content}</button>}</div>;
    })}</div>}
  </div>;
}
