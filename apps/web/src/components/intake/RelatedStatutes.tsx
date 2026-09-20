'use client';

import type { IntakePrecedentItem } from '@/lib/api';

/**
 * ข้อกฎหมายที่เกี่ยวข้อง — สรุปจาก cited_sections ของฎีกาที่ iApp คืนมา
 * (iApp ไม่มีบริการค้นตัวบทมาตราโดยตรง จึงสรุปจากมาตราที่แนวฎีกาอ้างแทน)
 * เรียงตามจำนวนฎีกาที่อ้างมาตรานั้น — มาตราที่โผล่บ่อยคือแกนข้อกฎหมายของรูปคดี
 */
export function RelatedStatutes({ precedents }: { precedents: IntakePrecedentItem[] }) {
  const counts = new Map<string, number>();
  for (const p of precedents) {
    for (const statute of p.citedStatutes ?? []) {
      const key = statute.trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  if (counts.size === 0) return null;

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);

  return (
    <div className="mt-3">
      <p className="text-sm font-medium">⚖️ ข้อกฎหมายที่แนวฎีกาอ้างถึง</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {sorted.map(([statute, count]) => (
          <span
            key={statute}
            className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-xs"
            title={`มีฎีกา ${count} ฉบับในผลค้นหาที่อ้างมาตรานี้`}
          >
            {statute}
            {count > 1 && <span className="ml-1 text-muted-foreground">×{count}</span>}
          </span>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        สรุปจากมาตราที่ฎีกาในผลค้นหาอ้างถึง — โปรดตรวจตัวบทจริงก่อนใช้อ้างอิง
      </p>
    </div>
  );
}
