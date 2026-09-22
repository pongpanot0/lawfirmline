'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { EventType } from '@lawfirm/shared';
import { X } from 'lucide-react';
import { api, CalendarEventItem, CaseDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/misc';

/** Select once, then use the same preparation/outcome workspace from every entry point. */
export function RecordHearingOutcomeDialog({
  legalCase,
  onClose,
}: {
  legalCase: CaseDetail;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const { token } = useAuth();
  const { locale } = useLocale();
  const th = locale === 'th';
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(false);
    try {
      const all = await api.getCalendarEvents(token, {
        from: new Date(Date.now() - 365 * 86400000).toISOString(),
      });
      setEvents(
        all
          .filter(
            (event) =>
              event.case?.id === legalCase.id &&
              event.type === EventType.COURT_DATE,
          )
          .sort(
            (a, b) =>
              Math.abs(new Date(a.startAt).getTime() - Date.now()) -
              Math.abs(new Date(b.startAt).getTime() - Date.now()),
          ),
      );
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [token, legalCase.id]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <Modal open onClose={onClose} className="max-w-lg">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-lg font-semibold">
          {th ? 'เลือกนัดศาล' : 'Choose a court appointment'}
        </h2>
        <button
          aria-label={th ? 'ปิดหน้าต่างเลือกนัดศาล' : 'Close appointment picker'}
          className="-mr-2 -mt-2 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onClick={onClose}
          type="button"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        {th
          ? 'เปิดแฟ้มของนัด เพื่อเตรียมเอกสารหรือบันทึกผลและงานต่อ'
          : 'Open the appointment file to prepare documents or record the outcome and next steps.'}
      </p>
      {loading ? (
        <p role="status" className="py-6">
          {th ? 'กำลังโหลด…' : 'Loading…'}
        </p>
      ) : error ? (
        <div className="py-4">
          <p role="alert">
            {th ? 'โหลดนัดไม่สำเร็จ' : 'Unable to load appointments'}
          </p>
          <Button variant="outline" onClick={load}>
            {th ? 'ลองใหม่' : 'Retry'}
          </Button>
        </div>
      ) : (
        <ul className="my-4 divide-y">
          {events.length ? (
            events.map((event) => (
              <li key={event.id}>
                <Link
                  className="block rounded-lg px-2 py-3 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  href={`/court-day/${event.id}`}
                >
                  <span className="block text-sm font-medium">
                    {event.title}
                  </span>
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {new Intl.DateTimeFormat(th ? 'th-TH' : 'en-GB', {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                      timeZone: 'Asia/Bangkok',
                    }).format(new Date(event.startAt))}
                  </span>
                </Link>
              </li>
            ))
          ) : (
            <li className="py-4 text-sm text-muted-foreground">
              {th
                ? 'ยังไม่มีนัดศาลในช่วงนี้ เพิ่มนัดในปฏิทินคดีก่อน'
                : 'No court appointments in this period. Add one to the case calendar first.'}
            </li>
          )}
        </ul>
      )}
      <Button variant="outline" className="min-h-11" onClick={onClose}>
        {th ? 'ปิด' : 'Close'}
      </Button>
    </Modal>
  );
}
