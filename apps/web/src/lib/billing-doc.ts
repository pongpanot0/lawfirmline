export interface BillingDocLine {
  description: string;
  quantity: number;
  unitPrice: number;
  amount: number;
  taxClass?: 'LITIGATION_EXEMPT' | 'ADVISORY_VAT' | 'DISBURSEMENT';
}

export interface BillingDocData {
  /** ใบแจ้งหนี้ หรือ ใบเสร็จรับเงิน */
  kind: 'INVOICE' | 'RECEIPT';
  firmName: string;
  firmProfile?: { legalName: string | null; billingAddress: string | null; taxId: string | null; taxBranch: string | null };
  logoDataUrl?: string;
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
  /** ยอดสุทธิหลังหักส่วนลด */
  totalAmount: number;
  discountAmount?: number;
  discountReason?: string | null;
}

const escapeHtml = (text: string) =>
  text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const baht = (amount: number) =>
  `${amount.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} บาท`;

export function suggestWht(rate: number, feeBase: number, amount: number, wht: number, outstanding: number, invoiceTotal: number): number {
  return invoiceTotal > 0 ? Math.round(rate * feeBase * Math.min(amount + wht, outstanding) / invoiceTotal * 100) / 100 : 0;
}

export function bahtText(amount: number): string {
  const digits = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
  const units = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];
  const read = (n: number, afterMillion = false): string => {
    if (n >= 1000000) return read(Math.floor(n / 1000000)) + 'ล้าน' + read(n % 1000000, true);
    return String(n).split('').map((char, index, all) => {
      const d = Number(char), place = all.length - index - 1;
      if (!d) return '';
      if (place === 0 && d === 1 && (n > 10 || afterMillion)) return 'เอ็ด';
      if (place === 1 && d === 1) return 'สิบ';
      if (place === 1 && d === 2) return 'ยี่สิบ';
      return digits[d] + units[place];
    }).join('');
  };
  const cents = Math.round(amount * 100);
  const whole = Math.floor(cents / 100), fraction = cents % 100;
  return (whole ? read(whole) : 'ศูนย์') + 'บาท' + (fraction ? read(fraction) + 'สตางค์' : 'ถ้วน');
}

const thaiDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })
    : null;

/**
 * Printable invoice/receipt. The user prints and picks "Save as PDF" in the
 * browser dialog — no server-side PDF generation.
 */
export function buildBillingDocHtml(data: BillingDocData): string {
  const esc = (value: string | null | undefined) => escapeHtml(value ?? '');
  const title = data.kind === 'INVOICE' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน';
  const labels = { LITIGATION_EXEMPT: 'ยกเว้น VAT', ADVISORY_VAT: 'VAT', DISBURSEMENT: 'จ่ายแทน' };
  const discount = data.discountAmount ?? 0;
  return renderStandard(title, data.invoiceNumber, {
    firm: `<div class="firm">${data.logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(data.logoDataUrl)}">` : ''}<div><b>${esc(data.firmProfile?.legalName || data.firmName)}</b><p>${esc(data.firmProfile?.billingAddress)}</p><p>${esc(data.firmProfile?.taxId)} ${esc(data.firmProfile?.taxBranch)}</p></div></div>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1><div class="meta"><span>เลขที่</span><b>${esc(data.invoiceNumber)}</b><span>วันที่</span><b>${esc(thaiDate(data.issuedAt))}</b><span>ครบกำหนดชำระ</span><b>${esc(thaiDate(data.dueAt))}</b>${data.matterLabel ? `<span>เรื่อง-คดี</span><b>${esc(data.matterLabel)}</b>` : ''}</div>`,
    customer: `<section><b>เรียกเก็บจาก / ผู้ว่าจ้าง</b><p>${esc(data.billTo?.name)}</p><p>${esc(data.billTo?.address)}</p><p>${data.billTo?.taxId ? `เลขประจำตัวผู้เสียภาษี ${esc(data.billTo.taxId)}` : ''}${data.billTo?.branch ? ` · สาขาที่ ${esc(data.billTo.branch)}` : ''}</p></section>`,
    items: `<table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>ประเภทภาษี</th><th>จำนวนเงิน</th></tr></thead><tbody>${data.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${l.taxClass ? labels[l.taxClass] : '—'}</td><td class="num">${baht(l.amount)}</td></tr>`).join('')}</tbody></table>`,
    totals: `<section class="totals">${discount ? `<p><span>รวมก่อนหักส่วนลด</span><b>${baht(data.totalAmount + discount)}</b></p><p><span>ส่วนลด${data.discountReason ? ` (${esc(data.discountReason)})` : ''}</span><b>-${baht(discount)}</b></p>` : ''}<p><span>รวมทั้งสิ้น</span><b>${baht(data.totalAmount)}</b></p></section>`,
    words: `<section><b>จำนวนเงินตัวอักษร</b><p>${bahtText(data.totalAmount)}</p></section>`,
    payment: '',
    signatures: '<div class="sign"><div>........................................<br>ผู้จัดทำ</div><div>........................................<br>ผู้มีอำนาจลงนาม</div></div>',
  });
}

