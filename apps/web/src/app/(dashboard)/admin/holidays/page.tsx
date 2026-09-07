'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, PublicHolidayItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';

/** Buddhist-era label for a Gregorian year. */
const toBE = (year: number) => year + 543;

function weekdayLabel(date: string) {
  return new Intl.DateTimeFormat('th-TH', { timeZone: 'UTC', weekday: 'short' }).format(
    new Date(date),
  );
}

export default function HolidaysPage() {
  const { token, user } = useAuth();
  const d = useDashboardT();
  const thisYear = new Date().getUTCFullYear();
  const [year, setYear] = useState(thisYear);
  const [holidays, setHolidays] = useState<PublicHolidayItem[]>([]);
  const [form, setForm] = useState({ date: '', name: '' });
  const [error, setError] = useState('');

  const load = useCallback(
    (targetYear: number) => {
      if (!token) return;
      api.getPublicHolidays(token, targetYear).then(setHolidays).catch(console.error);
    },
    [token],
  );

  useEffect(() => {
    load(year);
  }, [load, year]);

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">Access denied. Admin only. / ไม่มีสิทธิ์เข้าถึง เฉพาะ Admin</p>;
  }

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    try {
      await api.addPublicHoliday(token, form);
      setForm({ date: '', name: '' });
      load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.holidays.saveFailed);
    }
  };

  const handleDelete = async (holiday: PublicHolidayItem) => {
    if (!token || !window.confirm(d.holidays.confirmDelete)) return;
    setError('');
    try {
      await api.deletePublicHoliday(token, holiday.id);
      load(year);
    } catch {
      setError(d.holidays.saveFailed);
    }
  };

  return (
    <div>
      <PageHeader title={d.holidays.title} description={d.holidays.description} />

      <Card className="mb-4 border-amber-500/40 bg-amber-500/5">
        <CardContent className="flex items-start gap-2 py-3 text-sm">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
          <span>{d.holidays.reviewNotice}</span>
        </CardContent>
      </Card>

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <label className="text-sm">
            <span className="mb-1 block text-muted-foreground">{d.holidays.year}</span>
            <select
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
            >
              {[thisYear - 1, thisYear, thisYear + 1].map((y) => (
                <option key={y} value={y}>
                  {toBE(y)} ({y})
                </option>
              ))}
            </select>
          </label>

          <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">{d.holidays.date}</span>
              <Input
                type="date"
                required
                value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })}
              />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-muted-foreground">{d.holidays.name}</span>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <Button type="submit" size="sm">
              <Plus className="size-4" />
              {d.holidays.add}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {holidays.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.holidays.empty}</p>
          ) : (
            <ul className="divide-y divide-border">
              {holidays.map((holiday) => (
                <li key={holiday.id} className="flex items-center gap-3 py-2.5">
                  <span className="font-mono text-sm tabular-nums text-muted-foreground">
                    {holiday.date.slice(0, 10)}
                  </span>
                  <span className="w-8 text-xs text-muted-foreground">
                    {weekdayLabel(holiday.date)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-foreground">{holiday.name}</span>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    aria-label={d.holidays.confirmDelete}
                    onClick={() => handleDelete(holiday)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
