import { PHONE_HINT, PHONE_REGEX } from '@lawfirm/shared';
import { CreateClientDto } from '../../clients/dto/client.dto';
import type { RawImportRow } from '../../common/excel-import/types';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, draftFor, emailProblem, lawyerCanImport, maxLength, normalized, requiredText } from '../kind-helpers';

export const CLIENT_HEADERS = ['ชื่อลูกความ *', 'ประเภท', 'เลขประจำตัวผู้เสียภาษี', 'สาขา', 'ที่อยู่', 'อีเมลออกเอกสาร', 'โทรศัพท์ออกเอกสาร', 'หมายเหตุ', 'ผู้ติดต่อหลัก', 'อีเมลผู้ติดต่อ', 'โทรศัพท์ผู้ติดต่อ', 'ตำแหน่งผู้ติดต่อ'] as const;
export interface ClientLookups { existing: Set<string> }
export interface ClientDraft extends ImportDraft { data: CreateClientDto }

export function resolveClientRows(rows: RawImportRow[], lookups: ClientLookups, user: Parameters<ImportKindDef['canImport']>[0]): ClientDraft[] {
  const seen = new Map<string, number>();
  return rows.map((row) => {
    const draft = draftFor(row, user, lawyerCanImport(user));
    const name = requiredText(draft, CLIENT_HEADERS[0]);
    for (const [header, limit] of [[CLIENT_HEADERS[0], 200], ['เลขประจำตัวผู้เสียภาษี', 50], ['สาขา', 120], ['ที่อยู่', 500], ['อีเมลออกเอกสาร', 200], ['โทรศัพท์ออกเอกสาร', 50], ['ผู้ติดต่อหลัก', 200], ['ตำแหน่งผู้ติดต่อ', 100]] as const) maxLength(draft, header, limit);
    emailProblem(draft, 'อีเมลออกเอกสาร');
    emailProblem(draft, 'อีเมลผู้ติดต่อ');
    const contactName = draft.cells['ผู้ติดต่อหลัก'];
    if (!contactName && ['อีเมลผู้ติดต่อ', 'โทรศัพท์ผู้ติดต่อ', 'ตำแหน่งผู้ติดต่อ'].some((header) => draft.cells[header])) draft.problems.push('ผู้ติดต่อหลัก: ต้องกรอกชื่อเมื่อมีข้อมูลอีเมล โทรศัพท์ หรือตำแหน่งผู้ติดต่อ');
    const phone = draft.cells['โทรศัพท์ผู้ติดต่อ'];
    if (phone && !PHONE_REGEX.test(phone)) draft.problems.push(`โทรศัพท์ผู้ติดต่อ: ${phone} ${PHONE_HINT}`);
    if (name) checkDuplicate(draft, normalized(name), lookups.existing, seen, CLIENT_HEADERS[0]);
    const optional = (header: string) => draft.cells[header] || undefined;
    const data: CreateClientDto = {
      name,
      type: optional('ประเภท'), taxId: optional('เลขประจำตัวผู้เสียภาษี'), branch: optional('สาขา'), address: optional('ที่อยู่'),
      billingEmail: optional('อีเมลออกเอกสาร'), billingPhone: optional('โทรศัพท์ออกเอกสาร'), notes: optional('หมายเหตุ'),
      contacts: [{ name: contactName || name, email: optional('อีเมลผู้ติดต่อ'), phone: optional('โทรศัพท์ผู้ติดต่อ'), position: optional('ตำแหน่งผู้ติดต่อ'), isPrimary: true, portalEnabled: false }],
    };
    return { ...draft, data };
  });
}

export function clientsKind(_deps: ImportKindDeps): ImportKindDef<ClientDraft, ClientLookups> {
  return {
    kind: 'clients', label: 'ลูกความ', sheet: 'ลูกความ', headers: CLIENT_HEADERS, required: [CLIENT_HEADERS[0]], canImport: lawyerCanImport,
    help: {
      'ชื่อลูกความ *': 'ชื่อไม่เกิน 200 ตัวอักษร ต้องไม่ซ้ำกับลูกความเดิมหรือในไฟล์', 'ประเภท': 'บุคคลธรรมดา/นิติบุคคล หรือระบุข้อความอื่นได้',
      'เลขประจำตัวผู้เสียภาษี': 'ไม่เกิน 50 ตัวอักษร', 'สาขา': 'ไม่เกิน 120 ตัวอักษร', 'ที่อยู่': 'ไม่เกิน 500 ตัวอักษร',
      'อีเมลออกเอกสาร': 'อีเมลที่ถูกต้อง ไม่เกิน 200 ตัวอักษร', 'โทรศัพท์ออกเอกสาร': 'โทรศัพท์ไม่เกิน 50 ตัวอักษร', 'หมายเหตุ': 'บันทึกเพิ่มเติม',
      'ผู้ติดต่อหลัก': 'เว้นว่าง = ชื่อลูกความ ต้องกรอกเมื่อมีข้อมูลผู้ติดต่ออื่น ไม่เกิน 200 ตัวอักษร', 'อีเมลผู้ติดต่อ': 'อีเมลที่ถูกต้อง',
      'โทรศัพท์ผู้ติดต่อ': PHONE_HINT, 'ตำแหน่งผู้ติดต่อ': 'ไม่เกิน 100 ตัวอักษร; ผู้ติดต่อที่สร้างไม่เปิดใช้พอร์ทัล',
    },
    template: () => ({ dropdowns: [['ประเภท', ['บุคคลธรรมดา', 'นิติบุคคล']]], examples: [['บริษัท ตัวอย่าง จำกัด', 'นิติบุคคล', '0100000000001', 'สำนักงานใหญ่', 'กรุงเทพมหานคร', 'billing@example.com', '021234567', '', 'สมชาย ใจดี', 'contact@example.com', '0812345678', 'ผู้จัดการ']] }),
    async lookups(db, user) {
      const clients = await db.client.findMany({ where: { firmId: user.firmId }, select: { name: true } });
      return { existing: new Set(clients.map((client) => normalized(client.name))) };
    },
    resolve: resolveClientRows,
    async commit(tx, user, drafts) {
      for (const { data } of drafts) {
        const { contacts, ...client } = data;
        await tx.client.create({ data: { ...client, firmId: user.firmId, contacts: { create: contacts.map((contact) => ({ name: contact.name, email: contact.email, phone: contact.phone, position: contact.position, isPrimary: true, portalEnabled: false })) } } });
      }
      return { created: drafts.length };
    },
  };
}