/** Open a print window for the document; returns false when popups are blocked. */
export function openBillingDocWindow(html: string, win: Window | null = window.open('', '_blank')): boolean {
  if (!win) return false;
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
  return true;
}

/** The standard receipt blocks are kept in order for future template editing. */
export const STANDARD_V1_BLOCKS = ['firm', 'title', 'customer', 'items', 'totals', 'words', 'payment', 'signatures'] as const;

function renderStandard(title: string, number: string, blocks: Record<typeof STANDARD_V1_BLOCKS[number], string>, watermark = ''): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><title>${escapeHtml(title)} ${escapeHtml(number)}</title><style>@page{size:A4;margin:18mm}*{box-sizing:border-box}body{font:14px Sarabun,'Noto Sans Thai',sans-serif;color:#142E43}p{margin:4px 0}h1{font-size:22px;margin:0 0 8px}h3{font-size:14px;margin:0 0 6px}small{font-size:12px;border:1px solid #b99b60;padding:4px}section{border:1px solid #E2DED5;padding:16px;border-radius:4px}header{display:grid;grid-template-columns:1fr 1fr;gap:24px;border-bottom:1px solid #E2DED5;padding-bottom:6mm;margin-bottom:6mm}.firm{display:flex;gap:16px}.firm img{width:64px;height:64px;object-fit:contain}.doc-title{text-align:right}.meta{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;text-align:left;background:#f8f6f1;border:1px solid #E2DED5;border-radius:4px;padding:12px}.meta b{text-align:right}.customer,.items,.summary{margin-bottom:6mm}.customer{background:#faf9f6}table{width:100%;border-collapse:collapse}th,td{border:1px solid #E2DED5;padding:6px 10px;text-align:left}th{background:#f2f0ea}.num{text-align:right;white-space:nowrap}.summary{display:grid;grid-template-columns:3fr 2fr;gap:6mm}.words{background:#faf8f3;margin-bottom:3mm}.totals p{display:flex;justify-content:space-between;gap:12px;border-bottom:1px solid #E2DED5;padding:5px 0}.totals .net{background:#142E43;color:white;padding:10px;border-radius:3px}.sign{display:flex;justify-content:space-around;border-top:1px solid #E2DED5;padding-top:6mm;margin-top:10mm;text-align:center}.stamp{display:inline-flex;width:70px;height:70px;border:1px dashed #b99b60;border-radius:50%;align-items:center;justify-content:center;color:#9c8048;font-size:11px}footer{border-top:1px solid #E2DED5;margin-top:10mm;padding-top:4mm;text-align:right;font-size:11px;color:#7b8285}.void{position:fixed;top:40%;left:20%;font-size:64px;color:rgba(180,0,0,.25);transform:rotate(-25deg);pointer-events:none}</style></head><body>${watermark}<header>${blocks.firm}<div class="doc-title">${blocks.title}</div></header><div class="customer">${blocks.customer}</div><div class="items">${blocks.items}</div><div class="summary"><div>${blocks.words}${blocks.payment}</div>${blocks.totals}</div>${blocks.signatures}<footer>เอกสารออกโดยระบบสำนวน · หน้า 1/1</footer></body></html>`;
}

