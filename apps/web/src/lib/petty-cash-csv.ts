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
  v = /^[=+@\-\t\r]/.test(v) ? `'${v}` : v;
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

/** Local printable sheet; all user text is escaped and evidence paths stay relative. */
export function buildPrintableClaim(opts: { firmName: string; requesterName: string; expenses: ExpenseItem[]; receiptPaths: Map<string, string> }): string {
  const esc = (value: string) => value.replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]!));
  const rows = opts.expenses.map((e, i) => {
    const file = opts.receiptPaths.get(e.id);
    return `<tr><td>${i + 1}</td><td>${esc(thaiShortDate(e.date))}</td><td>${esc(e.description)}<br><small>${esc(e.category ?? '')}</small></td><td>${esc(`${e.user.firstName} ${e.user.lastName}`)}</td><td>${esc(e.case?.ownRef ?? 'งานทั่วไป')}</td><td>${money(e.amount)}</td><td>${esc(e.status)}</td><td>${file ? `<a href="${esc(encodeURI(file))}">${esc(e.receiptFilename ?? file)}</a>` : 'ไม่มีไฟล์แนบ'}</td></tr>`;
  }).join('');
  return `<!doctype html><html lang="th"><meta charset="utf-8"><title>ใบเบิกค่าใช้จ่าย</title><style>body{font-family:Tahoma,sans-serif;color:#111;margin:32px;line-height:1.6}h1{text-align:center}table{width:100%;border-collapse:collapse;font-size:12px}td,th{border:1px solid #aaa;padding:8px;text-align:left;overflow-wrap:anywhere}tfoot{font-weight:bold}@page{size:A4 landscape;margin:12mm}@media print{.help{display:none}body{margin:0}thead{display:table-header-group}tr{break-inside:avoid}}</style><body><h1>ใบเบิกค่าใช้จ่าย</h1><p>${esc(opts.firmName)}</p><p>ผู้เบิก: ${esc(opts.requesterName)}</p><p class="help">พิมพ์หน้านี้หรือบันทึก PDF ผ่านเมนูพิมพ์ของเบราว์เซอร์ ไฟล์แนบต้นฉบับอยู่ในโฟลเดอร์ใบเสร็จ เปิดแต่ละไฟล์เพื่อพิมพ์ประกอบ ใบนี้ไม่ใช่หลักฐานอนุมัติหรือจ่ายเงิน</p><table><thead><tr><th>#</th><th>วันที่</th><th>รายการ</th><th>ผู้เบิก</th><th>คดี</th><th>จำนวนเงิน</th><th>สถานะ</th><th>เอกสารแนบ</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5">รวม ${opts.expenses.length} รายการ</td><td colspan="3">${money(opts.expenses.reduce((sum, e) => sum + e.amount, 0))} บาท</td></tr></tfoot></table><p style="margin-top:48px">ผู้เบิก ____________________ ผู้อนุมัติ ____________________ ผู้จ่ายเงิน ____________________</p></body></html>`;
}

/** Where an expense's receipt lives inside the archive — stable and readable. */
export function receiptPathFor(expense: ExpenseItem): string {
  const rawExt = expense.receiptFilename?.includes('.')
    ? expense.receiptFilename.slice(expense.receiptFilename.lastIndexOf('.') + 1).toLowerCase()
    : 'jpg';
  const ext = /^[a-z0-9]{1,10}$/.test(rawExt) ? rawExt : 'bin';
  const base = safeFileName(
    `${expense.id}-${thaiShortDate(expense.date)}-${expense.description}`,
    expense.id,
  );
  return `${RECEIPT_DIR}/${base}.${ext}`;
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * The voucher plus its evidence. Expenses with a receipt are fetched and packed
 * next to the printable HTML and CSV. Any missing attachment blocks export.
 */
export async function buildPettyCashPackage(opts: {
  firmName: string;
  requesterName: string;
  expenses: ExpenseItem[];
  fetchReceipt?: (expenseId: string) => Promise<Blob>;
}) {
  const stamp = new Date().toISOString().slice(0, 10);
  const withReceipts = opts.expenses.filter((e) => e.receiptFilename);

  if (withReceipts.length && !opts.fetchReceipt) throw new Error('ไม่สามารถดาวน์โหลดไฟล์แนบได้ กรุณาเข้าสู่ระบบแล้วลองใหม่');
  const receiptPaths = new Map<string, string>();
  const files: ZipEntry[] = [];
  let failed = 0;
  for (const expense of withReceipts) {
    try {
      const blob = await opts.fetchReceipt!(expense.id);
      const path = receiptPathFor(expense);
      files.push({ name: path, data: new Uint8Array(await blob.arrayBuffer()) });
      receiptPaths.set(expense.id, path);
    } catch {
      failed++;
    }
  }

  if (failed) throw new Error(`ดาวน์โหลดไฟล์แนบไม่สำเร็จ ${failed} รายการ ยังไม่ได้ส่งออกชุดเอกสาร กรุณาลองใหม่`);
  const csv = buildPettyCashCsv({ ...opts, receiptPaths });
  const zip = buildZip([
    { name: 'ใบเบิก.html', data: new TextEncoder().encode(buildPrintableClaim({ ...opts, receiptPaths })) },
    { name: `เบิกเงินสดย่อย-${stamp}.csv`, data: new TextEncoder().encode(csv) },
    ...files,
  ]);
  return { blob: zip, filename: `เบิกเงินสดย่อย-${stamp}.zip`, receipts: files.length, failed };
}

export async function downloadPettyCashCsv(opts: Parameters<typeof buildPettyCashPackage>[0]) {
  const result = await buildPettyCashPackage(opts);
  triggerDownload(result.blob, result.filename);
  return { receipts: result.receipts, failed: result.failed };
}
