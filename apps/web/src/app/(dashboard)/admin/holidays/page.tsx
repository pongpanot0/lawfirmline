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
import { fmt } from '@/lib/i18n/dashboard';
import { parseHolidayLines } from '@/lib/holidays';

/** Buddhist-era label for a Gregorian year. */
const toBE = (year: number) => year + 543;

/**
 * Thailand has around twenty government holidays a year. Well under that means
 * the calendar was never filled in — worth saying out loud, because the
 * deadline engine will quietly count through the missing days.
 */
const EXPECTED_MIN_HOLIDAYS = 12;


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
  const [bulk, setBulk] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);
  const [notice, setNotice] = useState('');
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

  const handleBulk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setError('');
    setNotice('');

    const { error: badLine, holidays: parsed } = parseHolidayLines(bulk);
    if (badLine) {
      setError(fmt(d.holidays.bulkBadLine, { line: badLine }));
      return;
    }
    if (!window.confirm(fmt(d.holidays.bulkConfirm, { year: toBE(year) }))) return;

    setBulkBusy(true);
    try {
      const result = await api.replacePublicHolidayYear(token, { year, holidays: parsed });
      setNotice(fmt(d.holidays.bulkDone, { count: result.replaced }));
      setBulk('');
      load(year);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.holidays.saveFailed);
    } finally {
      setBulkBusy(false);
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

      {holidays.length > 0 && holidays.length < EXPECTED_MIN_HOLIDAYS && (
        <Card className="mb-4 border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-2 py-3 text-sm">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
            <span>{fmt(d.holidays.incomplete, { count: holidays.length })}</span>
          </CardContent>
        </Card>
      )}

      {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
      {notice && <p className="mb-3 text-sm text-muted-foreground">{notice}</p>}

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

      <Card className="mb-4">
        <CardContent className="pt-6">
          <h2 className="font-semibold text-foreground">{d.holidays.bulkTitle}</h2>
          <p className="mb-3 mt-1 text-sm text-muted-foreground">{d.holidays.bulkHint}</p>
          <form onSubmit={handleBulk} className="space-y-3">
            <textarea
              rows={6}
              value={bulk}
              onChange={(e) => setBulk(e.target.value)}
              aria-label={d.holidays.bulkTitle}
              placeholder={`${year + 1}-01-01 วันขึ้นปีใหม่`}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 font-mono text-sm"
            />
            <Button type="submit" size="sm" variant="outline" disabled={bulkBusy || !bulk.trim()}>
              {d.holidays.bulkApply}
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
