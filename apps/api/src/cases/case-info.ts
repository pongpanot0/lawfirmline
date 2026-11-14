import { isFilled } from '../custom-fields/custom-field-rules';
import { CaseStage, partySide, CustomFieldDefinitionDto } from '@lawfirm/shared';
import { journeyStage } from './case-journey';

export function missingCaseInfo(
  legalCase: {
    stage: string;
    caseTypeId?: string | null;
    partyRole: string | null;
    courtName?: string | null;
    chargeSection?: string | null;
    customFields?: unknown;
    participants?: { name: string; side?: string | null; role?: string | null }[];
  },
  fieldSchema: unknown,
  definitions: Pick<CustomFieldDefinitionDto, 'key' | 'label' | 'required' | 'caseTypeIds' | 'archivedAt' | 'visibility' | 'entityKind' | 'type'>[] = [],
): string[] {
  const fields = Array.isArray(fieldSchema) ? fieldSchema : [];
  const customFields = legalCase.customFields && typeof legalCase.customFields === 'object' && !Array.isArray(legalCase.customFields)
    ? legalCase.customFields as Record<string, unknown> : {};
  const ourSide = partySide(legalCase.partyRole);
  const hasOpponent = (legalCase.participants ?? []).some((p) => p.name.trim() && (
    p.side ? p.side === 'OPPONENT' : ourSide && partySide(p.role) && partySide(p.role) !== ourSide
  ));
  const missing: string[] = [];
  for (const field of fields) {
    if (!field || !field.required || typeof field.key !== 'string' || typeof field.label !== 'string') continue;
    if (field.key === 'opposingParty') {
      if (!hasOpponent) missing.push(field.label);
      continue;
    }
    // Case has no chargeSection column: the web stores it as customFields.chargeSection.
    const value = field.key === 'chargeSection' ? (legalCase.chargeSection ?? customFields.chargeSection) : customFields[field.key];
    if (typeof value !== 'string' || !value.trim()) missing.push(field.label);
  }
  missing.push(...missingRequiredCustomFields(legalCase.caseTypeId, customFields, definitions));
  if (journeyStage(legalCase.stage) !== CaseStage.PRE_LITIGATION && !legalCase.courtName?.trim()) missing.push('ศาล');
  return missing;
}

/** Labels of required firm case fields (for this case type) that are still empty. */
export function missingRequiredCustomFields(
  caseTypeId: string | null | undefined,
  customFields: Record<string, unknown>,
  definitions: Pick<CustomFieldDefinitionDto, 'key' | 'label' | 'required' | 'caseTypeIds' | 'archivedAt' | 'visibility' | 'entityKind' | 'type'>[],
): string[] {
  return definitions.filter((def) => def.visibility === 'FIRM' && def.entityKind === 'CASE' && def.required && !def.archivedAt
    && (!def.caseTypeIds.length || (!!caseTypeId && def.caseTypeIds.includes(caseTypeId)))
    && !isFilled(def, customFields[def.key])).map((def) => def.label);
}