export function buildReceiptDocHtml(data: import('./api').ReceiptPrintData, logoDataUrl?: string, replacedNumber?: string, outstanding?: number): string {
  const esc = (s: string | null | undefined) => escapeHtml(s ?? '');
  const snapshot = data.firmSnapshot;
  const totals = data.totals;
  const labels = { LITIGATION_EXEMPT: 'ยกเว้น VAT', ADVISORY_VAT: 'VAT', DISBURSEMENT: 'จ่ายแทน' };
  const title = data.isTaxInvoice ? 'ใบเสร็จรับเงิน/ใบกำกับภาษี' : 'ใบเสร็จรับเงิน';
  const blocks: Record<typeof STANDARD_V1_BLOCKS[number], string> = {
    firm: `<div class="firm">${logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(logoDataUrl)}">` : ''}<div><b>${esc(snapshot.legalName)}</b><p>${esc(snapshot.address)}</p><p>เลขประจำตัวผู้เสียภาษี ${esc(snapshot.taxId)} ${snapshot.taxBranch === '00000' ? '(สำนักงานใหญ่)' : esc(snapshot.taxBranch)}</p></div></div>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1><div class="meta"><span>เลขที่</span><b>${esc(data.receiptNumber)}</b><span>วันที่</span><b>${esc(thaiDate(data.issuedAt))}</b><span>อ้างอิงใบแจ้งหนี้</span><b>${esc(data.invoice.invoiceNumber)}</b>${data.invoice.case || data.invoice.intake?.title ? `<span>เรื่อง-คดี</span><b>${esc(data.invoice.case ? `${data.invoice.case.ownRef} — ${data.invoice.case.title}` : data.invoice.intake?.title)}</b>` : ''}</div>`,
    customer: `<section><b>ได้รับเงินจาก</b><p>${esc(data.customer?.name)}</p><p>${esc(data.customer?.address)}</p><p>เลขประจำตัวผู้เสียภาษี ${esc(data.customer?.taxId)}${data.customer?.branch ? ` · สาขาที่ ${esc(data.customer.branch)}` : ''}</p></section>`,
    items: `<h3>รายการตามใบแจ้งหนี้ ${esc(data.invoice.invoiceNumber)}</h3><table><thead><tr><th>ลำดับ</th><th>รายการ</th><th>ประเภทภาษี</th><th>จำนวนเงิน</th></tr></thead><tbody>${data.invoice.lineItems.map((l, i) => `<tr><td>${i + 1}</td><td>${esc(l.description)}</td><td>${labels[l.taxClass]}</td><td class="num">${baht(l.amount)}</td></tr>`).join('')}</tbody></table>`,
    totals: `<section class="totals">${([['มูลค่ายกเว้นภาษี', totals.amountExempt], ['มูลค่าที่คิดภาษี', totals.amountTaxable], ['ภาษีมูลค่าเพิ่ม 7%', totals.amountVat], ['เงินจ่ายแทน', totals.amountDisbursement], ['รวมชำระครั้งนี้', totals.totalAmount], ['หัก ณ ที่จ่าย', totals.amountWht], ['ยอดรับสุทธิ', totals.amountReceived]] as const).filter(([, amount]) => amount !== 0).map(([label, amount], i, rows) => `<p class="${i === rows.length - 1 ? 'net' : ''}"><span>${label}</span><b>${baht(amount)}</b></p>`).join('')}</section>`,
    words: `<section class="words"><b>จำนวนเงินตัวอักษร</b><p>${bahtText(totals.totalAmount)}</p>${totals.totalAmount < data.invoice.totalAmount ? `<p>ชำระครั้งนี้ ${baht(totals.totalAmount)} จากยอด ${baht(data.invoice.totalAmount)} (คงค้าง ${baht(data.outstandingAfter ?? outstanding ?? 0)})</p>` : ''}${replacedNumber ? `<p>ออกแทน ${esc(replacedNumber)}</p>` : ''}</section>`,
    payment: `<section class="payment"><b>ข้อมูลการชำระเงิน</b><p>วิธีชำระ: ${esc(({ TRANSFER: 'โอนเงิน', CHEQUE: 'เช็ค', CASH: 'เงินสด', OTHER: 'อื่น ๆ' })[data.payment.method])} ${esc(data.payment.note)}</p><p>วันที่รับเงิน: ${esc(thaiDate(data.payment.receivedAt))}</p>${data.payment.whtCertificateNo ? `<p>หนังสือรับรอง (50 ทวิ): ${esc(data.payment.whtCertificateNo)}</p>` : ''}</section>`,
    signatures: '<div class="sign"><div><span class="stamp">ตราประทับ</span><br>........................................<br>ผู้รับเงิน</div><div>........................................<br>ผู้มีอำนาจลงนาม</div></div>',
  };
  return renderStandard(title, data.receiptNumber, blocks, data.voidedAt ? `<div class="void">ยกเลิกแล้ว</div><section>ยกเลิกแล้ว: ${esc(data.voidReason)}</section>` : '');
}

export async function invoiceFirmData(token: string) {
  const { api } = await import('./api');
  const firmProfile = await api.getBillingProfile(token);
  let logoDataUrl: string | undefined;
  if (firmProfile.logoKey) {
    const blob = await api.getBillingLogo(token, firmProfile.logoKey);
    logoDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('โหลดโลโก้ไม่สำเร็จ ลองใหม่อีกครั้ง')); reader.readAsDataURL(blob); });
  }
  return { firmProfile, logoDataUrl };
}
