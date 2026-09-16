'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { UserItem } from '@/lib/api';

/**
 * Dropdown that reads like a select but allows picking several people:
 * a button showing the current picks, opening a checkbox list.
 */
export function MultiUserSelect({
  users,
  value,
  onChange,
  placeholder,
  renderExtra,
  disabled,
}: {
  users: UserItem[];
  value: string[];
  onChange: (ids: string[]) => void;
  placeholder: string;
  /** Optional per-user note (e.g. workload) shown under the name. */
  renderExtra?: (u: UserItem) => string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selected = users.filter((u) => value.includes(u.id));
  const label =
    selected.length === 0
      ? placeholder
      : selected.map((u) => `${u.firstName} ${u.lastName}`).join(', ');

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 rounded-lg border border-input bg-background px-3 py-2 text-left text-sm disabled:opacity-50"
      >
        <span className={selected.length === 0 ? 'text-muted-foreground' : undefined}>{label}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      {open && (
        <div
          role="listbox"
          aria-multiselectable="true"
          className="absolute z-40 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {users.length === 0 && (
            <p className="px-3 py-2 text-sm text-muted-foreground">{placeholder}</p>
          )}
          {users.map((u) => (
            <label
              key={u.id}
              className="flex cursor-pointer items-start gap-2 rounded-lg px-3 py-2 text-sm hover:bg-muted"
            >
              <input
                type="checkbox"
                className="mt-0.5"
                checked={value.includes(u.id)}
                onChange={() =>
                  onChange(value.includes(u.id) ? value.filter((x) => x !== u.id) : [...value, u.id])
                }
              />
              <span>
                {u.firstName} {u.lastName}
                {renderExtra && (
                  <span className="block text-xs text-muted-foreground">{renderExtra(u)}</span>
                )}
              </span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
