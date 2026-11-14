import { BadRequestException } from '@nestjs/common';
import { randomInt } from 'node:crypto';
import { CustomFieldDefinitionDto, CustomFieldValue } from '@lawfirm/shared';

type Visibility = Pick<CustomFieldDefinitionDto, 'visibility' | 'ownerUserId'>;
type ValueDefinition = Pick<CustomFieldDefinitionDto, 'type' | 'options'>;
type Definition = Pick<CustomFieldDefinitionDto, 'key' | 'archivedAt' | 'isSensitive'> & Visibility & ValueDefinition;
type Validation = { ok: true; value: CustomFieldValue } | { ok: false; error: string };

export function generateFieldKey(): string {
  return `cf_${randomInt(36 ** 8).toString(36).padStart(8, '0')}`;
}

export function canSee(def: Visibility, userId: string): boolean {
  return def.visibility === 'FIRM' || def.ownerUserId === userId;
}

export function validateValue(def: ValueDefinition, raw: unknown): Validation {
  if (raw === null || raw === '') return { ok: true, value: null };
  switch (def.type) {
    case 'TEXT':
    case 'LONG_TEXT':
      if (typeof raw === 'string' && raw.length <= (def.type === 'TEXT' ? 500 : 5000)) return { ok: true, value: raw };
      break;
    case 'NUMBER':
      if (typeof raw === 'number' && Number.isFinite(raw)) return { ok: true, value: raw };
      break;
    case 'BOOLEAN':
      if (typeof raw === 'boolean') return { ok: true, value: raw };
      break;
    case 'SELECT':
      if (typeof raw === 'string' && def.options.some((opt) => opt.id === raw && !opt.archived)) return { ok: true, value: raw };
      break;
    case 'DATE': {
      if (typeof raw !== 'string' || !/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(raw) || raw.startsWith('0000')) break;
      const date = new Date(`${raw}T00:00:00.000Z`);
      if (Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === raw) return { ok: true, value: raw };
      break;
    }
  }
  return { ok: false, error: `Invalid ${def.type} value` };
}

function record(raw: unknown): Record<string, unknown> {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
}

// Include ALL tenant definitions, even invisible/archived ones. Non-`cf_` keys are legacy/system data and pass through;
// a `cf_` key with no definition (e.g. its personal owner was removed) is hidden, never leaked.
export function redactCustomFields(values: unknown, defs: readonly Definition[], userId: string, ctx: 'app' | 'ai' | 'portal' | 'mcp'): Record<string, unknown> {
  const byKey = new Map(defs.map((def) => [def.key, def]));
  return Object.fromEntries(Object.entries(record(values)).filter(([key]) => {
    const def = byKey.get(key);
    if (!def) return !key.startsWith('cf_');
    return canSee(def, userId) && (ctx === 'app' || (!def.isSensitive && def.visibility !== 'PERSONAL'));
  }));
}

export function mergeCustomFieldPatch(existing: unknown, patch: Record<string, unknown>, defs: readonly Definition[], userId: string): {
  values: Record<string, unknown>;
  changes: { key: string; from: unknown; to: CustomFieldValue }[];
} {
  const values = { ...record(existing) };
  const changes: { key: string; from: unknown; to: CustomFieldValue }[] = [];
  const byKey = new Map(defs.map((def) => [def.key, def]));
  const errors: string[] = [];
  for (const [key, raw] of Object.entries(patch)) {
    if (!key.startsWith('cf_')) {
      Object.defineProperty(values, key, { value: raw, enumerable: true, writable: true, configurable: true });
      continue;
    }
    const def = byKey.get(key);
    // A form re-sending a value it was shown, unchanged (e.g. an archived field's kept value), is not an edit.
    if (def && canSee(def, userId) && values[key] === raw) continue;
    if (!def || !canSee(def, userId) || def.archivedAt) {
      errors.push(`${key}: unknown, archived or unavailable field`);
      continue;
    }
    const result = validateValue(def, raw);
    if (!result.ok) {
      errors.push(`${key}: ${result.error}`);
      continue;
    }
    const from = values[key];
    if (result.value === null) delete values[key];
    else values[key] = result.value;
    if ((from ?? null) !== result.value) changes.push({ key, from, to: result.value });
  }
  if (errors.length) throw new BadRequestException(errors.join('; '));
  return { values, changes };
}

export function isFilled(def: Pick<CustomFieldDefinitionDto, 'type'>, value: unknown): boolean {
  if (def.type === 'NUMBER') return typeof value === 'number' && Number.isFinite(value);
  if (def.type === 'BOOLEAN') return typeof value === 'boolean';
  return typeof value === 'string' && value.trim() !== '';
}

