import type { StandupEntry, TaskRef } from '@lawfirm/shared';
import { formatDate } from '@/lib/utils';
import { bangkokTime } from '@/lib/bangkok';

const content = (tasks: TaskRef[], note: string | null) => [...tasks.map(t => t.title), ...(note ? [note] : [])].join('; ') || '—';
export function StandupHistory({ entries, name }: { entries: StandupEntry[]; name: string }) {
  return <section><h3 className="font-bold">เช็กอินของ{name}</h3><p className="text-sm text-muted-foreground">วันนี้และ 5 วันทำงานล่าสุด</p>{entries.length === 0 ? <p className="mt-4 text-sm text-muted-foreground">ยังไม่มีประวัติเช็กอิน</p> : <div className="mt-4 space-y-3 border-l-2 border-[var(--terra-border-d8eee1)] pl-4">{entries.map(entry => <article key={entry.day} className={`rounded-2xl border p-4 text-sm ${entry.blocker ? 'border-red-200 bg-red-50 text-red-950 dark:border-red-800 dark:bg-red-950 dark:text-red-100' : 'border-[var(--terra-border-eadbd2)] bg-[var(--terra-bg-fffaf7)]'}`}><p className="mb-2 font-bold">{formatDate(`${entry.day.slice(0, 10)}T00:00:00+07:00`, { day: 'numeric', month: 'short' })} · {bangkokTime(entry.updatedAt)}</p>{entry.status === 'SKIPPED' ? <p>ข้ามวันนี้</p> : <><p><b>เมื่อวาน:</b> {content(entry.yesterday, entry.yesterdayNote)}</p><p><b>วันนี้:</b> {content(entry.today, entry.todayNote)}</p><p><b>{entry.blocker ? 'ติดปัญหา' : 'สถานะ'}:</b> {entry.blocker || 'ไม่มี ทุกอย่างโอเค'}</p></>}</article>)}</div>}</section>;
}
