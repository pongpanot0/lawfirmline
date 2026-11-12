'use client';

import { Fragment, useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, MousePointerClick } from 'lucide-react';
import { api, ApiError, LeaveItem } from '@/lib/api';
import { LEAVE_TYPE_TH, leaveDaysInYear, leaveDecisionText, leaveSummaryByPerson } from '@/lib/leave-flags';
import { formatDate } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadFailed } from '@/components/ui/LoadFailed';

const TYPES = ['SICK', 'PERSONAL', 'VACATION'] as const;
const STATUS_TH: Record<LeaveItem['status'], string> = { APPROVED: 'อนุมัติแล้ว', PENDING: 'รออนุมัติ', REJECTED: 'ไม่อนุมัติ' };

const num = (value: number) => <span className={value ? undefined : 'text-muted-foreground'}>{value}</span>;
const pendingBadge = (count: number) => count ? <Badge variant="warning">{count} คำขอ</Badge> : <span className="text-muted-foreground">–</span>;

/** Leave days per person for one calendar year. Approvers see the whole firm; everyone else only their own row. */
export function LeaveSummary({ token, userId, seeAll, reloadKey }: { token: string | null; userId?: string; seeAll: boolean; reloadKey: number }) {
  const thisYear = new Date().getFullYear();
  const [year, setYear] = useState(thisYear);
  const [leaves, setLeaves] = useState<LeaveItem[] | null>(null);
  const [people, setPeople] = useState<{ id: string; firstName: string; lastName: string }[]>([]);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [open, setOpen] = useState('');

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLeaves(null);
    setError('');
    api.getLeaves(token, `${year}-01-01`, `${year}-12-31`)
      .then((items) => { if (active) setLeaves(items); })
      .catch((err) => { if (active) setError(err instanceof ApiError ? err.message : 'โหลดสรุปการลาไม่สำเร็จ'); });
    return () => { active = false; };
  }, [token, year, reloadKey, retry]);

  // Members with no leave still get a zero row; without the list the table just shows people who took leave.
  useEffect(() => {
    if (!token || !seeAll) return;
    api.getMembers(token).then(setPeople).catch(() => setPeople([]));
  }, [token, seeAll]);

  const rows = leaves ? leaveSummaryByPerson(leaves, year, seeAll ? people : []).filter((row) => seeAll || row.userId === userId) : [];
  const total = rows.reduce((sum, row) => ({ SICK: sum.SICK + row.SICK, PERSONAL: sum.PERSONAL + row.PERSONAL, VACATION: sum.VACATION + row.VACATION, total: sum.total + row.total, pending: sum.pending + row.pending }), { SICK: 0, PERSONAL: 0, VACATION: 0, total: 0, pending: 0 });

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3 space-y-0">
        <div>
          <CardTitle>สรุปการลารายคน · ปี {year + 543}</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">นับวันที่อนุมัติแล้ว (รวมวันหยุด) · ปีปฏิทิน ม.ค.–ธ.ค.</p>
        </div>
        <div className="flex items-center rounded-lg border">
          <Button variant="ghost" size="icon" aria-label="ปีก่อน" onClick={() => setYear(year - 1)}><ChevronLeft className="h-4 w-4" aria-hidden /></Button>
          <span className="px-2 text-sm font-medium tabular-nums" aria-live="polite">{year + 543}</span>
          {/* Leave can be booked up to a year ahead, so next year is the last one worth showing. */}
          <Button variant="ghost" size="icon" aria-label="ปีถัดไป" disabled={year > thisYear} onClick={() => setYear(year + 1)}><ChevronRight className="h-4 w-4" aria-hidden /></Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {error ? <div className="px-6 pb-6"><LoadFailed message={error} onRetry={() => setRetry((n) => n + 1)} /></div>
          : !leaves ? <p className="px-6 pb-6 text-sm text-muted-foreground">กำลังโหลดสรุป…</p>
            : !rows.length ? <p className="px-6 pb-6 text-sm text-muted-foreground">ปีนี้ยังไม่มีการลา</p>
              : (
                <div className="overflow-x-auto border-t">
                  <table className="w-full min-w-[36rem] text-sm">
                    <thead className="bg-muted/50 text-xs text-muted-foreground">
                      <tr>
                        <th scope="col" className="px-6 py-3 text-left font-medium">ชื่อ</th>
                        {TYPES.map((type) => <th key={type} scope="col" className="px-3 py-3 text-right font-medium">{LEAVE_TYPE_TH[type]}</th>)}
                        <th scope="col" className="px-3 py-3 text-right font-medium">รวม (วัน)</th>
                        <th scope="col" className="px-6 py-3 text-center font-medium">รออนุมัติ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => {
                        const own = leaves.filter((leave) => leave.userId === row.userId && leaveDaysInYear(leave, year));
                        const expanded = open === row.userId;
                        return (
                          <Fragment key={row.userId}>
                            <tr className={`border-t tabular-nums ${row.total || row.pending ? '' : 'text-muted-foreground'}`}>
                              <th scope="row" className="px-6 py-0.5 text-left font-medium">
                                {own.length ? (
                                  <button type="button" aria-expanded={expanded} onClick={() => setOpen(expanded ? '' : row.userId)} className="inline-flex min-h-11 items-center rounded text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{row.name}</button>
                                ) : <span className="inline-flex min-h-11 items-center">{row.name}</span>}
                              </th>
                              {TYPES.map((type) => <td key={type} className="px-3 py-2 text-right">{num(row[type])}</td>)}
                              <td className="px-3 py-2 text-right font-semibold">{row.total}</td>
                              <td className="px-6 py-2 text-center">{pendingBadge(row.pending)}</td>
                            </tr>
                            {expanded && (
                              <tr className="bg-muted/30">
                                <td colSpan={6} className="px-6 py-3">
                                  <ul className="space-y-1.5">
                                    {own.map((leave) => (
                                      <li key={leave.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                        <span className="font-medium">{LEAVE_TYPE_TH[leave.type]}</span>
                                        <span className="text-muted-foreground">{leave.startDate === leave.endDate ? formatDate(leave.startDate) : `${formatDate(leave.startDate)} – ${formatDate(leave.endDate)}`} · {leaveDaysInYear(leave, year)} วัน</span>
                                        <Badge variant={leave.status === 'APPROVED' ? 'success' : leave.status === 'REJECTED' ? 'destructive' : 'warning'}>{STATUS_TH[leave.status]}</Badge>
                                        {leaveDecisionText(leave) && <span className="text-muted-foreground">{leaveDecisionText(leave)}</span>}
                                      </li>
                                    ))}
                                  </ul>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        );
                      })}
                    </tbody>
                    {seeAll && rows.length > 1 && (
                      <tfoot className="border-t-2 bg-muted/50 font-semibold tabular-nums">
                        <tr>
                          <th scope="row" className="px-6 py-3 text-left">รวมทั้งสำนักงาน</th>
                          {TYPES.map((type) => <td key={type} className="px-3 py-3 text-right">{total[type]}</td>)}
                          <td className="px-3 py-3 text-right">{total.total}</td>
                          <td className="px-6 py-3 text-center">{pendingBadge(total.pending)}</td>
                        </tr>
                      </tfoot>
                    )}
                  </table>
                  <p className="flex items-center gap-1.5 border-t px-6 py-3 text-xs text-muted-foreground"><MousePointerClick className="h-3.5 w-3.5" aria-hidden />กดชื่อเพื่อดูใบลาของคนนั้น</p>
                </div>
              )}
      </CardContent>
    </Card>
  );
}
