'use client';

import { AiBadge } from '@/components/AiBadge';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, TimeSuggestion, FirmTimesheetEntry, FirmTimesheetTotal } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { TimeEntryForm } from '@/components/billing/TimeEntryForm';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { ThaiDateField } from '@/components/ui/ThaiDateField';
import { Badge } from '@/components/ui/badge';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table';
import { InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { fmt } from '@/lib/i18n/dashboard';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { formatDate } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm-dialog';

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
  const canViewTeam = hasFirmCapability(user?.firmRole, 'viewFirmReports');
  const canManageTime = hasFirmCapability(user?.firmRole, 'manageInvoices');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<FirmTimesheetEntry | null>(null);
  const [rowError, setRowError] = useState('');
  const canEdit = (entry: FirmTimesheetEntry) =>
    !entry.invoiced && !entry.writtenOff && (canManageTime || entry.userId === user?.id);

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
    if (!token || !canViewTeam) return;
    api.getTeamMembers(token).then(setMembers).catch(() => {});
  }, [token, canViewTeam]);

  const loadTimesheet = useCallback(async () => {
    if (!token) return;
    setLoadingTimesheet(true);
    setTimesheetError('');
    try {
      const data = await api.getFirmTimesheet(token, {
        from,
        to,
        userId: canViewTeam && selectedUserId ? selectedUserId : undefined,
      });
      setEntries(data.entries);
      setTotals(data.totals);
    } catch (err) {
      setTimesheetError(err instanceof ApiError ? err.message : d.timesheet.loadFailed);
    } finally {
      setLoadingTimesheet(false);
    }
  }, [token, from, to, canViewTeam, selectedUserId, d.timesheet.loadFailed]);

  useEffect(() => {
    loadTimesheet();
  }, [loadTimesheet]);

  const afterTimeChange = () => {
    setShowAdd(false);
    setEditing(null);
    void loadTimesheet();
  };

  const deleteEntry = async (entry: FirmTimesheetEntry) => {
    if (!token || !await confirmDialog('ลบบันทึกเวลานี้?')) return;
    setRowError('');
    try {
      await api.deleteTimeEntry(token, entry.caseId, entry.id);
      void loadTimesheet();
    } catch (err) {
      setRowError(err instanceof Error ? err.message : 'ลบไม่สำเร็จ กรุณาลองใหม่');
    }
  };

  return (
    <div className="w-full min-w-0 space-y-6 pb-36 sm:pb-8">
      <PageHeader
        title={d.timesheet.title}
        description="ตรวจเวลาที่บันทึก หรือเพิ่มเวลาทำงานในคดี"
        actions={
          <div><Button type="button" variant="outline" onClick={() => { setShowAdd(true); setEditing(null); }}>เพิ่มเวลาเอง</Button><p className="mt-1 text-xs text-muted-foreground">บันทึกเวลาที่ระบบไม่ได้ดึงมาให้</p></div>
        }
      />
      {showAdd && <TimeEntryForm onCancel={() => setShowAdd(false)} onDone={afterTimeChange} />}

      <Card className="border-l-4 border-amber-200 border-l-[var(--color-brass)] bg-[var(--operations-highlight)]">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>ยืนยันเวลาวันนี้</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">{d.timesheet.confirmSectionHint}</p>
          </div>
          <div className="flex items-center gap-2">
            <span aria-hidden className="text-sm font-medium text-muted-foreground">{d.timesheet.date}</span>
            <ThaiDateField ariaLabel={d.timesheet.date} value={date} onChange={setDate} />
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {suggestError && <p className="text-sm text-destructive">{suggestError}</p>}
          {confirmError && <p className="text-sm text-destructive">{confirmError}</p>}
          {confirmedMsg && <p className="text-sm text-emerald-600">{confirmedMsg}</p>}

          {loadingSuggestions ? (
            <PageLoading title={d.common.loading} lines={2} />
          ) : suggestions.length === 0 ? (
            <InlineEmptyState title="ไม่มีรายการรอยืนยันสำหรับวันนี้ ระบบจะดึงจากนัดศาล งานที่ปิด และอีเมลให้อัตโนมัติ" />
          ) : (
            <>
              <label className="flex min-h-11 items-center justify-end gap-2 text-sm font-semibold"><Checkbox checked={suggestions.length > 0 && suggestions.every((s) => rows[s.sourceKey]?.checked)} onChange={(e) => setRows((prev) => Object.fromEntries(Object.entries(prev).map(([key, row]) => [key, { ...row, checked: e.target.checked }])))} />เลือกทั้งหมด</label>
              <div className="space-y-3">
                {suggestions.map((s) => {
                  const row = rows[s.sourceKey] ?? { checked: false, hours: '', description: s.description };
                  const invalidHours = row.checked && !isHoursInRange(row.hours);
                  return <div key={s.sourceKey} className="flex min-w-0 items-start gap-2 rounded-lg border bg-card p-3 sm:items-center sm:p-4">
                    <label className="flex min-h-11 min-w-11 items-center justify-center"><Checkbox aria-label={`เลือกบันทึกเวลา: ${row.description || s.description}`} checked={row.checked} onChange={(e) => updateRow(s.sourceKey, { checked: e.target.checked })} /></label>
                    <div className="min-w-0 flex-1 space-y-2"><p className="break-words font-semibold">{s.caseRef ?? 'ภายในสำนักงาน'}</p><Input aria-label="รายละเอียดงานที่จะบันทึก" value={row.description} onChange={(e) => updateRow(s.sourceKey, { description: e.target.value })} /><Badge variant="muted">{d.timesheet.sources[s.source]}</Badge></div>
                    <label className="w-20 shrink-0 text-xs text-muted-foreground">ชั่วโมง<Input type="number" step={0.25} min={0.25} max={24} aria-label="จำนวนชั่วโมง" aria-invalid={invalidHours || undefined} value={row.hours} className={invalidHours ? 'border-destructive' : undefined} onChange={(e) => updateRow(s.sourceKey, { hours: e.target.value })} /></label>
                  </div>;
                })}
              </div>
              <div className="sticky bottom-0 z-[45] -mx-4 flex flex-col gap-2 border-t bg-card p-4 shadow-lg sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:bg-transparent sm:px-0 sm:shadow-none">
                <strong>เลือก {checkedCount} รายการ · {Object.values(rows).filter((row) => row.checked).reduce((sum, row) => sum + (Number(row.hours) || 0), 0).toFixed(1)} ชั่วโมง</strong>
                <div><Button className="w-full sm:w-auto" disabled={checkedCount === 0 || hasInvalidHours || confirming} onClick={confirmEntries}>{confirming ? d.timesheet.confirming : fmt(d.timesheet.confirmButton, { count: checkedCount })}</Button><p className="mt-1 text-center text-xs text-muted-foreground">บันทึกเวลาที่เลือกไว้เข้าคดี แก้ไขได้ภายหลัง</p></div>
                {hasMissingHours ? <p className="text-sm text-destructive">{d.timesheet.hoursRequired}</p> : hasOutOfRangeHours ? <p className="text-sm text-destructive">{d.timesheet.hoursOutOfRange}</p> : null}
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
            <span aria-hidden className="text-sm font-medium text-muted-foreground">{d.timesheet.from}</span>
            <ThaiDateField ariaLabel={d.timesheet.from} value={from} onChange={setFrom} />
            <span aria-hidden className="text-sm font-medium text-muted-foreground">{d.timesheet.to}</span>
            <ThaiDateField ariaLabel={d.timesheet.to} value={to} onChange={setTo} />
            {canViewTeam && (
              <select
                aria-label="แสดงเวลาของ"
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
          {rowError && <p role="alert" className="text-sm text-destructive">{rowError}</p>}
          {editing && (
            <TimeEntryForm
              entry={{
                id: editing.id,
                caseId: editing.caseId,
                date: editing.date,
                hours: editing.hours,
                rate: editing.rate,
                description: editing.description,
              }}
              onCancel={() => setEditing(null)}
              onDone={afterTimeChange}
            />
          )}

          {loadingTimesheet ? (
            <PageLoading title={d.common.loading} lines={2} />
          ) : (
            <>
              {canViewTeam && totals.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold">{d.timesheet.totalsTitle}</h3>
                  {totals.length === 0 ? (
                    <InlineEmptyState title="ยังไม่มีเวลาที่บันทึก กดเพิ่มเวลาเพื่อเริ่ม" />
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
                  <InlineEmptyState title="ยังไม่มีเวลาที่บันทึก กดเพิ่มเวลาเพื่อเริ่ม" />
                ) : (
                  <><div className="divide-y rounded-lg border sm:hidden">{entries.map((entry) => <div key={entry.id} className="space-y-2 p-4"><div className="flex justify-between gap-2"><span className="min-w-0 break-words text-sm text-muted-foreground">{formatDate(entry.date)} · <strong className="text-foreground">{entry.caseRef ?? 'ภายในสำนักงาน'}</strong></span><strong className="shrink-0">{entry.hours} ชม.</strong></div><p className="break-words">{entry.description ?? '—'} {entry.viaAi && <AiBadge />}</p><Badge variant={entry.invoiced ? 'success' : 'muted'}>{entry.invoiced ? d.timesheet.invoicedYes : entry.billable ? d.timesheet.billableYes : d.timesheet.billableNo}</Badge>{canEdit(entry) && <div className="flex gap-2"><Button type="button" size="sm" variant="outline" onClick={() => { setEditing(entry); setShowAdd(false); }}>แก้ไข</Button><Button type="button" size="sm" variant="outline" onClick={() => void deleteEntry(entry)}>ลบ</Button></div>}</div>)}</div><div className="hidden sm:block"><Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{d.timesheet.date}</TableHead>
                        <TableHead>{d.timesheet.colCase}</TableHead>
                        <TableHead>{d.timesheet.colDescription}</TableHead>
                        {canViewTeam && <TableHead>{d.timesheet.colUser}</TableHead>}
                        <TableHead className="text-right">{d.timesheet.colHours}</TableHead>
                        <TableHead>{d.timesheet.colBillable}</TableHead>
                        <TableHead>{d.timesheet.colInvoiced}</TableHead>
                        <TableHead className="w-32" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow key={entry.id}>
                          <TableCell className="text-sm text-muted-foreground">{formatDate(entry.date)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{entry.caseRef ?? '-'}</TableCell>
                          <TableCell>{entry.description ?? '-'} {entry.viaAi && <AiBadge />}</TableCell>
                          {canViewTeam && <TableCell>{entry.userName}</TableCell>}
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
                          <TableCell>
                            {canEdit(entry) && (
                              <div className="flex gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => { setEditing(entry); setShowAdd(false); }}>
                                  แก้ไข
                                </Button>
                                <Button type="button" size="sm" variant="outline" className="text-destructive" onClick={() => void deleteEntry(entry)}>
                                  ลบ
                                </Button>
                              </div>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table></div></>
                )}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
