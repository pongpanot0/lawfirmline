import type { ReactNode } from 'react';
export function StickyAdvanceBar({ children }: { children: ReactNode }) {
  return <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 border bg-background p-3 shadow-lg">{children}</div>;
}
