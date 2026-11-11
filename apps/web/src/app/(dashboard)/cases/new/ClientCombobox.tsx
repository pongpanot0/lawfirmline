'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { ClientItem } from '@/lib/api';
import styles from '@/components/case-page/v2.module.css';
import { cn } from '@/lib/utils';

interface ClientComboboxProps {
  id?: string;
  clients: ClientItem[];
  /** Selected client id, or '' when the case just carries a typed name. */
  clientId: string;
  /** The name to show — either the selected client's, or free-typed text. */
  clientName: string;
  disabled?: boolean;
  onSelectClient: (client: ClientItem) => void;
  onFreeText: (name: string) => void;
}

/**
 * One field for "search an existing client, or type a name that isn't in
 * the list yet" — replacing what used to be a search box, a select, and a
 * free-text input stacked on top of each other for the same value.
 */
export function ClientCombobox({
  id,
  clients,
  clientId,
  clientName,
  disabled,
  onSelectClient,
  onFreeText,
}: ClientComboboxProps) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(clientName);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  // A client picked (or cleared) elsewhere — e.g. the case-type step resets
  // the form — should be reflected here without the user retyping.
  useEffect(() => {
    setQuery(clientName);
  }, [clientId, clientName]);

  const matches = query.trim()
    ? clients.filter((c) => c.name.toLowerCase().includes(query.trim().toLowerCase()))
    : clients;
  const exactMatch = clients.some((c) => c.name.toLowerCase() === query.trim().toLowerCase());
  const visibleMatches = matches.slice(0, 8);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const pick = (client: ClientItem) => {
    onSelectClient(client);
    setQuery(client.name);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        className={`${styles.field} focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        value={query}
        placeholder="พิมพ์ชื่อเพื่อค้นหา"
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          const value = e.target.value;
          setQuery(value);
          setOpen(true);
          setHighlight(0);
          // Every keystroke is also a candidate free-text name; picking a
          // suggestion below overwrites this with the matched client.
          onFreeText(value);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHighlight((i) => Math.min(i + 1, visibleMatches.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHighlight((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && visibleMatches[highlight]) {
            e.preventDefault();
            pick(visibleMatches[highlight]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && !disabled && (
        <ul
          id={listId}
          role="listbox"
          className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-[#c9ccc6] bg-white py-1 shadow-lg"
        >
          {visibleMatches.length === 0 && (
            <li className="px-3 py-2 text-muted-foreground">
              ไม่พบชื่อนี้ในรายชื่อ — ระบบจะเพิ่มเป็นลูกความใหม่เมื่อสร้างคดี
            </li>
          )}
          {visibleMatches.map((c, i) => (
            <li key={c.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                className={cn(
                  'block min-h-11 w-full px-3 py-2.5 text-left text-foreground hover:bg-[#eeebe3]',
                  i === highlight && 'bg-[#eeebe3] font-semibold',
                )}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                {c.name}
              </button>
            </li>
          ))}
          {query.trim() && !exactMatch && (
            <li className="border-t px-3 py-2 text-xs text-muted-foreground">
              ชื่อ “{query.trim()}” จะถูกเพิ่มเป็นลูกความใหม่
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
