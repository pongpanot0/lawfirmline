'use client';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import type { FeedbackRecipient } from '@/lib/api';

/** Who a LINE round goes to: everyone is ticked by default, untick to test on a few people first. */
export function RecipientPicker({
  people,
  selected,
  onChange,
}: {
  people: FeedbackRecipient[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const allRef = useRef<HTMLInputElement>(null);
  const all = selected.size === people.length;
  const none = selected.size === 0;

  // "Some ticked" has no HTML attribute; it is a DOM property.
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !all && !none;
  }, [all, none]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  }

  if (!people.length) return null;

  return (
    <div className="mb-4">
      <div className="flex min-h-11 items-center justify-between gap-3">
        {open ? (
          <label className="flex cursor-pointer items-center gap-2 text-sm font-medium">
            <input
              ref={allRef}
              type="checkbox"
              checked={all}
              onChange={() => onChange(all ? new Set() : new Set(people.map((person) => person.id)))}
              className="h-4 w-4 accent-primary"
            />
            เลือกทั้งหมด
          </label>
        ) : (
          <span />
        )}
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
          className={
            'inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-sm text-muted-foreground ' +
            'hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'
          }
        >
          {open ? <ChevronUp className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
          {open ? 'ซ่อนรายชื่อ' : `ดูรายชื่อ ${people.length} คน`}
        </button>
      </div>
      {open && (
        <ul className="max-h-72 overflow-y-auto rounded-lg border border-border bg-card" aria-label="ผู้รับแบบสอบถาม">
          {people.map((person) => (
            <li key={person.id} className="border-b border-border last:border-b-0">
              <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 hover:bg-muted">
                <input
                  type="checkbox"
                  checked={selected.has(person.id)}
                  onChange={() => toggle(person.id)}
                  className="h-4 w-4 shrink-0 accent-primary"
                />
                <span className="min-w-0 flex-1 truncate">{person.name}</span>
                {person.firm && <span className="shrink-0 text-sm text-muted-foreground">{person.firm}</span>}
              </label>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-sm text-muted-foreground">
        เลือก {selected.size} จาก {people.length} คน · ใช้ทดสอบส่งให้บางคนก่อนได้
      </p>
    </div>
  );
}
