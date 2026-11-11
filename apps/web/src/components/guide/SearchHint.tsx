import { Lightbulb } from 'lucide-react';

/** คำแนะนำใต้ช่องค้นหา — ผูกกับช่องด้วย aria-describedby={id} เพื่อให้โปรแกรมอ่านหน้าจออ่านด้วย */
export function SearchHint({ id, children, className = '' }: { id: string; children?: React.ReactNode; className?: string }) {
  if (!children) return null;
  return <p id={id} className={`flex basis-full items-center gap-1.5 text-xs text-muted-foreground ${className}`}><Lightbulb className="h-3.5 w-3.5 shrink-0" aria-hidden />{children}</p>;
}
