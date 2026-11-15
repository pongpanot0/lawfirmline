import { STANDARD_V1_LAYOUT, type TemplateLayout, type BlockType } from '@lawfirm/shared';
import QRCode from 'qrcode';

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
  templateSnapshot?: { layout: TemplateLayout; logoKey: string | null } | null;
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

function itemsTable(lines: BillingDocLine[], settings?: { columns?: string[]; groupByTaxClass?: boolean }): string {
  const columns = settings?.columns ?? ['number', 'description', 'taxClass', 'amount'];
  const labels = { LITIGATION_EXEMPT: 'ยกเว้น VAT', ADVISORY_VAT: 'VAT', DISBURSEMENT: 'จ่ายแทน' };
  const headers: Record<string, string> = { number: 'ลำดับ', description: 'รายการ', quantity: 'จำนวน', unitPrice: 'ราคาต่อหน่วย', taxClass: 'ประเภทภาษี', amount: 'จำนวนเงิน' };
  const active = Object.keys(headers).filter(key => columns.includes(key));
  const row = (line: BillingDocLine, index: number) => {
    const cells: Record<string, string> = { number: String(index + 1), description: escapeHtml(line.description), quantity: String(line.quantity), unitPrice: baht(line.unitPrice), taxClass: line.taxClass ? labels[line.taxClass] : '—', amount: baht(line.amount) };
    return `<tr>${active.map(key => `<td${key === 'amount' || key === 'unitPrice' ? ' class="num"' : ''}>${cells[key]}</td>`).join('')}</tr>`;
  };
  const body = settings?.groupByTaxClass
    ? ([['ค่าวิชาชีพ', lines.filter(l => l.taxClass !== 'DISBURSEMENT')], ['เงินจ่ายแทนลูกความ', lines.filter(l => l.taxClass === 'DISBURSEMENT')]] as const).map(([name, group]) => group.length ? `<tr><th colspan="${Math.max(active.length, 1)}">${name}</th></tr>${group.map(l => row(l, lines.indexOf(l))).join('')}` : '').join('')
    : lines.map(row).join('');
  return `<table><thead><tr>${active.map(key => `<th>${headers[key]}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table>`;
}

function firmTax(taxId?: string | null, branch?: string | null): string {
  return taxId ? `เลขประจำตัวผู้เสียภาษี ${escapeHtml(taxId)}${branch ? branch === '00000' ? ' (สำนักงานใหญ่)' : ` สาขาที่ ${escapeHtml(branch)}` : ''}` : '';
}

/**
 * Printable invoice/receipt. The user prints and picks "Save as PDF" in the
 * browser dialog — no server-side PDF generation.
 */
export function buildBillingDocHtml(data: BillingDocData): string {
  const esc = (value: string | null | undefined) => escapeHtml(value ?? '');
  const title = data.kind === 'INVOICE' ? 'ใบแจ้งหนี้' : 'ใบเสร็จรับเงิน';
  const discount = data.discountAmount ?? 0;
  const blocks = {
    firm: `<div class="firm">${data.logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(data.logoDataUrl)}">` : ''}<div><b>${esc(data.firmProfile?.legalName || data.firmName)}</b><p>${esc(data.firmProfile?.billingAddress)}</p><p>${firmTax(data.firmProfile?.taxId, data.firmProfile?.taxBranch)}</p></div></div>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1><div class="meta"><span>เลขที่</span><b>${esc(data.invoiceNumber)}</b><span>วันที่</span><b>${esc(thaiDate(data.issuedAt))}</b><span>ครบกำหนดชำระ</span><b>${esc(thaiDate(data.dueAt))}</b>${data.matterLabel ? `<span>เรื่อง-คดี</span><b>${esc(data.matterLabel)}</b>` : ''}</div>`,
    customer: `<section><b>เรียกเก็บจาก / ผู้ว่าจ้าง</b><p>${esc(data.billTo?.name)}</p><p>${esc(data.billTo?.address)}</p><p>${data.billTo?.taxId ? `เลขประจำตัวผู้เสียภาษี ${esc(data.billTo.taxId)}` : ''}${data.billTo?.branch ? ` · สาขาที่ ${esc(data.billTo.branch)}` : ''}</p></section>`,
    items: itemsTable(data.lines),
    totals: `<section class="totals">${discount ? `<p><span>รวมก่อนหักส่วนลด</span><b>${baht(data.totalAmount + discount)}</b></p><p><span>ส่วนลด${data.discountReason ? ` (${esc(data.discountReason)})` : ''}</span><b>-${baht(discount)}</b></p>` : ''}<p><span>รวมทั้งสิ้น</span><b>${baht(data.totalAmount)}</b></p></section>`,
    words: `<section><b>จำนวนเงินตัวอักษร</b><p>${bahtText(data.totalAmount)}</p></section>`,
    payment: '',
    signatures: '<div class="sign"><div>........................................<br>ผู้จัดทำ</div><div>........................................<br>ผู้มีอำนาจลงนาม</div></div>',
  };
  return renderLayout(title, data.invoiceNumber, blocks, data.templateSnapshot?.layout, {
    logo: data.logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(data.logoDataUrl)}" style="max-width:64px;max-height:64px">` : '',
    firm: `<div><b>${esc(data.firmProfile?.legalName || data.firmName)}</b><p>${esc(data.firmProfile?.billingAddress)}</p></div>`,
    firmTax: `<p>${firmTax(data.firmProfile?.taxId, data.firmProfile?.taxBranch)}</p>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1>`,
    meta: blocks.title.slice(blocks.title.indexOf('<div class="meta">')),
  }, '', data.lines);
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

