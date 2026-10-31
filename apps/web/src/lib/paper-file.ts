import type { PaperFileAction, PaperFileActionInput } from './api.ts';

export function paperFileMovementInput(
  action: PaperFileAction,
  fields: { holderUserId: string; location: string; note: string },
): PaperFileActionInput {
  const note = fields.note.trim() || undefined;
  if (action === 'CHECK_OUT') {
    return { action, holderUserId: fields.holderUserId || undefined, note };
  }
  const location = fields.location.trim();
  if (!location) throw new Error('กรุณาระบุที่เก็บสำนวน');
  return { action, location, note };
}
