'use client';

import type { CustomFieldDefinitionDto, CustomFieldValue } from '@lawfirm/shared';

export function CustomFieldInput({ def, value, onChange, disabled, autoFocus, id }: { def: CustomFieldDefinitionDto; value: CustomFieldValue; onChange: (value: CustomFieldValue) => void; disabled?: boolean; autoFocus?: boolean; id?: string }) {
  const className = 'w-full rounded-md border border-input bg-background px-3 py-2 text-sm';
  if (def.type === 'BOOLEAN') return <select id={id} aria-label={def.label} disabled={disabled} autoFocus={autoFocus} className={className} value={value === null ? '' : String(value)} onChange={e => onChange(e.target.value === '' ? null : e.target.value === 'true')}><option value="">ยังไม่ได้กรอก</option><option value="true">ใช่</option><option value="false">ไม่ใช่</option></select>;
  if (def.type === 'SELECT') return <select id={id} aria-label={def.label} disabled={disabled} autoFocus={autoFocus} className={className} value={String(value ?? '')} onChange={e => onChange(e.target.value || null)}><option value="">ยังไม่ได้กรอก</option>{def.options.filter(o => !o.archived || o.id === value).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}</select>;
  if (def.type === 'LONG_TEXT') return <textarea id={id} aria-label={def.label} disabled={disabled} autoFocus={autoFocus} maxLength={5000} className={className} value={String(value ?? '')} onChange={e => onChange(e.target.value || null)} />;
  return <input id={id} aria-label={def.label} disabled={disabled} autoFocus={autoFocus} className={className} type={def.type === 'NUMBER' ? 'number' : def.type === 'DATE' ? 'date' : 'text'} maxLength={def.type === 'TEXT' ? 500 : undefined} value={String(value ?? '')} onChange={e => onChange(e.target.value === '' ? null : def.type === 'NUMBER' ? Number(e.target.value) : e.target.value)} />;
}
