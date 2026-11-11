import type { ReactNode } from 'react';

export function NextActionCard({ eyebrow, action, footer, tone = 'default' }: { eyebrow: string; action: ReactNode; footer?: ReactNode; tone?: 'default' | 'overdue' | 'ready' | 'info' }) {
  const colors = { default: 'border-primary/20 bg-primary/5', overdue: 'border-destructive/30 bg-destructive/10', ready: 'border-success/30 bg-success/10', info: 'border-warning/30 bg-warning/10' };
  return <section className={`min-w-0 space-y-4 rounded-lg border p-4 shadow-md ${colors[tone]}`}><p className="text-sm font-semibold">{eyebrow}</p>{action}{footer && <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t pt-3 text-sm">{footer}</div>}</section>;
}
