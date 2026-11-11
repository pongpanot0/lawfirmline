'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

export function WhoActsTabs({ tabs, value, onChange }: { tabs: { key: string; label: string; count: number }[]; value: string; onChange?: (key: string) => void }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const select = (key: string) => {
    const next = new URLSearchParams(params.toString());
    next.set('tab', key);
    router.replace(`${pathname}?${next}`, { scroll: false });
    onChange?.(key);
  };
  return <div role="tablist" aria-label="ผู้ดำเนินการถัดไป" className="flex overflow-x-auto border-b">{tabs.map((tab, index) => <button key={tab.key} type="button" role="tab" aria-selected={value === tab.key} tabIndex={value === tab.key ? 0 : -1} onClick={() => select(tab.key)} onKeyDown={(event) => { if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return; event.preventDefault(); const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length; select(tabs[next].key); (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus(); }} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 text-sm font-medium ${value === tab.key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'}`}>{tab.label}<span className="rounded-full bg-muted px-2 py-0.5 text-xs">{tab.count}</span></button>)}</div>;
}
