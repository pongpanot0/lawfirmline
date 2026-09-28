'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Gavel } from 'lucide-react';
import { HEAVY_DAY_POINTS, HEAVY_QUEUE_POINTS, TeamRadar as Radar, TeamRadarDay } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button } from '@/components/ui/button';
import { ROLE_LABELS } from '@/lib/daily-workboard';
import { PersonWorkloadDrawer } from './PersonWorkloadDrawer';

const shiftDay = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const dayLabel = (day: string) => new Date(`${day}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' });
const isWeekend = (day: string) => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());

function cellTone(day: TeamRadarDay) {
  if (day.onLeave) return 'bg-muted text-muted-foreground';
  if (day.points > HEAVY_DAY_POINTS) return 'bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200';
  if (day.points > HEAVY_DAY_POINTS / 2) return 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200';
  if (day.points > 0) return 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200';
  return '';
}

/** One screen answering "who is busy this week": planned work points, hearings, and leave per person per day. */
export function TeamRadar() {
  const { token } = useAuth();
  const [start, setStart] = useState(() => bangkokDateInputValue(new Date()));
  const [radar, setRadar] = useState<Radar | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [person, setPerson] = useState<{ id: string; day: string | null } | null>(null);
  const requestVersion = useRef(0);

  const load = useCallback(async () => {
    if (!token) return;
    const version = ++requestVersion.current;
    setLoading(true); setError('');
    try {
      const data = await api.getTeamRadar(token, start);
      if (version === requestVersion.current) setRadar(data);
    } catch (err) { if (version === requestVersion.current) setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่ได้'); }
    finally { if (version === requestVersion.current) setLoading(false); }
  }, [token, start]);
  useEffect(() => { void load(); }, [load]);
  const closePerson = useCallback(() => setPerson(null), []);

  const today = bangkokDateInputValue(new Date());
  const members = radar ? [...radar.members].sort((a, b) => b.openPoints - a.openPoints) : [];

  return <section className="space-y-4">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className="text-xl font-semibold">สัปดาห์นี้ใครยุ่งแค่ไหน</h2>
        <p className="mt-1 text-sm text-muted-foreground">แต้มงานตามวันที่วางแผนทำ (หรือวันส่ง) · กดช่องวันเพื่อดูงานวันนั้น · กดชื่อเพื่อดูงานทั้งหมด</p>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon" aria-label="สัปดาห์ก่อน" disabled={loading} onClick={() => setStart((s) => shiftDay(s, -7))}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="outline" disabled={loading || start === today} onClick={() => setStart(today)}>วันนี้</Button>
        <Button variant="outline" size="icon" aria-label="สัปดาห์ถัดไป" disabled={loading} onClick={() => setStart((s) => shiftDay(s, 7))}><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </div>

    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
      <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-50 ring-1 ring-emerald-200" />เบา</span>
      <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" />ปานกลาง</span>
      <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-red-100" />แน่น (เกิน {HEAVY_DAY_POINTS} แต้ม/วัน)</span>
      <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-muted" />ลา</span>
      <span className="flex items-center gap-1"><Gavel className="h-3 w-3" />นัดหมาย/ศาล</span>
      <span>แต้ม: เล็ก 1 · กลาง 2 · ใหญ่ 4</span>
    </div>

    {error && <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}<Button variant="ghost" className="ml-2" onClick={() => void load()}>ลองใหม่</Button></div>}
    {loading && !radar && <p role="status" className="text-sm text-muted-foreground">กำลังโหลดภาพรวมทีม…</p>}

    {radar && <div className="overflow-x-auto rounded-xl border">
      <table className="w-full min-w-[760px] border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/40 text-xs text-muted-foreground">
            <th scope="col" className="w-56 px-3 py-2 text-left font-medium">คนในทีม</th>
            {radar.days.map((day) => <th key={day} scope="col" className={`px-1 py-2 text-center font-medium ${day === today ? 'text-primary' : ''} ${isWeekend(day) ? 'opacity-60' : ''}`}>{dayLabel(day)}</th>)}
          </tr>
        </thead>
        <tbody>
          {members.map((m) => <tr key={m.userId} className="border-b last:border-0">
            <th scope="row" className="px-3 py-2 text-left font-normal">
              <button type="button" onClick={() => setPerson({ id: m.userId, day: null })} className="block w-full text-left hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <span className="block font-medium">{m.firstName} {m.lastName}</span>
                <span className="block text-xs text-muted-foreground">{ROLE_LABELS[m.role] ?? m.role}</span>
                <span className="mt-1 flex flex-wrap gap-x-2 text-xs">
                  <span className={m.openPoints > HEAVY_QUEUE_POINTS ? 'font-semibold text-destructive' : 'text-muted-foreground'}>{m.openCount} งาน · {m.openPoints} แต้ม</span>
                  {m.overdueCount > 0 && <span className="text-destructive">เลยกำหนด {m.overdueCount}</span>}
                  {m.reviewCount > 0 && <span className="text-amber-700">รอตรวจ {m.reviewCount}</span>}
                  {m.unscheduledCount > 0 && <span className="text-muted-foreground">ไม่มีวัน {m.unscheduledCount}</span>}
                </span>
              </button>
            </th>
            {m.days.map((day) => <td key={day.date} className="p-1">
              <button type="button" onClick={() => setPerson({ id: m.userId, day: day.date })}
                aria-label={`${m.firstName} ${dayLabel(day.date)}: ${day.onLeave ? 'ลา' : `${day.taskCount} งาน ${day.points} แต้ม นัด ${day.eventCount}`}`}
                className={`flex h-14 w-full flex-col items-center justify-center rounded-md text-xs ring-primary/40 transition hover:ring-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${cellTone(day)} ${isWeekend(day.date) && !day.points && !day.eventCount && !day.onLeave ? 'opacity-50' : ''}`}>
                {day.onLeave ? <span className="font-medium">ลา</span> : <>
                  {day.points > 0 && <span className="text-sm font-semibold">{day.points}</span>}
                  {day.eventCount > 0 && <span className="flex items-center gap-0.5"><Gavel className="h-3 w-3" />{day.eventCount}</span>}
                  {!day.points && !day.eventCount && <span className="text-muted-foreground/50">–</span>}
                </>}
              </button>
            </td>)}
          </tr>)}
        </tbody>
      </table>
    </div>}

    <PersonWorkloadDrawer userId={person?.id ?? null} focusDay={person?.day} from={radar?.start} onClose={closePerson} onChanged={() => void load()} />
  </section>;
}
