import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import type { ExpenseItem } from '@/lib/api';

const TH_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];

/** "17 ส.ค. 69" — Thai short date with 2-digit Buddhist year, as on the paper form. */
function thaiShortDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${TH_MONTHS[d.getMonth()]} ${(d.getFullYear() + 543) % 100}`;
}

function money(n: number): string {
  return n.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function cell(v: string): string {
  return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

/**
 * Petty-cash voucher CSV (ใบเบิกเงินสดย่อย) matching the firm's paper form:
 * header block, one column per expense category, per-category totals, grand
 * total and signature lines. UTF-8 BOM so Thai text survives Excel.
 */
export function buildPettyCashCsv(opts: {
  firmName: string;
  requesterName: string;
  expenses: ExpenseItem[];
}): string {
  const cats: string[] = [...EXPENSE_CATEGORIES];
  const items = [...opts.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const width = 3 + cats.length;
  const pad = (row: string[]) => [...row, ...Array(Math.max(0, width - row.length)).fill('')].map(cell).join(',');

  const first = items[0]?.date;
  const last = items[items.length - 1]?.date;
  const period = first && last ? `งวดวันที่ ${thaiShortDate(first)} ถึงวันที่ ${thaiShortDate(last)}` : '';

  const rows: string[] = [
    pad([opts.firmName]),
    pad(['ใบเบิกเงินสดย่อย']),
    pad([period, '', `ชื่อ ${opts.requesterName}`]),
    pad([]),
    pad(['วันที่', 'รายการ', 'คดี', ...cats]),
  ];

  const totals = new Map<string, number>(cats.map((c) => [c, 0]));
  for (const e of items) {
    const cat = cats.includes(e.category ?? '') ? (e.category as string) : 'อื่นๆ';
    totals.set(cat, (totals.get(cat) ?? 0) + e.amount);
    rows.push(
      pad([
        thaiShortDate(e.date),
        e.description,
        e.case?.ownRef ?? '',
        ...cats.map((c) => (c === cat ? money(e.amount) : '')),
      ]),
    );
  }

  const grand = items.reduce((s, e) => s + e.amount, 0);
  rows.push(pad([]));
  rows.push(pad(['', 'รวม', '', ...cats.map((c) => (totals.get(c) ? money(totals.get(c)!) : '-'))]));
  rows.push(pad(['', 'รวมทั้งสิ้น', '', money(grand)]));
  rows.push(pad([]));
  rows.push(pad(['ผู้เบิก ....................', '', 'ผู้อนุมัติ ....................', 'ผู้จ่ายเงิน ....................']));

  return '﻿' + rows.join('\r\n') + '\r\n';
}

export function downloadPettyCashCsv(opts: {
  firmName: string;
  requesterName: string;
  expenses: ExpenseItem[];
}) {
  const blob = new Blob([buildPettyCashCsv(opts)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `เบิกเงินสดย่อย-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
