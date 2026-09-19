import { EXPENSE_CATEGORIES } from '@lawfirm/shared';
import type { ExpenseItem } from '@/lib/api';
import { buildZip, safeFileName, type ZipEntry } from './zip.ts';

const RECEIPT_DIR = 'ใบเสร็จ';

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
  /** expense id → path of its receipt inside the exported archive. */
  receiptPaths?: Map<string, string>;
}): string {
  const cats: string[] = [...EXPENSE_CATEGORIES];
  const items = [...opts.expenses].sort((a, b) => a.date.localeCompare(b.date));
  const width = 4 + cats.length; // + the receipt-file column
  const pad = (row: string[]) => [...row, ...Array(Math.max(0, width - row.length)).fill('')].map(cell).join(',');

  const first = items[0]?.date;
  const last = items[items.length - 1]?.date;
  const period = first && last ? `งวดวันที่ ${thaiShortDate(first)} ถึงวันที่ ${thaiShortDate(last)}` : '';

  const rows: string[] = [
    pad([opts.firmName]),
    pad(['ใบเบิกเงินสดย่อย']),
    pad([period, '', `ชื่อ ${opts.requesterName}`]),
    pad([]),
    pad(['วันที่', 'รายการ', 'คดี', ...cats, 'ไฟล์ใบเสร็จ']),
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
        opts.receiptPaths?.get(e.id) ?? (e.receiptFilename ? 'ดาวน์โหลดไม่สำเร็จ' : ''),
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

/** Where an expense's receipt lives inside the archive — stable and readable. */
export function receiptPathFor(expense: ExpenseItem): string {
  const ext = expense.receiptFilename?.includes('.')
    ? expense.receiptFilename.slice(expense.receiptFilename.lastIndexOf('.') + 1).toLowerCase()
    : 'jpg';
  const base = safeFileName(
    `${thaiShortDate(expense.date)}-${expense.description}-${expense.id.slice(0, 6)}`,
    expense.id,
  );
  return `${RECEIPT_DIR}/${base}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * The voucher plus its evidence. Expenses with a receipt are fetched and packed
 * next to the CSV, which names each file — a receipt that cannot be downloaded
 * is marked in the sheet instead of silently vanishing. With nothing attached
 * this stays a plain .csv.
 */
export async function downloadPettyCashCsv(opts: {
  firmName: string;
  requesterName: string;
  expenses: ExpenseItem[];
  fetchReceipt?: (expenseId: string) => Promise<Blob>;
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const withReceipts = opts.expenses.filter((e) => e.receiptFilename);

  if (!withReceipts.length || !opts.fetchReceipt) {
    const csv = buildPettyCashCsv(opts);
    triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `เบิกเงินสดย่อย-${stamp}.csv`);
    return { receipts: 0, failed: 0 };
  }

  const receiptPaths = new Map<string, string>();
  const files: ZipEntry[] = [];
  let failed = 0;
  for (const expense of withReceipts) {
    try {
      const blob = await opts.fetchReceipt(expense.id);
      const path = receiptPathFor(expense);
      files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
      receiptPaths.set(expense.id, path);
    } catch {
      failed++;
    }
  }

  const csv = buildPettyCashCsv({ ...opts, receiptPaths });
  const zip = buildZip([
    { name: `เบิกเงินสดย่อย-${stamp}.csv`, data: new TextEncoder().encode(csv) },
    ...files,
  ]);
  triggerDownload(zip, `เบิกเงินสดย่อย-${stamp}.zip`);
  return { receipts: files.length, failed };
}
