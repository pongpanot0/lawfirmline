'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { api, ApiError, ReceivablesResult, ReceivablesRow } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatCurrency } from '@/lib/utils';
import { publishActionFeedback } from '@/lib/action-feedback';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { RecordPaymentForm } from '@/components/billing/RecordPaymentForm';

const REMINDER_THROTTLE_MESSAGE = 'ทวงใบนี้ไปแล้วภายใน 24 ชม.';

type BucketKey = keyof ReceivablesResult['buckets'];

const BUCKET_ORDER: BucketKey[] = ['0-30', '31-60', '61-90', '90+'];
const BUCKET_LABELS: Record<BucketKey, string> = {
  '0-30': '0-30 วัน',
  '31-60': '31-60 วัน',
  '61-90': '61-90 วัน',
  '90+': 'เกิน 90 วัน',
};
const BUCKET_TINT: Record<BucketKey, string> = {
  '0-30': '',
  '31-60': '',
  '61-90': 'border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950',
  '90+': 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950',
};

/** อายุลูกหนี้ (receivables aging) — สรุปยอดค้างเป็นช่วงอายุ พร้อมบันทึกรับเงิน/ทวงผ่าน LINE ทีละใบ */
export function ReceivablesPanel({ onChanged }: { onChanged?: () => void }) {
  const { token } = useAuth();
  const [data, setData] = useState<ReceivablesResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [openRowId, setOpenRowId] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);

  const load = useCallback(() => {
    if (!token) return;
    setLoading(true);
    setFailed(false);
    api
      .getReceivables(token)
      .then(setData)
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }, [token]);

  useEffect(() => {
    load();
  }, [load, retry]);

  const rows = data?.rows ?? [];

  const toggleSelected = (id: string) => {
    setSelected((ids) => (ids.includes(id) ? ids.filter((i) => i !== id) : [...ids, id]));
  };

  const handlePaymentRecorded = () => {
    setOpenRowId(null);
    load();
    onChanged?.();
  };

  const handleRemindSelected = async () => {
    if (!token || !selected.length) return;
    setReminding(true);
    let sent = 0;
    let noContact = 0;
    let throttled = 0;
    for (const invoiceId of selected) {
      try {
        const result = await api.remindInvoice(token, invoiceId);
        if (result.sent > 0) sent += 1;
        else noContact += 1;
      } catch (err) {
        if (err instanceof ApiError && err.message === REMINDER_THROTTLE_MESSAGE) throttled += 1;
        else noContact += 1;
      }
    }
    publishActionFeedback(
      'success',
      `ส่งแล้ว ${sent} ใบ · ไม่มีผู้ติดต่อที่เชื่อม LINE ${noContact} ใบ · ข้ามเพราะเพิ่งทวง ${throttled} ใบ`,
    );
    setSelected([]);
    setReminding(false);
    load();
  };

  if (loading) {
    return (
      <div role="status" className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground">
        กำลังโหลดยอดลูกหนี้…
      </div>
    );
  }
  if (failed) {
    return <LoadFailed message="โหลดยอดลูกหนี้ไม่สำเร็จ" onRetry={() => setRetry((v) => v + 1)} />;
  }

  return (
    <section aria-label="ยอดลูกหนี้ค้างชำระ" className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {BUCKET_ORDER.map((bucket) => (
          <Card key={bucket} className={BUCKET_TINT[bucket]}>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">{BUCKET_LABELS[bucket]}</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {formatCurrency(data?.buckets[bucket] ?? 0)}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle>รายการค้างชำระ</CardTitle>
          <Button
            type="button"
            size="sm"
            disabled={!selected.length || reminding}
            onClick={() => void handleRemindSelected()}
          >
            {reminding ? 'กำลังส่ง…' : 'ทวงที่เลือกผ่าน LINE'}
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">ไม่มีใบแจ้งหนี้ค้างชำระ</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10" />
                  <TableHead>เลขที่ / ผู้ว่าจ้าง</TableHead>
                  <TableHead>คดี</TableHead>
                  <TableHead className="text-right">ค้างชำระ</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => (
                  <ReceivableRow
                    key={row.id}
                    row={row}
                    selected={selected.includes(row.id)}
                    onToggleSelected={() => toggleSelected(row.id)}
                    open={openRowId === row.id}
                    onToggleOpen={() => setOpenRowId((id) => (id === row.id ? null : row.id))}
                    onRecorded={handlePaymentRecorded}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </section>
  );
}

function ReceivableRow({
  row,
  selected,
  onToggleSelected,
  open,
  onToggleOpen,
  onRecorded,
}: {
  row: ReceivablesRow;
  selected: boolean;
  onToggleSelected: () => void;
  open: boolean;
  onToggleOpen: () => void;
  onRecorded: () => void;
}) {
  return (
    <>
      <TableRow>
        <TableCell>
          <Checkbox
            aria-label={`เลือกใบแจ้งหนี้ ${row.invoiceNumber}`}
            checked={selected}
            onChange={onToggleSelected}
          />
        </TableCell>
        <TableCell>
          <p className="font-medium">{row.invoiceNumber}</p>
          <p className="text-xs text-muted-foreground">{row.customerName || 'ไม่ระบุผู้ว่าจ้าง'}</p>
        </TableCell>
        <TableCell>
          {row.caseId && row.caseRef ? (
            <Link href={`/cases/${row.caseId}?tab=billing`} className="text-sm text-primary hover:underline">
              {row.caseRef}
            </Link>
          ) : (
            <span className="text-sm text-muted-foreground">—</span>
          )}
        </TableCell>
        <TableCell className="text-right font-semibold tabular-nums">{formatCurrency(row.outstanding)}</TableCell>
        <TableCell>
          <Badge variant={row.daysOverdue > 0 ? 'destructive' : 'success'}>
            {row.daysOverdue > 0 ? `เกิน ${row.daysOverdue} วัน` : 'ส่งแล้ว'}
          </Badge>
        </TableCell>
        <TableCell>
          <Button type="button" size="sm" variant="outline" onClick={onToggleOpen}>
            บันทึกรับเงิน
          </Button>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow>
          <TableCell colSpan={6}>
            <RecordPaymentForm
              invoiceId={row.id}
              outstanding={row.outstanding}
              onRecorded={onRecorded}
              onCancel={onToggleOpen}
            />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}
