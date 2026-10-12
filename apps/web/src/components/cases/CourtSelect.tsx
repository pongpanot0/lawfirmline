'use client';

import { useState } from 'react';
import type { CourtItem } from '@/lib/api';

const OTHER = '__other__';

/** The court catalog, with "ศาลอื่น" for a court not (yet) in it. */
export function CourtSelect({
  id,
  value,
  courts,
  onChange,
  className,
}: {
  id?: string;
  value: string;
  courts: CourtItem[];
  onChange: (name: string) => void;
  className: string;
}) {
  const [picked, setPicked] = useState(false);
  // A value outside the catalog (or the catalog not loaded yet) also shows as "other".
  const typing = picked || (!!value && !courts.some((court) => court.name === value));

  return (
    <>
      <select
        id={id}
        value={typing ? OTHER : value}
        onChange={(e) => {
          if (e.target.value === OTHER) { setPicked(true); onChange(''); return; }
          setPicked(false);
          onChange(e.target.value);
        }}
        className={className}
      >
        <option value="">ยังไม่ระบุ</option>
        {courts.map((court) => <option key={court.id} value={court.name}>{court.name}</option>)}
        <option value={OTHER}>ศาลอื่น (พิมพ์เอง)</option>
      </select>
      {typing && (
        <input
          aria-label="ชื่อศาล"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="พิมพ์ชื่อศาล"
          className={className}
        />
      )}
    </>
  );
}
