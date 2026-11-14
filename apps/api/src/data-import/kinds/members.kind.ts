import { BadRequestException } from '@nestjs/common';
import { AuthUser, FIRM_ROLE_LABELS, FirmRole, canInviteFirmRole, hasFirmCapability } from '@lawfirm/shared';
import type { Invitation } from '../../generated/prisma';
import type { RawImportRow } from '../../common/excel-import/types';
import type { ImportDraft, ImportKindDef, ImportKindDeps } from '../import-kind';
import { checkDuplicate, draftFor, emailProblem, memberHelp, normalized, ownValue, requiredText, staffCanImport, staffMembers, ImportMember } from '../kind-helpers';

export const MEMBER_HEADERS = ['อีเมล *', 'ตำแหน่ง *'] as const;
const ROLES = Object.fromEntries(Object.entries(FIRM_ROLE_LABELS).filter(([role]) => role !== FirmRole.OWNER).map(([role, labels]) => [labels.th, role as FirmRole]));
export interface MemberLookups { members: ImportMember[]; memberEmails: Set<string>; pendingEmails: Set<string>; maxUsers: number; seatsLeft: number }
export interface MemberDraft extends ImportDraft { email: string; role: FirmRole }
export const canImportMembers = (user: AuthUser) => staffCanImport(user) && hasFirmCapability(user.firmRole, 'inviteMembers');
export function resolveMemberRows(rows: RawImportRow[], lookups: MemberLookups, user: AuthUser): MemberDraft[] {
  const seen = new Map<string, number>();
  let seats = lookups.seatsLeft;
  return rows.map((row) => {
    const draft = draftFor(row, user, canImportMembers(user));
    const email = emailProblem(draft, MEMBER_HEADERS[0], true);
    draft.cells[MEMBER_HEADERS[0]] = email;
    const label = requiredText(draft, MEMBER_HEADERS[1]);
    const role = ownValue(ROLES, label);
    if (label && !role) draft.problems.push(`${MEMBER_HEADERS[1]}: ตำแหน่งไม่ถูกต้องหรือไม่อนุญาต ${label}`);
    else if (role && !canInviteFirmRole(user.firmRole, role)) draft.problems.push(`${MEMBER_HEADERS[1]}: คุณไม่มีสิทธิ์เชิญตำแหน่ง ${label}`);
    if (email) {
      if (lookups.memberEmails.has(normalized(email))) draft.problems.push(`${MEMBER_HEADERS[0]}: ${email} เป็นสมาชิกของสำนักงานแล้ว`);
      if (lookups.pendingEmails.has(normalized(email))) draft.problems.push(`${MEMBER_HEADERS[0]}: ${email} มีคำเชิญที่ยังไม่หมดอายุแล้ว`);
      checkDuplicate(draft, normalized(email), new Set(), seen, MEMBER_HEADERS[0]);
    }
    // Same count as TenantService.seatsUsed (members + pending invitations): say so in the preview, not only at save.
    if (!draft.problems.length && seats-- <= 0) draft.problems.push(`${MEMBER_HEADERS[0]}: ครบจำนวนผู้ใช้ตามแพ็กเกจแล้ว (${lookups.maxUsers} ที่นั่ง รวมคำเชิญที่ยังไม่ตอบ) — อัปเกรดแพ็กเกจหรือลดจำนวนแถว`);
    return { ...draft, email, role: role ?? FirmRole.ASSISTANT };
  });
}
export function membersKind(deps: ImportKindDeps): ImportKindDef<MemberDraft, MemberLookups> {
  return {
    kind: 'members', label: 'สมาชิกทีม', sheet: 'สมาชิกทีม', headers: MEMBER_HEADERS, required: [...MEMBER_HEADERS], canImport: canImportMembers,
    help: { 'อีเมล *': 'อีเมลผู้รับคำเชิญ ห้ามซ้ำกับสมาชิกหรือคำเชิญที่ยังไม่หมดอายุในสำนักงาน', 'ตำแหน่ง *': 'เลือกตำแหน่งที่คุณเชิญได้ ไม่อนุญาตเจ้าของสำนักงาน; ส่งอีเมลคำเชิญหลังบันทึกสำเร็จ คำเชิญมีอายุ 7 วัน' },
    template: (lookups, user) => ({ dropdowns: [[MEMBER_HEADERS[1], Object.entries(ROLES).filter(([, role]) => canInviteFirmRole(user.firmRole, role)).map(([label]) => label)]], examples: [['new.member@example.com', FIRM_ROLE_LABELS[FirmRole.ASSISTANT].th]], extraHelp: memberHelp(lookups.members) }),
    async lookups(db, user) {
      const [members, allMembers, invitations, firm] = await Promise.all([
        staffMembers(db, user),
        db.firmMember.findMany({ where: { firmId: user.firmId }, select: { user: { select: { email: true } } } }),
        db.invitation.findMany({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } }, select: { email: true } }),
        db.firm.findUnique({ where: { id: user.firmId }, select: { maxUsers: true } }),
      ]);
      const maxUsers = firm?.maxUsers ?? 0;
      return { members, memberEmails: new Set(allMembers.map((member) => normalized(member.user.email))), pendingEmails: new Set(invitations.map((invitation) => normalized(invitation.email))), maxUsers, seatsLeft: Math.max(0, maxUsers - allMembers.length - invitations.length) };
    },
    resolve: resolveMemberRows,
    async commit(tx, user, drafts) {
      if (!drafts.length) return { created: 0 };
      const check = await deps.tenant.assertCanInvite(user.firmId, drafts[0].email);
      if (!check.allowed) throw new BadRequestException(check.message);
      // TenantService checks a single invitation outside this tx; reserve capacity for the whole batch here.
      const [firm, members, pending] = await Promise.all([
        tx.firm.findUnique({ where: { id: user.firmId }, select: { maxUsers: true } }),
        tx.firmMember.count({ where: { firmId: user.firmId } }),
        tx.invitation.count({ where: { firmId: user.firmId, acceptedAt: null, expiresAt: { gt: new Date() } } }),
      ]);
      if (!firm) throw new BadRequestException('ไม่พบสำนักงาน');
      if (members + pending + drafts.length > firm.maxUsers) throw new BadRequestException(`จำนวนสมาชิกและคำเชิญรวมรายการนำเข้าเกินโควตา ${firm.maxUsers} คน`);
      const invitations: Invitation[] = [];
      for (const draft of drafts) invitations.push(await deps.invitations.createForImport(tx, user, draft.email, draft.role));
      return { created: invitations.length, after: async () => {
        for (const invitation of invitations) await deps.invitations.sendInvitation(user, invitation);
      } };
    },
  };
}
