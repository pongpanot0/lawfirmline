export function CheckoutSteps({ steps }: { steps: { title: string; state: 'done' | 'current' | 'todo' }[] }) {
  return <nav aria-label="ขั้นตอนการบันทึก" className="z-10 mb-4 rounded-lg border bg-card p-3 md:sticky md:top-0">
    <ol className="flex flex-col gap-2 sm:flex-row sm:justify-between">{steps.map((step, i) => <li key={step.title} aria-current={step.state === 'current' ? 'step' : undefined} className={`flex items-center gap-2 text-sm ${step.state === 'todo' ? 'text-muted-foreground' : 'text-foreground'} ${step.state === 'current' ? 'font-bold' : ''}`}><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs ${step.state === 'todo' ? 'border border-border' : 'bg-primary text-primary-foreground'}`}>{step.state === 'done' ? '✓' : i + 1}</span>{step.title}</li>)}</ol>
  </nav>;
}
