import { Sparkles } from 'lucide-react';
import type { EmailIntakeAiSummary } from '@/lib/api';
import { Badge } from '@/components/ui/badge';

const urgencyLabel = { HIGH: 'ด่วน', NORMAL: 'ปกติ', LOW: 'ไม่เร่ง' } as const;
const urgencyVariant = { HIGH: 'destructive', NORMAL: 'muted', LOW: 'muted' } as const;

/** AI's reading notes: shown for orientation only; values still go through the proposals below. */
export function AiSummaryCard({ summary }: { summary: EmailIntakeAiSummary }) {
  return <section aria-label="AI สรุปอีเมล" className="mb-3 space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h3 className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4 text-primary" aria-hidden />AI สรุป</h3>
      <Badge variant={urgencyVariant[summary.urgency]}>ความเร่งด่วน: {urgencyLabel[summary.urgency]}</Badge>
    </div>
    {summary.urgencyReason && <p className="text-xs text-muted-foreground">{summary.urgencyReason}</p>}
    {summary.clientRequest && <div><p className="text-xs font-medium text-muted-foreground">ลูกความขอให้ทำอะไร</p><p className="break-words">{summary.clientRequest}</p></div>}
    {summary.overview.length > 0 && <div><p className="text-xs font-medium text-muted-foreground">สาระสำคัญ</p><ul className="list-disc space-y-0.5 pl-5">{summary.overview.map((line, i) => <li key={i} className="break-words">{line}</li>)}</ul></div>}
    {summary.nextActions.length > 0 && <div><p className="text-xs font-medium text-muted-foreground">ทนายควรทำต่อ</p><ol className="list-decimal space-y-0.5 pl-5">{summary.nextActions.map((line, i) => <li key={i} className="break-words">{line}</li>)}</ol></div>}
    <p className="text-xs text-muted-foreground">AI สรุปจากอีเมลและไฟล์ — ตรวจกับต้นฉบับก่อนใช้ ข้อมูลที่จะบันทึกอยู่ในรายการด้านล่าง</p>
  </section>;
}
