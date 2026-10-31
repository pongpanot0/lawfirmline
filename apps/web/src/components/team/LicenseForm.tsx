'use client';

import { useState } from 'react';
import type { LawyerLicense } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { DateField, SelectField, TextField } from '@/components/ui/form-fields';

/** Licence number, type and expiry; the date is hidden (and cleared) for a lifetime licence. */
export function LicenseForm({
  initial,
  onSave,
  idPrefix,
}: {
  initial: LawyerLicense;
  onSave: (data: LawyerLicense) => Promise<unknown>;
  idPrefix: string;
}) {
  const [no, setNo] = useState(initial.lawyerLicenseNo ?? '');
  const [type, setType] = useState<LawyerLicense['lawyerLicenseType']>(initial.lawyerLicenseType);
  const [expiresAt, setExpiresAt] = useState(initial.lawyerLicenseExpiresAt ?? '');
  const [state, setState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [error, setError] = useState('');

  async function save() {
    if (type === 'TWO_YEAR' && !expiresAt) {
      setError('ใบอนุญาตแบบ 2 ปีต้องระบุวันหมดอายุ');
      return;
    }
    setState('saving');
    setError('');
    try {
      await onSave({
        lawyerLicenseNo: no.trim() || null,
        lawyerLicenseType: type,
        lawyerLicenseExpiresAt: type === 'TWO_YEAR' ? expiresAt : null,
      });
      setState('saved');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
      setState('idle');
    }
  }

  const touched = () => setState('idle');
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <TextField id={`${idPrefix}-no`} label="เลขที่ใบอนุญาต" maxLength={50} value={no}
          onChange={(e) => { setNo(e.target.value); touched(); }} />
        <SelectField id={`${idPrefix}-type`} label="ประเภท" value={type ?? ''}
          onChange={(e) => { setType((e.target.value || null) as LawyerLicense['lawyerLicenseType']); touched(); }}>
          <option value="">ยังไม่ระบุ</option>
          <option value="TWO_YEAR">2 ปี</option>
          <option value="LIFETIME">ตลอดชีพ</option>
        </SelectField>
        {type === 'TWO_YEAR' && (
          <DateField id={`${idPrefix}-expires`} label="วันหมดอายุ" value={expiresAt} required
            onChange={(e) => { setExpiresAt(e.target.value); touched(); }} />
        )}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-3">
        {state === 'saved' && <span role="status" className="text-sm text-success">บันทึกแล้ว</span>}
        {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
        <Button type="button" onClick={() => void save()} disabled={state === 'saving'}>
          {state === 'saving' ? 'กำลังบันทึก…' : 'บันทึกใบอนุญาต'}
        </Button>
      </div>
    </div>
  );
}