// EMVCo PromptPay payload with CRC-16/CCITT-FALSE.
function promptpayQr(id: string): string {
  if (!/^(?:\d{10}|\d{13})$/.test(id)) return '';
  const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`;
  const account = field('00', 'A000000677010111') + (id.length === 10 ? field('01', `0066${id.slice(1)}`) : field('02', id));
  const payload = field('00', '01') + field('01', '11') + field('29', account) + field('58', 'TH') + field('53', '764') + '6304';
  let crc = 0xffff;
  for (const char of payload) { crc ^= char.charCodeAt(0) << 8; for (let i = 0; i < 8; i++) crc = ((crc << 1) ^ (crc & 0x8000 ? 0x1021 : 0)) & 0xffff; }
  const qr = QRCode.create(payload + crc.toString(16).toUpperCase().padStart(4, '0'), { errorCorrectionLevel: 'M' }).modules;
  const squares = Array.from({ length: qr.size }, (_, y) => Array.from({ length: qr.size }, (_, x) => qr.get(y, x) ? `<rect x="${x + 4}" y="${y + 4}" width="1" height="1"/>` : '').join('')).join('');
  return `<svg role="img" aria-label="คิวอาร์พร้อมเพย์" viewBox="0 0 ${qr.size + 8} ${qr.size + 8}" width="120" height="120" xmlns="http://www.w3.org/2000/svg"><rect width="100%" height="100%" fill="white"/><g fill="black">${squares}</g></svg>`;
}

function renderLayout(title: string, number: string, blocks: Record<typeof STANDARD_V1_BLOCKS[number], string>, layout: TemplateLayout | undefined, parts: Partial<Record<BlockType, string>>, watermark = '', lines: BillingDocLine[] = []): string {
  if (!layout || (layout.version === 1 && layout.blocks.length === STANDARD_V1_LAYOUT.blocks.length && layout.blocks.every((block, i) => { const standard = STANDARD_V1_LAYOUT.blocks[i]; return block.type === standard.type && block.column === standard.column && !block.hidden && !block.settings; }))) return renderStandard(title, number, blocks, watermark);
  const fragments: Partial<Record<BlockType, string>> = { ...blocks, ...parts };
  // The server already un-hides VAT-required blocks in the snapshot for VAT-registered firms; honour `hidden` here.
  const content = layout.blocks.filter(block => !block.hidden).map(block => {
    const settings = block.settings;
    let html = fragments[block.type] ?? '';
    if (block.type === 'items' && (settings?.columns || settings?.groupByTaxClass)) html = html.slice(0, html.indexOf('<table>')) + itemsTable(lines, settings);
    if (block.type === 'logo' && settings?.logoSize) html = html.replace('max-width:64px;max-height:64px', `max-width:${settings.logoSize}px;max-height:${settings.logoSize}px`);
    if (block.type === 'note') html = `<section>${escapeHtml(settings?.text ?? '')}</section>`;
    if (block.type === 'bank') html = `<section><b>ข้อมูลบัญชีธนาคาร</b><p>${escapeHtml(settings?.bankName ?? '')}</p><p>${escapeHtml(settings?.accountName ?? '')}</p><p>${escapeHtml(settings?.accountNo ?? '')}</p></section>`;
    if (block.type === 'promptpay') html = `<section><b>พร้อมเพย์</b><p>${escapeHtml(settings?.promptpayId ?? '')}</p>${promptpayQr(settings?.promptpayId ?? '')}<p>สแกนจ่ายผ่านแอปธนาคาร</p></section>`;
    if (block.type === 'stamp') html = '<span class="stamp">ตราประทับ</span>';
    if (settings?.fontSize && settings.fontSize !== 'md') html = `<div style="font-size:${settings.fontSize === 'sm' ? '12px' : '16px'}">${html}</div>`;
    return { column: block.column, html: `<div data-block="${escapeHtml(block.id)}">${html}</div>` };
  });
  const rows: string[] = [];
  for (let i = 0; i < content.length; i++) {
    const item = content[i], next = content[i + 1];
    if (item.column !== 'full' && next && next.column !== 'full' && item.column !== next.column) {
      rows.push(`<div class="template-row"><div>${item.column === 'left' ? item.html : next.html}</div><div>${item.column === 'right' ? item.html : next.html}</div></div>`); i++;
    } else if (item.column === 'full') rows.push(`<div>${item.html}</div>`);
    else rows.push(`<div class="template-row"><div>${item.column === 'left' ? item.html : ''}</div><div>${item.column === 'right' ? item.html : ''}</div></div>`);
  }
  const standard = renderStandard(title, number, blocks, watermark);
  return standard.replace('</style>', '.template-blocks{display:grid;gap:6mm}.template-row{display:grid;grid-template-columns:1fr 1fr;gap:6mm}</style>')
    .replace(/<body>[\s\S]*<footer>/, `<body>${watermark}<main class="template-blocks">${rows.join('')}</main><footer>`);
}

export function buildReceiptDocHtml(data: import('./api').ReceiptPrintData, logoDataUrl?: string, replacedNumber?: string, outstanding?: number): string {
  const esc = (s: string | null | undefined) => escapeHtml(s ?? '');
  const snapshot = data.firmSnapshot;
  const totals = data.totals;
  const title = data.isTaxInvoice ? 'ใบเสร็จรับเงิน/ใบกำกับภาษี' : 'ใบเสร็จรับเงิน';
  const blocks: Record<typeof STANDARD_V1_BLOCKS[number], string> = {
    firm: `<div class="firm">${logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(logoDataUrl)}">` : ''}<div><b>${esc(snapshot.legalName)}</b><p>${esc(snapshot.address)}</p><p>${firmTax(snapshot.taxId, snapshot.taxBranch)}</p></div></div>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1><div class="meta"><span>เลขที่</span><b>${esc(data.receiptNumber)}</b><span>วันที่</span><b>${esc(thaiDate(data.issuedAt))}</b><span>อ้างอิงใบแจ้งหนี้</span><b>${esc(data.invoice.invoiceNumber)}</b>${data.invoice.case || data.invoice.intake?.title ? `<span>เรื่อง-คดี</span><b>${esc(data.invoice.case ? `${data.invoice.case.ownRef} — ${data.invoice.case.title}` : data.invoice.intake?.title)}</b>` : ''}</div>`,
    customer: `<section><b>ได้รับเงินจาก</b><p>${esc(data.customer?.name)}</p><p>${esc(data.customer?.address)}</p><p>เลขประจำตัวผู้เสียภาษี ${esc(data.customer?.taxId)}${data.customer?.branch ? ` · สาขาที่ ${esc(data.customer.branch)}` : ''}</p></section>`,
    items: `<h3>รายการตามใบแจ้งหนี้ ${esc(data.invoice.invoiceNumber)}</h3>${itemsTable(data.invoice.lineItems)}`,
    totals: `<section class="totals">${([['มูลค่ายกเว้นภาษี', totals.amountExempt], ['มูลค่าที่คิดภาษี', totals.amountTaxable], ['ภาษีมูลค่าเพิ่ม 7%', totals.amountVat], ['เงินจ่ายแทน', totals.amountDisbursement], ['รวมชำระครั้งนี้', totals.totalAmount], ['หัก ณ ที่จ่าย', totals.amountWht], ['ยอดรับสุทธิ', totals.amountReceived]] as const).filter(([, amount]) => amount !== 0).map(([label, amount], i, rows) => `<p class="${i === rows.length - 1 ? 'net' : ''}"><span>${label}</span><b>${baht(amount)}</b></p>`).join('')}</section>`,
    words: `<section class="words"><b>จำนวนเงินตัวอักษร</b><p>${bahtText(totals.totalAmount)}</p>${totals.totalAmount < data.invoice.totalAmount ? `<p>ชำระครั้งนี้ ${baht(totals.totalAmount)} จากยอด ${baht(data.invoice.totalAmount)} (คงค้าง ${baht(data.outstandingAfter ?? outstanding ?? 0)})</p>` : ''}${replacedNumber ? `<p>ออกแทน ${esc(replacedNumber)}</p>` : ''}</section>`,
    payment: `<section class="payment"><b>ข้อมูลการชำระเงิน</b><p>วิธีชำระ: ${esc(({ TRANSFER: 'โอนเงิน', CHEQUE: 'เช็ค', CASH: 'เงินสด', OTHER: 'อื่น ๆ' })[data.payment.method])} ${esc(data.payment.note)}</p><p>วันที่รับเงิน: ${esc(thaiDate(data.payment.receivedAt))}</p>${data.payment.whtCertificateNo ? `<p>หนังสือรับรอง (50 ทวิ): ${esc(data.payment.whtCertificateNo)}</p>` : ''}</section>`,
    signatures: '<div class="sign"><div><span class="stamp">ตราประทับ</span><br>........................................<br>ผู้รับเงิน</div><div>........................................<br>ผู้มีอำนาจลงนาม</div></div>',
  };
  return renderLayout(title, data.receiptNumber, blocks, data.templateSnapshot?.layout, {
    logo: logoDataUrl ? `<img alt="โลโก้สำนักงาน" src="${esc(logoDataUrl)}" style="max-width:64px;max-height:64px">` : '',
    firm: `<div><b>${esc(snapshot.legalName)}</b><p>${esc(snapshot.address)}</p></div>`,
    firmTax: `<p>${firmTax(snapshot.taxId, snapshot.taxBranch)}</p>`,
    title: `<h1>${title} <small>ต้นฉบับ</small></h1>`,
    meta: blocks.title.slice(blocks.title.indexOf('<div class="meta">')),
  }, data.voidedAt ? `<div class="void">ยกเลิกแล้ว</div><section>ยกเลิกแล้ว: ${esc(data.voidReason)}</section>` : '', data.invoice.lineItems);
}

export async function invoiceFirmData(token: string, logoKey?: string | null) {
  const { api } = await import('./api');
  const firmProfile = await api.getBillingProfile(token);
  let logoDataUrl: string | undefined;
  const key = logoKey ?? firmProfile.logoKey;
  if (key) {
    const blob = await api.getBillingLogo(token, key);
    logoDataUrl = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('โหลดโลโก้ไม่สำเร็จ ลองใหม่อีกครั้ง')); reader.readAsDataURL(blob); });
  }
  return { firmProfile, logoDataUrl };
}
