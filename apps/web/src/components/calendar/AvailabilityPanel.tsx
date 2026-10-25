'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { api, AvailabilityResult } from '@/lib/api';
import { bangkokInputValue } from '@/lib/bangkok';
import {
  WORK_END,
  WORK_START,
  blockPosition,
  findFirstFreeSlot,
  inputMinutes,
  minutesToTime,
  nextWorkingDays,
  overlapsAny,
  snapMinutes,
  toMinuteRange,
} from '@/lib/availability';
import { Button } from '@/components/ui/button';

const HOURS = [8, 10, 12, 14, 16, 18];
const SEARCH_DAYS = 5;

interface AvailabilityPanelProps {
  token: string;
  /** Bangkok day, YYYY-MM-DD. */
  date: string;
  /** Chosen start as a Bangkok `YYYY-MM-DDTHH:mm` value. */
  startAt: string;
  durationMin: number;
  userIds: string[];
  excludeEventId?: string | null;
  /** False while the event's time is locked: the panel then only shows. */
  canPick: boolean;
  onPick: (date: string, time: string) => void;
}

/** One row per person across 08:00-19:00 with busy blocks, the chosen slot, and a find-free-time button. */
export function AvailabilityPanel({
  token, date, startAt, durationMin, userIds, excludeEventId, canPick, onPick,
}: AvailabilityPanelProps) {
  const [data, setData] = useState<AvailabilityResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [finding, setFinding] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [holidays, setHolidays] = useState<Record<string, string>>({});
  const loadedYears = useRef(new Set<number>());
  const idsKey = userIds.join(',');

  /** Public holidays (date -> name) for the year of `date`, plus next year near New Year. Failure falls back to weekends only. */
  const loadHolidays = useCallback(async (): Promise<Record<string, string>> => {
    const year = Number(date.slice(0, 4));
    const years = date.slice(5, 7) === '12' ? [year, year + 1] : [year];
    const fresh = years.filter((y) => !loadedYears.current.has(y));
    if (fresh.length === 0) return holidaysRef.current;
    const found: Record<string, string> = {};
    await Promise.all(fresh.map((y) =>
      api.getPublicHolidays(token, y)
        .then((items) => {
          loadedYears.current.add(y);
          items.forEach((h) => { found[h.date.slice(0, 10)] = h.name; });
        })
        .catch(() => undefined)));
    holidaysRef.current = { ...holidaysRef.current, ...found };
    setHolidays(holidaysRef.current);
    return holidaysRef.current;
  }, [token, date]);
  const holidaysRef = useRef<Record<string, string>>({});

  useEffect(() => {
    void loadHolidays();
  }, [loadHolidays]);

  const fetchDay = useCallback(
    (day: string) => api.getAvailability(token, { userIds: idsKey.split(','), date: day, excludeEventId: excludeEventId ?? undefined }),
    [token, idsKey, excludeEventId],
  );

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchDay(date)
      .then((r) => !cancelled && setData(r))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : 'โหลดเวลาว่างไม่สำเร็จ'))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [fetchDay, date, retry]);

  const findFree = async () => {
    setFinding(true);
    setNotFound(false);
    setError('');
    try {
      const now = bangkokInputValue(new Date());
      const today = now.slice(0, 10);
      const nowMin = inputMinutes(now);
      const known = await loadHolidays();
      const skip = new Set(Object.keys(known));
      const days = nextWorkingDays(date, SEARCH_DAYS, skip);
      for (const day of skip.has(date) ? days : [date, ...days]) {
        const r = day === date && data ? data : await fetchDay(day);
        const busy = r.people.map((p) => p.busy.flatMap((b) => toMinuteRange(b, day) ?? []));
        const slot = findFirstFreeSlot(busy, durationMin, day === today ? nowMin : WORK_START);
        if (slot !== null) {
          onPick(day, minutesToTime(slot));
          return;
        }
      }
      setNotFound(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'โหลดเวลาว่างไม่สำเร็จ');
    } finally {
      setFinding(false);
    }
  };

  const slot = startAt.slice(0, 10) === date
    ? { start: inputMinutes(startAt), end: inputMinutes(startAt) + durationMin }
    : null;

  return (
    <div className="rounded-lg border border-input bg-card p-2 text-xs">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        {canPick && (
          <Button type="button" size="sm" disabled={finding || loading} onClick={findFree}>
            {finding ? 'กำลังค้นหา…' : 'หาเวลาที่ทุกคนว่าง'}
          </Button>
        )}
        {notFound && <span className="text-amber-700 dark:text-amber-400">ไม่พบช่วงที่ทุกคนว่างใน {SEARCH_DAYS} วันทำการ</span>}
        {canPick && !notFound && <span className="text-muted-foreground">หรือแตะบนแถบเวลาเพื่อเลือกเวลาเริ่ม</span>}
      </div>
      {holidays[date] && <p className="mb-2 text-amber-700 dark:text-amber-400">วันหยุด: {holidays[date]}</p>}
      {data?.hint && <p className="mb-2 text-muted-foreground">{data.hint}</p>}
      {error ? (
        <p role="alert" className="text-destructive">
          {error}{' '}
          <button type="button" className="min-h-11 font-medium underline" onClick={() => setRetry((n) => n + 1)}>ลองใหม่</button>
        </p>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[520px]">
            <div className="relative ms-28 h-4 text-muted-foreground">
              {HOURS.map((h) => (
                <span
                  key={h}
                  className="absolute -translate-x-1/2"
                  style={{ left: `${((h * 60 - WORK_START) / (WORK_END - WORK_START)) * 100}%` }}
                >
                  {h}:00
                </span>
              ))}
            </div>
            {loading && !data ? (
              <div className="ms-28 h-6 animate-pulse rounded bg-muted" aria-label="กำลังโหลด" />
            ) : (
              data?.people.map((p) => {
                const ranges = p.busy.map((b) => ({ b, r: toMinuteRange(b, date) })).filter((x) => x.r);
                const clash = !!slot && overlapsAny(slot, ranges.map((x) => x.r!));
                const slotPos = slot ? blockPosition(slot) : null;
                return (
                  <div key={p.userId} className={loading ? 'opacity-60' : ''}>
                    <div className="flex items-center py-0.5">
                      <span className="w-28 shrink-0 truncate pe-2" title={p.name}>{p.name}</span>
                      <div
                        className={`relative h-6 flex-1 rounded bg-emerald-50 dark:bg-emerald-950/30 ${canPick ? 'cursor-pointer' : ''}`}
                        onClick={(e) => {
                          if (!canPick) return;
                          const box = e.currentTarget.getBoundingClientRect();
                          onPick(date, minutesToTime(snapMinutes((e.clientX - box.left) / box.width)));
                        }}
                      >
                        {ranges.map(({ b, r }, i) => {
                          const pos = blockPosition(r!);
                          return pos && (
                            <div
                              key={i}
                              title={b.label}
                              className="absolute inset-y-0 rounded-sm bg-muted-foreground/40"
                              style={{ left: `${pos.left}%`, width: `${pos.width}%` }}
                            />
                          );
                        })}
                        {slotPos && (
                          <div
                            className={`pointer-events-none absolute inset-y-0 rounded-sm border-2 ${clash ? 'border-destructive' : 'border-primary'}`}
                            style={{ left: `${slotPos.left}%`, width: `${slotPos.width}%` }}
                          />
                        )}
                      </div>
                    </div>
                    {clash && <p className="ms-28 text-destructive">ชนกับนัดของ {p.name}</p>}
                    {p.source === 'SYSTEM_ONLY' && (
                      <p className="ms-28 text-muted-foreground">(ไม่ได้เชื่อม Outlook — เห็นแค่นัดในระบบ)</p>
                    )}
                    {p.error && <p className="ms-28 text-amber-700 dark:text-amber-400">{p.error}</p>}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
