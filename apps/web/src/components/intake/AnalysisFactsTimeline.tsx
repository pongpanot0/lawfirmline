'use client';

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
          <p className="text-sm font-medium">📌 ข้อเท็จจริงสำคัญ</p>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
            {facts.map((fact, i) => (
              <li key={i}>{fact}</li>
            ))}
          </ul>
        </div>
      )}
      {timeline.length > 0 && (
        <div className="border-t border-border pt-3">
          <p className="text-sm font-medium">🕐 ไทม์ไลน์เหตุการณ์</p>
          <ol className="mt-2 space-y-1.5">
            {timeline.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="w-32 shrink-0 font-medium text-muted-foreground">{item.date}</span>
                <span>{item.event}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
    </>
  );
}
