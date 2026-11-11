import type { ReactNode } from 'react';
export function NextActionCard({ current, total, action, children, footer }: { current: number; total: number; action: ReactNode; children?: ReactNode; footer?: ReactNode }) {
  return <section className="space-y-4 rounded-lg border bg-card p-4"><h2 className="font-semibold">สิ่งที่ต้องทำตอนนี้ ({current} จาก {total})</h2>{action}{children && <details><summary className="min-h-11 cursor-pointer py-3">งานอื่นในขั้นนี้</summary>{children}</details>}{footer && <div className="border-t pt-3 text-sm text-muted-foreground">{footer}</div>}</section>;
}
