'use client';

import { useState } from 'react';
import { api, ClientItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/**
 * เลือกลูกค้าจากที่มีอยู่ หรือพิมพ์ชื่อสร้างใหม่ตรงนี้เลย
 * — คนรับเรื่องไม่ควรต้องออกไปสร้างลูกค้าที่หน้าอื่นก่อนแล้วค่อยกลับมา
 */
export function CustomerSelect({
  id,
  label,
  value,
  clients,
  onChange,
  onCreated,
}: {
  id: string;
  label: string;
  value: string;
  clients: ClientItem[];
  onChange: (clientId: string) => void;
  /** ลูกค้าที่เพิ่งสร้าง ให้หน้าแม่เอาไปต่อท้ายรายการ */
  onCreated: (client: ClientItem) => void;
}) {
  const { token } = useAuth();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const create = async () => {
    const trimmed = name.trim();
    if (!token || !trimmed) return;
    setBusy(true);
    setError('');
    try {
      // contacts เป็นฟิลด์บังคับของ API — ผู้ว่าจ้างมักยังไม่รู้ผู้ติดต่อตอนนี้ เติมทีหลังที่หน้าลูกค้า
      const client = await api.createClient(token, { name: trimmed, type: 'COMPANY', contacts: [] });
      onCreated(client);
      onChange(client.id);
      setName('');
      setCreating(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'สร้างลูกค้าไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {creating ? (
        <div className="mt-1 space-y-2">
          <input
            id={id}
            aria-label={`ชื่อลูกค้าใหม่`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              // อยู่ในฟอร์มอื่น กด Enter แล้วต้องไม่ไปส่งฟอร์มนั้น
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
            placeholder="ชื่อบริษัท หรือชื่อผู้ว่าจ้าง"
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3 text-sm">
            <button
              type="button"
              onClick={create}
              disabled={busy || !name.trim()}
              className="rounded-lg bg-slate-900 px-3 py-1.5 text-white disabled:opacity-50"
            >
              {busy ? 'กำลังสร้าง…' : 'สร้างลูกค้า'}
            </button>
            <button type="button" onClick={() => { setCreating(false); setError(''); }} className="underline">
              ยกเลิก
            </button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-1 space-y-1">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="">ยังไม่ระบุ</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <button type="button" onClick={() => setCreating(true)} className="text-sm underline">
            + สร้างลูกค้าใหม่
          </button>
        </div>
      )}
    </div>
  );
}
