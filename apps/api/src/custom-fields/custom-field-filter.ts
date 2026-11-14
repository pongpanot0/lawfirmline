import { BadRequestException } from '@nestjs/common';
import { CustomFieldDefinitionDto } from '@lawfirm/shared';
import { Prisma } from '../generated/prisma';
import { canSee, validateValue } from './custom-field-rules';

export function customFieldFilter(raw: string | undefined, definitions: CustomFieldDefinitionDto[], userId: string) {
  if (raw === undefined) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { throw new BadRequestException('Invalid cf JSON'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new BadRequestException('cf must be an object');
  const entries = Object.entries(parsed);
  if (entries.length > 5) throw new BadRequestException('cf allows at most 5 fields');
  return entries.map(([key, value]) => {
    const def = definitions.find(d => d.key === key && canSee(d, userId) && !d.archivedAt);
    if (!def) throw new BadRequestException(`${key}: unavailable custom field`);
    if (value === '__empty') return { OR: [
      { customFields: { path: [key], equals: Prisma.AnyNull } },
      { NOT: { customFields: { path: [key], not: Prisma.AnyNull } } },
    ] };
    const validated = validateValue(def, value);
    if (!validated.ok) throw new BadRequestException(`${key}: ${validated.error}`);
    return { customFields: { path: [key], equals: validated.value === null ? Prisma.AnyNull : validated.value } };
  });
}
