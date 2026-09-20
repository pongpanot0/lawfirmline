import { type CaseCostLine, caseCostTotal } from './case-costs.ts';

export interface QuoteDocData {
  firmName: string;
  issuedByName: string;
  clientName: string;
  matterTitle: string;
  matterTypeLabel: string;
  opposingParty: string;
  estimatedDamage: number | null;
  lines: CaseCostLine[];
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const baht = (amount: number) => `${amount.toLocaleString('th-TH')} บาท`;

/**
 * Printable quotation document. The user prints it and picks "Save as PDF"
 * in the browser dialog — no server-side PDF generation involved.
 */
export function buildQuoteHtml(data: QuoteDocData, today = new Date()): string {
  const result = caseCostTotal(data.lines);
  const rows = data.lines
    .map((line, i) => {
      const amount = result.amounts[i];
      return `<tr>
        <td>${i + 1}</td>
        <td>${escapeHtml(line.label)}</td>
        <td class="num">${escapeHtml(line.quantity)}</td>
        <td class="num">${line.rate ? baht(Number(line.rate)) : '-'}</td>
        <td class="num">${amount === null ? '-' : baht(amount / 100)}</td>
      </tr>`;
    })
    .join('');
  const dateText = today.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const info = [
    ['ลูกความ', data.clientName],
    ['เรื่อง', data.matterTitle],
    ['ประเภทคดี', data.matterTypeLabel],
    ['คู่กรณี', data.opposingParty],
    [
      'ทุนทรัพย์โดยประมาณ',
      data.estimatedDamage != null ? baht(data.estimatedDamage) : '',
    ],
  ]
    .filter(([, value]) => value)
    .map(
      ([label, value]) =>
        `<p><span class="label">${label}:</span> ${escapeHtml(value)}</p>`,
    )
    .join('');
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>ใบเสนอราคา - ${escapeHtml(data.clientName || data.firmName)}</title>
<style>
  body { font-family: 'Sarabun', 'Noto Sans Thai', sans-serif; color: #111; margin: 40px; font-size: 14px; }
  h1 { font-size: 20px; text-align: center; margin-bottom: 4px; }
  .firm { text-align: center; margin: 0 0 24px; color: #444; }
  .label { color: #555; }
  table { width: 100%; border-collapse: collapse; margin-top: 16px; }
  th, td { border: 1px solid #999; padding: 6px 10px; text-align: left; }
  th { background: #f2f2f2; }
  .num { text-align: right; white-space: nowrap; }
  tfoot td { font-weight: bold; }
  .note { margin-top: 24px; color: #555; font-size: 12px; }
  .sign { margin-top: 56px; display: flex; justify-content: flex-end; }
  .sign div { text-align: center; width: 260px; }
  .sign .line { border-bottom: 1px dotted #555; height: 40px; margin-bottom: 6px; }
</style>
</head>
<body>
<h1>ใบเสนอราคา</h1>
<p class="firm">${escapeHtml(data.firmName)}</p>
<p><span class="label">วันที่:</span> ${dateText}</p>
${info}
<table>
  <thead>
    <tr><th>ลำดับ</th><th>รายการ</th><th class="num">จำนวน</th><th class="num">ราคาต่อหน่วย</th><th class="num">จำนวนเงิน</th></tr>
  </thead>
  <tbody>${rows}</tbody>
  <tfoot>
    <tr><td colspan="4">รวมทั้งสิ้น${result.incomplete ? ' (เฉพาะรายการที่ระบุครบ)' : ''}</td><td class="num">${baht(result.totalCents / 100)}</td></tr>
  </tfoot>
</table>
<p class="note">เอกสารนี้เป็นการประมาณการค่าบริการเบื้องต้น อาจเปลี่ยนแปลงได้ตามข้อเท็จจริงและปริมาณงาน ไม่ใช่ใบแจ้งหนี้</p>
<div class="sign"><div><div class="line"></div>${escapeHtml(data.issuedByName)}<br>ผู้เสนอราคา</div></div>
</body>
</html>`;
}
