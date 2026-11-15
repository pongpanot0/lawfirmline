import type { CaseListItem, ClientItem, FirmInvoiceItem, FirmTimesheetEntry } from '@/lib/api';
import { bangkokDateInputValue } from './bangkok.ts';
import { casePartyDisplay } from './case-party-display.ts';
import { csvCell, triggerDownload } from './petty-cash-csv.ts';
import { caseStageLabel } from './stage-labels.ts';

/**
 * List-page CSV exports. Dates are ISO (Bangkok) and amounts plain numbers so
 * Excel can sort and SUM; UTF-8 BOM so Thai text survives Excel.
 */
export function toCsv(rows: string[][]): string {
  return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

export function downloadCsv(csv: string, name: string) {
  triggerDownload(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `${name}-${bangkokDateInputValue(new Date())}.csv`);
}

const day = (iso?: string | null) => (iso ? bangkokDateInputValue(iso) : '');
const num = (n?: number | null) => (n != null ? n.toFixed(2) : '');
const yesNo = (b: boolean) => (b ? 'ใช่' : 'ไม่');

const INVOICE_STATUS_TH: Record<string, string> = { DRAFT: 'ร่าง', SENT: 'ส่งแล้ว รอชำระ', PAID: 'ชำระแล้ว' };

export function buildInvoicesCsv(invoices: FirmInvoiceItem[]): string {
  return toCsv([
    ['เลขที่ใบแจ้งหนี้', 'สถานะ', 'วันที่ออก', 'ครบกำหนดชำระ', 'ผู้ว่าจ้าง', 'ลูกความ', 'เลขคดี', 'เรื่อง', 'ยอดรวม'],
    ...invoices.map((i) => [
      i.invoiceNumber, INVOICE_STATUS_TH[i.status] ?? i.status, day(i.issuedAt ?? i.createdAt), day(i.dueAt),
      i.customerName ?? '', i.clientName ?? '', i.ownRef ?? '', i.subject ?? '', num(i.totalAmount),
    ]),
  ]);
}

export function buildTimesheetCsv(entries: FirmTimesheetEntry[]): string {
  return toCsv([
    ['วันที่', 'ผู้บันทึก', 'เลขคดี', 'รายละเอียด', 'ชั่วโมง', 'อัตรา/ชม.', 'มูลค่า', 'เรียกเก็บได้', 'ออกใบแจ้งหนี้แล้ว', 'ตัดจำหน่าย'],
    ...[...entries].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [
      day(e.date), e.userName, e.caseRef ?? '', e.description ?? '', num(e.hours), num(e.rate), num(e.hours * e.rate),
      yesNo(e.billable), yesNo(e.invoiced), yesNo(e.writtenOff),
    ]),
  ]);
}

export function buildClientsCsv(clients: ClientItem[]): string {
  return toCsv([
    ['ชื่อลูกความ', 'ประเภท', 'เลขผู้เสียภาษี', 'สาขา', 'ที่อยู่', 'อีเมลวางบิล', 'โทรวางบิล', 'ผู้ติดต่อหลัก', 'โทรผู้ติดต่อ', 'อีเมลผู้ติดต่อ', 'คดีเปิด', 'หมายเหตุ'],
    ...clients.map((c) => {
      const p = c.contacts.find((x) => x.isPrimary) ?? c.contacts[0];
      return [
        c.name, c.type === 'COMPANY' ? 'นิติบุคคล' : 'บุคคลธรรมดา', c.taxId ?? '', c.branch ?? '', c.address ?? '',
        c.billingEmail ?? '', c.billingPhone ?? '', p?.name ?? '', p?.phone ?? '', p?.email ?? '',
        c.openCaseCount != null ? String(c.openCaseCount) : '', c.notes ?? '',
      ];
    }),
  ]);
}

/** CaseListItem rows also carry these scalar Case columns (findMany include returns all scalars). */
type CaseRow = CaseListItem & { openedAt?: string; limitationDeadline?: string | null };

export function buildCasesCsv(cases: CaseRow[], opts: { statusLabel: (status: CaseRow['status']) => string; nextCourtDate: (caseId: string) => string | null | undefined }): string {
  return toCsv([
    ['Own Ref', 'Customer Ref', 'Black Case Number', 'Red Case Number', 'ศาล', 'โจทก์', 'จำเลย', 'ชื่อคดี', 'ลูกความ',
      'ประเภทคดี', 'ทุนทรัพย์', 'หมายเหตุ', 'เจ้าของคดี', 'รายได้โดยประมาณ', 'สถานะ', 'ขั้นตอน',
      'วันที่เปิดคดี', 'วันที่ปิดคดี', 'ครบอายุความ', 'นัดศาลครั้งถัดไป'],
    ...cases.map((c) => [
      c.ownRef, c.customerRef ?? '', c.blackCaseNumber ?? '', c.redCaseNumber ?? '', c.courtName ?? '',
      casePartyDisplay(c.participants ?? [], 'plaintiff'), casePartyDisplay(c.participants ?? [], 'defendant'),
      c.title, c.clientName ?? '', c.caseType?.name ?? '', num(c.claimedAmount), c.description ?? '',
      `${c.leadLawyer.firstName} ${c.leadLawyer.lastName}`, num(c.estimatedFee), opts.statusLabel(c.status),
      c.stage ? caseStageLabel(c.stage, 'th') : '', day(c.openedAt), day(c.closedAt), day(c.limitationDeadline), day(opts.nextCourtDate(c.id)),
    ]),
  ]);
}
