'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';
import { useDashboardT } from '@/components/landing/LocaleProvider';

export default function CaseCalendarPage() {
  const d = useDashboardT();
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    const from = new Date(month.getFullYear(), month.getMonth() - 1, 1).toISOString();
    const to = new Date(month.getFullYear(), month.getMonth() + 2, 0).toISOString();
    setLoading(true);
    api
      .getCalendarEvents(token, { from, to })
      .then((all) => {
        setEvents(all.filter((e) => e.case?.id === id));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, id, month]);

  if (loading) return <p className="text-muted-foreground">{d.calendar.loading}</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" />
        {d.messages.backToCase.replace('← ', '')}
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold tracking-tight text-foreground">{d.caseCalendar.title}</h1>
      <CalendarView
        events={events}
        month={month}
        onMonthChange={setMonth}
        onEventClick={() => {}}
      />
    </div>
  );
}
