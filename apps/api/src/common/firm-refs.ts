import { BadRequestException } from '@nestjs/common';
import { FirmRole } from '@lawfirm/shared';
import { PrismaService } from '../prisma/prisma.module';

type Db = Pick<PrismaService, 'client' | 'clientContact' | 'caseType' | 'firmMember'>;

export interface FirmRefs {
  /** Client rows — also what customerId / additional clientId point at. */
  clientIds?: Array<string | null | undefined>;
  contactIds?: Array<string | null | undefined>;
  caseTypeIds?: Array<string | null | undefined>;
  /** People named on the record (lead lawyer, assessor, follow-up owner…). */
  userIds?: Array<string | null | undefined>;
}

export interface AssertFirmRefsOptions {
  /** Roles that may not be named; defaults to [EXTERNAL]. Pass [] where a freelancer is allowed (workflow steps). */
  excludeRoles?: FirmRole[];
}

const present = (ids?: Array<string | null | undefined>) => [...new Set((ids ?? []).filter((id): id is string => !!id))];

/**
 * Every id a request body names must belong to the caller's firm. Prisma
 * happily links a row from another tenant by id, and the record's includes
 * then hand that tenant's names, phones and emails back to the caller — so
 * services check here before they write, not after.
 */
export async function assertFirmRefs(
  db: Db,
  firmId: string,
  refs: FirmRefs,
  opts?: AssertFirmRefsOptions,
): Promise<void> {
  const clientIds = present(refs.clientIds);
  const contactIds = present(refs.contactIds);
  const caseTypeIds = present(refs.caseTypeIds);
  const userIds = present(refs.userIds);
  const [clients, contacts, caseTypes, members] = await Promise.all([
    clientIds.length ? db.client.count({ where: { id: { in: clientIds }, firmId } }) : 0,
    contactIds.length ? db.clientContact.count({ where: { id: { in: contactIds }, client: { firmId } } }) : 0,
    caseTypeIds.length ? db.caseType.count({ where: { id: { in: caseTypeIds }, firmId } }) : 0,
    userIds.length
      ? db.firmMember.count({
          where: {
            userId: { in: userIds },
            firmId,
            // Staff fields by default: a freelancer is only ever placed on a workflow step, which opts in.
            ...((opts?.excludeRoles ?? [FirmRole.EXTERNAL]).length ? { role: { notIn: opts?.excludeRoles ?? [FirmRole.EXTERNAL] } } : {}),
          },
        })
      : 0,
  ]);
  if (clients !== clientIds.length) throw new BadRequestException('ลูกความที่เลือกไม่อยู่ในสำนักงานนี้');
  if (contacts !== contactIds.length) throw new BadRequestException('ผู้ติดต่อที่เลือกไม่อยู่ในสำนักงานนี้');
  if (caseTypes !== caseTypeIds.length) throw new BadRequestException('ประเภทคดีที่เลือกไม่อยู่ในสำนักงานนี้');
  if (members !== userIds.length) {
    if ((opts?.excludeRoles ?? [FirmRole.EXTERNAL]).length) {
      throw new BadRequestException(`ผู้ใช้ที่เลือกไม่ได้อยู่ในสำนักงานนี้หรือมีบทบาทที่ไม่อนุญาต`);
    }
    throw new BadRequestException('ผู้ใช้ที่เลือกไม่ได้อยู่ในสำนักงานนี้');
  }
}
