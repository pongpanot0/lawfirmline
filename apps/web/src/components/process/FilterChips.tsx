export function FilterChips({ items, value, onChange }: { items: { key: string; label: string; count: number }[]; value: string; onChange: (key: string) => void }) {
  return <div className="flex flex-wrap gap-2" aria-label="กรองขั้นคดี">{items.map((item) => <button key={item.key} type="button" aria-pressed={value === item.key} onClick={() => onChange(item.key)} className={`min-h-11 rounded-full px-4 text-sm ${value === item.key ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'}`}>{item.label} <span className="tabular-nums">{item.count}</span></button>)}</div>;
}
