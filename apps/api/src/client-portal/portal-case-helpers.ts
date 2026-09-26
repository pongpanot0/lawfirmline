import { BadRequestException } from '@nestjs/common';
import * as fs from 'fs';
import { FirmRole } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';

/** Size cap for every file a client sends through the portal. */
export const PORTAL_UPLOAD_LIMITS = { fileSize: 20 * 1024 * 1024 };

export function uploadedFileBuffer(file: Express.Multer.File): Buffer {
  if (file.buffer) return file.buffer;
  if (file.path) return fs.readFileSync(file.path);
  throw new BadRequestException('Uploaded file is empty');
}

/** Portal actions are recorded as the firm's first owner, since a contact is not a firm user. */
export async function firstFirmOwnerId(tx: Prisma.TransactionClient, firmId: string): Promise<string> {
  const owner = await tx.firmMember.findFirst({
    where: { firmId, role: FirmRole.OWNER },
    orderBy: { createdAt: 'asc' },
    select: { userId: true },
  });
  if (!owner) throw new BadRequestException('สำนักงานยังไม่มีเจ้าของบัญชี');
  return owner.userId;
}

/** A date the client typed becomes a PENDING suggestion a lawyer confirms — never a calendar entry directly. */
export function createClientKeyDateSuggestion(
  tx: Prisma.TransactionClient,
  args: { caseId: string; documentId: string | null; keyDate: string; keyDateLabel?: string; createdById: string },
) {
  return tx.documentDateSuggestion.create({
    data: {
      caseId: args.caseId,
      documentId: args.documentId,
      label: args.keyDateLabel?.trim() || 'วันที่จากลูกความ',
      suggestedDate: new Date(args.keyDate),
      status: 'PENDING',
      createdById: args.createdById,
    },
  });
}
