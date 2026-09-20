export interface BillingDocLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
}

export interface BillingDocData {
  /** ใบแจ้งหนี้ หรือ ใบเสร็จรับเงิน */
  kind: 'INVOICE' | 'RECEIPT';
  firmName: string;
  invoiceNumber: string;
  issuedAt: string | null;
  dueAt: string | null;
  matterLabel: string;
  billTo: {
    name: string;
    taxId?: string | null;
    branch?: string | null;
    address?: string | null;
    billingEmail?: string | null;
    billingPhone?: string | null;
  } | null;
  lines: BillingDocLine[];
  totalAmount: number;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const baht = (amount: number) =>
  `${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

const thaiDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

/**
 * Printable invoice/receipt. The user prints and picks "Save as PDF" in the
 * browser dialog — no server-side PDF generation.
 */
export function buildBillingDocHtml(data: BillingDocData): string {
  const title = data.kind === 'RECEIPT' ? 'ใบเสร็จรับเงิน' : 'ใบแจ้งหนี้';
  const rows = data.lines
    .map(
      (line, i) => `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${line.quantity.toLocaleString('th-TH')}</td>
        <td class="num">${baht(line.unitPrice)}</td>
        <td class="num">${baht(line.amount)}</td>
      </tr>`,
    )
    .join('');
  const billToLines = data.billTo
    ? [
        `<p class="strong">${escapeHtml(data.billTo.name)}</p>`,
        data.billTo.taxId
          ? `<p>เลขประจำตัวผู้เสียภาษี ${escapeHtml(data.billTo.taxId)}${data.billTo.branch ? ` (${escapeHtml(data.billTo.branch)})` : ''}</p>`
          : data.billTo.branch
            ? `<p>${escapeHtml(data.billTo.branch)}</p>`
            : '',
        data.billTo.address ? `<p>${escapeHtml(data.billTo.address).replace(/\n/g, '<br>')}</p>` : '',
        [data.billTo.billingEmail, data.billTo.billingPhone].filter(Boolean).length
          ? `<p>${[data.billTo.billingEmail, data.billTo.billingPhone].filter(Boolean).map((v) => escapeHtml(v!)).join(' · ')}</p>`
          : '',
      ].join('')
    : '<p class="strong">(ยังไม่ระบุลูกค้า)</p>';
  const meta = [
    ['เลขที่', data.invoiceNumber],
    ['วันที่ออก', thaiDate(data.issuedAt)],
    data.kind === 'INVOICE' ? ['ครบกำหนดชำระ', thaiDate(data.dueAt)] : null,
    ['เรื่อง/คดี', data.matterLabel],
  ]
    .filter((entry): entry is [string, string] => !!entry && !!entry[1])
    .map(([label, value]) => `<p><span class="label">${label}:</span> ${escapeHtml(value)}</p>`)
    .join('');
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>${title} ${escapeHtml(data.invoiceNumber)}</title>
<style>
  body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; color: #111; margin: 40px; font-size: 14px; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  .firm { text-align: center; margin: 0 0 24px; color: #444; }
  .label { color: #555; }
  .strong { font-weight: bold; }
  .billto { margin: 16px 0; padding: 12px; border: 1px solid #ccc; border-radius: 8px; }
  .billto p { margin: 2px 0; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; }
  th { background: #f2f2f2; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; }
  .sign { margin-top: 56px; display: flex; justify-content: space-between; }
  .sign div { text-align: center; width: 240px; }
  .sign .line { border-bottom: 1px dotted #555; height: 40px; margin-bottom: 6px; }
  .note { margin-top: 24px; color: #555; font-size: 12px; }
</style>
</head>
<body>
<h1>${title}</h1>
<p class="firm">${escapeHtml(data.firmName)}</p>
${meta}
<div class="billto">
<p class="label">${data.kind === 'RECEIPT' ? 'ได้รับเงินจาก' : 'เรียกเก็บจาก'}</p>
${billToLines}
</div>
<table>
  <thead>
    <tr><th>ลำดับ</th><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคาต่อหน่วย</th><th class="num">จำนวนเงิน</th></tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="4">รวมทั้งสิ้น</td><td class="num">${baht(data.totalAmount)}</td></tr>
  </tfoot>
</table>
${data.kind === 'RECEIPT' ? '<p class="note">ออกให้เพื่อเป็นหลักฐานการรับเงินตามรายการข้างต้น</p>' : ''}
<div class="sign">
  <div><div class="line"></div>ผู้จัดทำ</div>
  <div><div class="line"></div>${data.kind === 'RECEIPT' ? 'ผู้รับเงิน' : 'ผู้มีอำนาจลงนาม'}</div>
</div>
</body>
</html>`;
}

/** Open a print window for the document; returns false when popups are blocked. */
export function openBillingDocWindow(html: string): boolean {
  const win = window.open('', '_blank');
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}
