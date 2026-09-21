'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ClientItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * บริษัทประกัน = ลูกค้า (Client) ประเภท 'insurer' — เลือกจากรายชื่อที่มี หรือ
 * พิมพ์แล้วสร้างใหม่ได้ทันที เพราะบริษัทประกันอาจเป็นผู้ว่าจ้างของสำนักงานด้วย
 * ค่าที่ส่งกลับยังเป็นชื่อ (string) ตาม schema เดิมของ intake/claim.
 */
const INSURER_TYPE = 'insurer';

export function InsurerSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: string;
  onChange: (name: string) => void;
}) {
  const { token } = useAuth();
  const [insurers, setInsurers] = useState<ClientItem[]>([]);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token) return;
    api
      .getClients(token)
      .then((clients) => setInsurers(clients.filter((c) => c.type === INSURER_TYPE)))
      .catch(console.error);
  }, [token]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const query = value.trim().toLowerCase();
  const matches = query
    ? insurers.filter((c) => c.name.toLowerCase().includes(query))
    : insurers;
  const exactMatch = insurers.some((c) => c.name.trim().toLowerCase() === query);

  const createInsurer = async () => {
    if (!token || !value.trim() || creating) return;
    setCreating(true);
    setError(null);
    try {
      const created = await api.createClient(token, { name: value.trim(), type: INSURER_TYPE, contacts: [] });
      setInsurers((prev) => [...prev, created]);
      onChange(created.name);
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างบริษัทประกันไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <input
        id={id}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        className="mt-1 w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
        placeholder="พิมพ์เพื่อค้นหา หรือสร้างใหม่ เช่น วิริยะประกันภัย"
      />
      {open && (matches.length > 0 || (query && !exactMatch)) && (
        <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-soft">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="w-full px-3 py-2 text-left text-sm hover:bg-muted"
                onClick={() => {
                  onChange(c.name);
                  setOpen(false);
                }}
              >
                {c.name}
              </button>
            </li>
          ))}
          {query && !exactMatch && (
            <li className="border-t border-border">
              <button
                type="button"
                disabled={creating}
                className="w-full px-3 py-2 text-left text-sm font-medium text-primary hover:bg-muted"
                onClick={() => void createInsurer()}
              >
                {creating ? 'กำลังสร้าง...' : `+ สร้าง "${value.trim()}" เป็นบริษัทประกันใหม่`}
              </button>
            </li>
          )}
        </ul>
      )}
      {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
    </div>
  );
}
