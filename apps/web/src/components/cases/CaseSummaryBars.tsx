import { Card } from '@/components/ui/card';

/** Horizontal count bars for the cases table summary. One hue; the count is printed on each row. */
export function CaseSummaryBars({ title, hint, rows }: { title: string; hint: string; rows: { label: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((row) => row.count));
  const total = rows.reduce((sum, row) => sum + row.count, 0);
  return (
    <Card className="p-4 shadow-sm">
      <h3 className="text-sm font-semibold">{title}</h3>
      <p className="mb-3 text-xs text-muted-foreground">{hint}</p>
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.label} title={`${row.label}: ${row.count} คดี${total ? ` (${Math.round((row.count / total) * 100)}%)` : ''}`}
            className="grid grid-cols-[7.5rem_1fr_2rem] items-center gap-3 rounded-md text-sm hover:bg-muted/50">
            <span className="truncate text-muted-foreground">{row.label}</span>
            <span className="h-3 rounded-r bg-muted/60">
              <span className="block h-full rounded-r bg-primary" style={{ width: `${(row.count / max) * 100}%` }} />
            </span>
            <span className="text-right font-semibold tabular-nums">{row.count}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
