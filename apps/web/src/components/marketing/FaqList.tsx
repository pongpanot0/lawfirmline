export function FaqList({ items }: { items: [string, string][] }) {
  return (
    <div className="divide-y divide-mk-rule border-y border-mk-rule">
      {items.map(([q, a]) => (
        <details key={q} className="group py-5">
          <summary className="flex min-h-11 items-center justify-between gap-4 font-medium text-mk-ink">
            {q}
            <span className="chev text-mk-ink-2" aria-hidden="true">
              ⌄
            </span>
          </summary>
          <p className="mt-3 leading-relaxed text-mk-ink-2">{a}</p>
        </details>
      ))}
    </div>
  );
}
