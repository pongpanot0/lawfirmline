'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, TimeSuggestion, FirmTimesheetEntry, FirmTimesheetTotal } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ThaiDateInput } from '@/components/ui/ThaiDateInput';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { fmt } from '@/lib/i18n/dashboard';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const dateKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const monthStart = (date: Date) => dateKey(new Date(date.getFullYear(), date.getMonth(), 1));
const monthEnd = (date: Date) => dateKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));

type RowState = { checked: boolean; hours: string; description: string };

/** Hours must be present and within the API's accepted range (0.25–24). */
const isHoursInRange = (hours: string) => {
  const n = Number(hours);
  return hours !== '' && !Number.isNaN(n) && n >= 0.25 && n <= 24;
};

export default function TimesheetPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;

  // --- confirm today's suggestions ---
  const [date, setDate] = useState(() => dateKey(new Date()));
  const [suggestions, setSuggestions] = useState<TimeSuggestion[]>([]);
  const [rows, setRows] = useState<Record<string, RowState>>({});
  const [loadingSuggestions, setLoadingSuggestions] = useState(true);
  const [suggestError, setSuggestError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState('');
  const [confirmedMsg, setConfirmedMsg] = useState('');

  const loadSuggestions = useCallback(async () => {
    if (!token) return;
    setLoadingSuggestions(true);
    setSuggestError('');
    try {
      const data = await api.getTimeSuggestions(token, date);
      setSuggestions(data);
      setRows(
        Object.fromEntries(
          data.map((s) => [
            s.sourceKey,
            { checked: s.hours !== null, hours: s.hours !== null ? String(s.hours) : '', description: s.description },
          ]),
        ),
      );
    } catch (err) {
      setSuggestError(err instanceof ApiError ? err.message : d.timesheet.loadFailed);
    } finally {
      setLoadingSuggestions(false);
    }
  }, [token, date, d.timesheet.loadFailed]);

  useEffect(() => {
    loadSuggestions();
  }, [loadSuggestions]);

  const checkedCount = useMemo(() => Object.values(rows).filter((r) => r.checked).length, [rows]);
  const hasMissingHours = suggestions.some((s) => rows[s.sourceKey]?.checked && !rows[s.sourceKey]?.hours);
  const hasOutOfRangeHours = suggestions.some(
    (s) => rows[s.sourceKey]?.checked && rows[s.sourceKey]?.hours && !isHoursInRange(rows[s.sourceKey].hours),
  );
  const hasInvalidHours = hasMissingHours || hasOutOfRangeHours;

  const updateRow = (sourceKey: string, patch: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [sourceKey]: { ...prev[sourceKey], ...patch } }));

  const confirmEntries = async () => {
    if (!token) return;
    setConfirming(true);
    setConfirmError('');
    setConfirmedMsg('');
    try {
      const entries = suggestions
        .filter((s) => rows[s.sourceKey]?.checked)
        .map((s) => ({
          caseId: s.caseId,
          hours: Number(rows[s.sourceKey].hours),
          description: rows[s.sourceKey].description,
          date: s.date,
          sourceKey: s.sourceKey,
        }));
      const result = await api.confirmTimeEntries(token, entries);
      setConfirmedMsg(fmt(d.timesheet.confirmedMsg, { count: result.created }));
      await loadSuggestions();
      await loadTimesheet();
    } catch (err) {
      setConfirmError(err instanceof ApiError ? err.message : d.timesheet.confirmFailed);
    } finally {
      setConfirming(false);
    }
  };

  // --- firm timesheet ---
  const [from, setFrom] = useState(() => monthStart(new Date()));
  const [to, setTo] = useState(() => monthEnd(new Date()));
  const [members, setMembers] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [entries, setEntries] = useState<FirmTimesheetEntry[]>([]);
  const [totals, setTotals] = useState<FirmTimesheetTotal[]>([]);
  const [loadingTimesheet, setLoadingTimesheet] = useState(true);
  const [timesheetError, setTimesheetError] = useState('');

  useEffect(() => {
    if (!token || !isOwner) return;
    api.getTeamMembers(token).then(setMembers).catch(() => {});
  }, [token, isOwner]);

  const loadTimesheet = useCallback(async () => {
    if (!token) return;
    setLoadingTimesheet(true);
    setTimesheetError('');
    try {
      const data = await api.getFirmTimesheet(token, {
        from,
        to,
        userId: isOwner && selectedUserId ? selectedUserId : undefined,
      });
      setEntries(data.entries);
      setTotals(data.totals);
    } catch (err) {
      setTimesheetError(err instanceof ApiError ? err.message : d.timesheet.loadFailed);
    } finally {
      setLoadingTimesheet(false);
    }
  }, [token, from, to, isOwner, selectedUserId, d.timesheet.loadFailed]);

  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet]);

  return (
    <div className="w-full space-y-6">
      <PageHeader title={d.timesheet.title} description={d.timesheet.description} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{d.timesheet.confirmSection}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{d.timesheet.confirmSectionHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">{d.timesheet.date}</label>
            <ThaiDateInput value={date} onChange={setDate} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}
          {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
          {confirmedMsg && <p className="text-sm text-emerald-600">{confirmedMsg}</p>}

          {loadingSuggestions ? (
            <PageLoading title={d.common.loading} lines={2} />
          ) : suggestions.length === 0 ? (
            <InlineEmptyState title={d.timesheet.noSuggestions} />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-8" />
                    <TableHead>{d.timesheet.colCase}</TableHead>
                    <TableHead>{d.timesheet.colDescription}</TableHead>
                    <TableHead className="w-28">{d.timesheet.colHours}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {suggestions.map((s) => {
                    const row = rows[s.sourceKey] ?? { checked: false, hours: '', description: s.description };
                    const invalidHours = row.checked && !isHoursInRange(row.hours);
                    return (
                      <TableRow key={s.sourceKey}>
                        <TableCell>
                          <Checkbox
                            checked={row.checked}
                            onChange={(e) => updateRow(s.sourceKey, { checked: e.target.checked })}
                          />
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">{s.caseRef ?? '-'}</TableCell>
                        <TableCell>
                          <Input
                            value={row.description}
                            onChange={(e) => updateRow(s.sourceKey, { description: e.target.value })}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step={0.25}
                            min={0.25}
                            max={24}
                            value={row.hours}
                            className={invalidHours ? 'border-destructive' : undefined}
                            onChange={(e) => updateRow(s.sourceKey, { hours: e.target.value })}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>

              <div className="flex items-center gap-3">
                <Button disabled={checkedCount === 0 || hasInvalidHours || confirming} onClick={confirmEntries}>
                  {confirming ? d.timesheet.confirming : fmt(d.timesheet.confirmButton, { count: checkedCount })}
                </Button>
                {hasMissingHours ? (
                  <p className="text-sm text-destructive">{d.timesheet.hoursRequired}</p>
                ) : hasOutOfRangeHours ? (
                  <p className="text-sm text-destructive">{d.timesheet.hoursOutOfRange}</p>
                ) : null}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{d.timesheet.timesheetSection}</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{d.timesheet.timesheetSectionHint}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm font-medium text-muted-foreground">{d.timesheet.from}</label>
            <ThaiDateInput value={from} onChange={setFrom} />
            <label className="text-sm font-medium text-muted-foreground">{d.timesheet.to}</label>
            <ThaiDateInput value={to} onChange={setTo} />
            {isOwner && (
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">{d.timesheet.allMembers}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.firstName} {m.lastName}
                  </option>
                ))}
              </select>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {timesheetError && <p className="text-sm text-destructive">{timesheetError}</p>}

          {loadingTimesheet ? (
            <PageLoading title={d.common.loading} lines={2} />
          ) : (
            <>
              {isOwner && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{d.timesheet.totalsTitle}</h3>
                  {totals.length === 0 ? (
                    <InlineEmptyState title={d.timesheet.noEntries} />
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{d.timesheet.colUser}</TableHead>
                          <TableHead className="text-right">{d.timesheet.colTotalHours}</TableHead>
                          <TableHead className="text-right">{d.timesheet.colBillableHours}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {totals.map((t) => (
                          <TableRow key={t.userId}>
                            <TableCell className="font-medium">{t.userName}</TableCell>
                            <TableCell className="text-right">{t.hours}</TableCell>
                            <TableCell className="text-right">{t.billableHours}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              )}

              <div>
                {entries.length === 0 ? (
                  <InlineEmptyState title={d.timesheet.noEntries} />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{d.timesheet.date}</TableHead>
                        <TableHead>{d.timesheet.colCase}</TableHead>
                        <TableHead>{d.timesheet.colDescription}</TableHead>
                        {isOwner && <TableHead>{d.timesheet.colUser}</TableHead>}
                        <TableHead className="text-right">{d.timesheet.colHours}</TableHead>
                        <TableHead>{d.timesheet.colBillable}</TableHead>
                        <TableHead>{d.timesheet.colInvoiced}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm text-muted-foreground">{entry.date}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.caseRef ?? '-'}</TableCell>
                          <TableCell>{entry.description ?? '-'}</TableCell>
                          {isOwner && <TableCell>{entry.userName}</TableCell>}
                          <TableCell className="text-right">{entry.hours}</TableCell>
                          <TableCell>
                            <Badge variant={entry.billable ? 'success' : 'muted'}>
                              {entry.billable ? d.timesheet.billableYes : d.timesheet.billableNo}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant={entry.invoiced ? 'secondary' : 'muted'}>
                              {entry.invoiced ? d.timesheet.invoicedYes : d.timesheet.invoicedNo}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
