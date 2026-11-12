'use client';

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Lists this long or longer get a type-to-search box; shorter ones stay a plain native select (better on phones). */
const SEARCH_FROM = 8;

type Opt = { value: string; label: string; disabled: boolean; group?: string };

// Display/width/margin/flex-item classes go on the wrapper; the rest style the control itself.
const LAYOUT = /^(-?(w-|min-w-|max-w-|flex-|shrink|grow|basis-|col-span|row-span|self-|order-|m[trblxy]?-)|block$|inline-block$|inline$|hidden$)/;
function splitClasses(className = '') {
  const layout: string[] = [];
  const control: string[] = [];
  for (const c of className.split(/\s+/).filter(Boolean)) (LAYOUT.test(c.split(':').pop()!) ? layout : control).push(c);
  return { layout: layout.join(' '), control: control.join(' ') };
}

const norm = (s: string) => s.toLocaleLowerCase('th').replace(/\s+/g, ' ').trim();

/**
 * Drop-in for `<select>`: same props, same `<option>` children, same `onChange(e)`.
 * The real select stays in the DOM (invisible once searchable), so `name`, `required`,
 * form submit and the Thai validity messages keep working. Picking from the list sets
 * the real select's value and fires a native change event, so callers see a normal event.
 */
export function Select({ className, children, id, onChange, disabled, autoFocus, title, ...props }:
  React.SelectHTMLAttributes<HTMLSelectElement>) {
  const selectRef = React.useRef<HTMLSelectElement>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);
  const listId = React.useId();
  const [snap, setSnap] = React.useState<{ options: Opt[]; value: string }>({ options: [], value: '' });
  const snapKey = React.useRef('');
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);

  // Read options from the DOM: children may be components (e.g. <AssigneeOptions/>), not bare <option>s.
  const sync = React.useCallback(() => {
    const sel = selectRef.current;
    if (!sel) return;
    const next = {
      value: sel.value,
      options: Array.from(sel.options).map((o) => ({
        value: o.value, label: o.text, disabled: o.disabled,
        group: o.parentElement instanceof HTMLOptGroupElement ? o.parentElement.label : undefined,
      })),
    };
    const key = JSON.stringify(next);
    if (key !== snapKey.current) { snapKey.current = key; setSnap(next); }
  }, []);
  React.useLayoutEffect(sync);

  const searchable = !props.multiple && snap.options.length >= SEARCH_FROM;
  const { layout, control } = splitClasses(className);
  const sized = /(^|[\s:])(w-|flex-1|flex-auto|grow|basis-)/.test(layout);
  const q = norm(query);
  const shown = q ? snap.options.filter((o) => norm(o.label).includes(q)) : snap.options;
  const selectedLabel = snap.options.find((o) => o.value === snap.value)?.label ?? '';

  React.useEffect(() => {
    if (open) listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const firstEnabled = (from: number, step: 1 | -1) => {
    for (let i = from; i >= 0 && i < shown.length; i += step) if (!shown[i].disabled) return i;
    return -1;
  };

  const openList = () => {
    if (disabled || open) return;
    setQuery('');
    setActive(Math.max(0, snap.options.findIndex((o) => o.value === snap.value)));
    setOpen(true);
  };

  const pick = (o: Opt) => {
    const sel = selectRef.current;
    if (!sel || o.disabled) return;
    setOpen(false);
    setQuery('');
    if (sel.value === o.value) return;
    // React only hears real events: set the native value, then dispatch change.
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(sel, o.value);
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) return openList();
      const step = e.key === 'ArrowDown' ? 1 : -1;
      const next = firstEnabled(active + step, step);
      if (next >= 0) setActive(next);
    } else if (e.key === 'Enter' && open) {
      e.preventDefault();
      if (shown[active]) pick(shown[active]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      e.stopPropagation(); // don't also close the drawer/dialog around us
      setOpen(false);
      setQuery('');
    } else if (e.key === 'Tab') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <span className={cn('relative inline-block', layout)}>
      {searchable && (
        <>
          <input
            ref={inputRef}
            id={id}
            type="text"
            role="combobox"
            autoComplete="off"
            autoFocus={autoFocus}
            title={title}
            disabled={disabled}
            aria-label={props['aria-label']}
            aria-labelledby={props['aria-labelledby']}
            aria-describedby={props['aria-describedby']}
            aria-invalid={props['aria-invalid']}
            aria-required={props.required || undefined}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && shown[active] ? `${listId}-${active}` : undefined}
            value={open ? query : selectedLabel}
            placeholder={open ? selectedLabel || 'พิมพ์เพื่อค้นหา' : undefined}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
              setOpen(true);
            }}
            onClick={openList}
            onFocus={openList}
            onBlur={() => { setOpen(false); setQuery(''); }}
            onKeyDown={onKeyDown}
            className={cn('cursor-text pr-8 disabled:cursor-not-allowed', sized && 'w-full', control)}
          />
          <ChevronDown aria-hidden="true" className="pointer-events-none absolute right-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          {open && (
            <ul
              ref={listRef}
              id={listId}
              role="listbox"
              className="absolute left-0 top-full z-50 mt-1 max-h-64 w-full min-w-[12rem] overflow-y-auto rounded-xl border border-border bg-card p-1 text-sm shadow-lg"
            >
              {shown.length === 0 && <li className="px-3 py-2 text-muted-foreground">ไม่พบตัวเลือกที่ตรงกับ “{query}”</li>}
              {shown.map((o, i) => (
                <React.Fragment key={`${o.group ?? ''}\u0000${o.value}\u0000${i}`}>
                  {o.group && o.group !== shown[i - 1]?.group && (
                    <li role="presentation" className="px-3 pb-1 pt-2 text-xs font-medium text-muted-foreground">{o.group}</li>
                  )}
                  <li
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={o.value === snap.value}
                    aria-disabled={o.disabled || undefined}
                    data-active={i === active}
                    onMouseDown={(e) => e.preventDefault()} // keep focus in the input
                    onMouseEnter={() => !o.disabled && setActive(i)}
                    onClick={() => pick(o)}
                    className={cn(
                      'cursor-pointer rounded-lg px-3 py-2',
                      i === active && 'bg-muted',
                      o.value === snap.value && 'font-medium text-primary',
                      o.disabled && 'cursor-not-allowed opacity-50',
                    )}
                  >
                    {o.label || '—'}
                  </li>
                </React.Fragment>
              ))}
            </ul>
          )}
        </>
      )}
      <select
        {...props}
        ref={selectRef}
        id={searchable ? undefined : id}
        disabled={disabled}
        autoFocus={searchable ? undefined : autoFocus}
        title={title}
        tabIndex={searchable ? -1 : props.tabIndex}
        aria-hidden={searchable || undefined}
        onChange={(e) => { onChange?.(e); sync(); }}
        className={searchable ? 'pointer-events-none absolute inset-0 h-full w-full opacity-0' : cn(sized && 'w-full', control)}
      >
        {children}
      </select>
    </span>
  );
}
