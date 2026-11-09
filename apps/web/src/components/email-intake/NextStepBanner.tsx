import { Button } from '@/components/ui/button';

export function NextStepBanner({ next, onGo }: { next: { text: string; done: number; total: number }; onGo: () => void }) {
  return <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
    <div className="min-w-0"><p className="font-semibold"><span className="mr-2 text-primary">ขั้นต่อไป</span>{next.text}</p>
      <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground"><span>ความคืบหน้า</span><progress className="h-2 w-32 max-w-full accent-primary" value={next.done} max={next.total || 1} /><span>{next.done} / {next.total} รายการ</span></div>
    </div><Button size="sm" onClick={onGo}>ไปยังรายการที่ต้องดำเนินการ</Button>
  </div>;
}
