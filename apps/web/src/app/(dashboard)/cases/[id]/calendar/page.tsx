'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { api, CalendarEventItem } from '@/lib/api';
import { CalendarView } from '@/components/CalendarView';

export default function CaseCalendarPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const [events, setEvents] = useState<CalendarEventItem[]>([]);
  const [month, setMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api
      .getCalendarEvents(token)
      .then((all) => {
        setEvents(all.filter((e) => e.case?.id === id));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) return <p className="text-slate-500">Loading calendar...</p>;

  return (
    <div>
      <Link href={`/cases/${id}`} className="text-sm text-brand-600 hover:underline">
        ← Back to case
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold text-slate-900">Case Calendar</h1>
      <CalendarView
        events={events}
        month={month}
        onMonthChange={setMonth}
        onEventClick={() => {}}
      />
    </div>
  );
}
