import { BadRequestException } from '@nestjs/common';
import { CustomFieldDefinitionDto } from '@lawfirm/shared';
import { canSee, generateFieldKey, isFilled, mergeCustomFieldPatch, redactCustomFields, validateValue } from './custom-field-rules';

const field = (overrides: Partial<CustomFieldDefinitionDto> = {}): CustomFieldDefinitionDto => ({
  id: 'd1', entityKind: 'CASE', visibility: 'FIRM', ownerUserId: null,
  key: 'cf_a', label: 'Detail', type: 'TEXT', options: [], required: false,
  caseTypeIds: [], section: null, sortOrder: 0, helpText: null, isSensitive: false,
  archivedAt: null, ...overrides,
});

const firm = field();
const personal = field({ key: 'cf_b', visibility: 'PERSONAL', ownerUserId: 'A' });

describe('custom-field rules', () => {
  it('redact hides cf_ keys with no definition (orphaned personal values) in every context', () => {
    for (const ctx of ['app', 'ai', 'portal', 'mcp'] as const) {
      expect(redactCustomFields({ cf_gone: 'secret', incidentDate: '2026-01-01' }, [firm], 'B', ctx)).toEqual({ incidentDate: '2026-01-01' });
    }
  });

  it('merge accepts an unchanged archived value re-sent by a form', () => {
    const archived = field({ archivedAt: '2026-11-01T00:00:00.000Z' });
    expect(mergeCustomFieldPatch({ cf_a: 'kept' }, { cf_a: 'kept' }, [archived], 'B')).toEqual({ values: { cf_a: 'kept' }, changes: [] });
    expect(() => mergeCustomFieldPatch({ cf_a: 'kept' }, { cf_a: 'new' }, [archived], 'B')).toThrow(BadRequestException);
  });

  it('generates opaque base36 keys', () => {
    const keys = Array.from({ length: 100 }, generateFieldKey);
    expect(keys.every((key) => /^cf_[a-z0-9]{8}$/.test(key))).toBe(true);
    expect(new Set(keys).size).toBe(100);
  });

  it('canSee permits firm members and only the personal owner', () => {
    expect(canSee(firm, 'B')).toBe(true);
    expect(canSee(personal, 'A')).toBe(true);
    expect(canSee(personal, 'B')).toBe(false);
  });

  it("merge keeps another user's personal value", () => {
    const existing = { cf_a: 'x', cf_b: 'mine-of-A' };
    expect(mergeCustomFieldPatch(existing, { cf_a: 'y' }, [firm, personal], 'B')).toEqual({
      values: { cf_a: 'y', cf_b: 'mine-of-A' }, changes: [{ key: 'cf_a', from: 'x', to: 'y' }],
    });
    expect(existing).toEqual({ cf_a: 'x', cf_b: 'mine-of-A' });
  });

  it('merge rejects invisible/archived/unknown keys and reports every bad key', () => {
    const archived = field({ key: 'cf_old', archivedAt: '2026-11-14T00:00:00Z' });
    const patch = { cf_b: 1, cf_old: 'no', cf_zzzzzzzz: 'no', cf_a: 123 };
    try {
      mergeCustomFieldPatch({}, patch, [firm, personal, archived], 'B');
      throw new Error('accepted invalid patch');
    } catch (err) {
      expect(err).toBeInstanceOf(BadRequestException);
      for (const key of Object.keys(patch)) expect((err as Error).message).toContain(key);
    }
  });

  it('merge deletes nulls, normalizes empty strings and skips unchanged values', () => {
    expect(mergeCustomFieldPatch({ cf_a: 'x', incidentDate: '2026-01-01' }, { cf_a: '' }, [firm], 'B')).toEqual({
      values: { incidentDate: '2026-01-01' }, changes: [{ key: 'cf_a', from: 'x', to: null }],
    });
    expect(mergeCustomFieldPatch({ cf_a: 'x' }, { cf_a: 'x' }, [firm], 'B').changes).toEqual([]);
  });

  it('merge preserves legacy/system keys as-is and handles missing JSON objects', () => {
    expect(mergeCustomFieldPatch(null, { incidentDate: 'raw', chargeSection: { legacy: true } }, [], 'B').values)
      .toEqual({ incidentDate: 'raw', chargeSection: { legacy: true } });
    expect(mergeCustomFieldPatch([], {}, [], 'B').values).toEqual({});
  });

  it.each([
    ['NUMBER', '12', false], ['NUMBER', 12, true], ['NUMBER', 0, true],
    ['NUMBER', Infinity, false], ['NUMBER', NaN, false],
    ['DATE', '2026-02-30', false], ['DATE', '2024-02-29', true],
    ['DATE', '2026-02-29', false], ['DATE', '2026-2-01', false],
    ['DATE', '2026-01-01T00:00:00Z', false], ['DATE', '0000-01-01', false],
    ['TEXT', 'a'.repeat(500), true], ['TEXT', 'a'.repeat(501), false],
    ['LONG_TEXT', 'a'.repeat(5000), true], ['LONG_TEXT', 'a'.repeat(5001), false],
    ['BOOLEAN', false, true], ['BOOLEAN', 'false', false], ['TEXT', {}, false],
  ] as const)('validateValue %s handles %p (ok=%p)', (type, value, ok) => {
    expect(validateValue(field({ type }), value).ok).toBe(ok);
  });

  it('validateValue accepts null/empty as absent and SELECT only active option ids', () => {
    const select = field({ type: 'SELECT', options: [{ id: 'one', label: 'One' }, { id: 'old', label: 'Old', archived: true }] });
    expect(validateValue(select, null)).toEqual({ ok: true, value: null });
    expect(validateValue(select, '')).toEqual({ ok: true, value: null });
    expect(validateValue(select, 'one')).toEqual({ ok: true, value: 'one' });
    expect(validateValue(select, 'old').ok).toBe(false);
    expect(validateValue(select, 'One').ok).toBe(false);
  });

  it('redact hides other personal fields but retains legacy/system keys in app context', () => {
    const values = { cf_a: 'firm', cf_b: 'private', incidentDate: '2026-01-01' };
    expect(redactCustomFields(values, [firm, personal], 'B', 'app')).toEqual({ cf_a: 'firm', incidentDate: '2026-01-01' });
    expect(redactCustomFields(values, [firm, personal], 'A', 'app')).toEqual(values);
  });

  it.each(['ai', 'portal', 'mcp'] as const)('redact %s hides sensitive and all personal definitions', (ctx) => {
    const sensitive = field({ key: 'cf_secret', isSensitive: true });
    expect(redactCustomFields({ cf_a: 'ok', cf_b: 'mine', cf_secret: 'secret', incidentDate: 'legacy' }, [firm, personal, sensitive], 'A', ctx))
      .toEqual({ cf_a: 'ok', incidentDate: 'legacy' });
    expect(redactCustomFields(null, [], 'A', ctx)).toEqual({});
  });

  it('isFilled supports stage-gate metadata without option lists and retained SELECT values', () => {
    expect(isFilled({ type: 'SELECT' }, 'archived-option-id')).toBe(true);
  });

  it('isFilled counts 0 and false, rejects absent/whitespace/invalid values', () => {
    expect(isFilled(field({ type: 'NUMBER' }), 0)).toBe(true);
    expect(isFilled(field({ type: 'BOOLEAN' }), false)).toBe(true);
    for (const value of [null, undefined, '  ', '']) expect(isFilled(firm, value)).toBe(false);
    expect(isFilled(field({ type: 'NUMBER' }), '12')).toBe(false);
  });
});
