'use client';

import { Clock, Pin } from 'lucide-react';
import type { IntakePrecedentAnalysisItem } from '@/lib/api';

/**
 * ข้อเท็จจริง + ไทม์ไลน์ จากผลวิเคราะห์ AI — โครงสร้างอ่านไล่ได้
 * แทนที่จะเป็น prose ก้อนเดียว วิเคราะห์รุ่นเก่าไม่มีสองฟิลด์นี้ → ไม่แสดง
 */
export function AnalysisFactsTimeline({ analysis }: { analysis: IntakePrecedentAnalysisItem }) {
  const facts = analysis.factsList ?? [];
  const timeline = analysis.timeline ?? [];
  if (facts.length === 0 && timeline.length === 0) return null;

  return (
    <>
      {facts.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Pin className="h-4 w-4 text-muted-foreground" aria-hidden />
            ข้อเท็จจริงสำคัญ
          </p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>
      )}
      {timeline.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
            ไทม์ไลน์เหตุการณ์
          </p>
          <ol className="mt-2 space-y-1.5">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-28 shrink-0 font-medium tabular-nums text-muted-foreground sm:w-32">{item.date}</span>
                <span>{item.event}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
