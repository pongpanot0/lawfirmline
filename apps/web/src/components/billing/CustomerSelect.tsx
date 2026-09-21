'use client';

import { useState } from 'react';
import { Plus, X } from 'lucide-react';
import { api, ClientItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
        <div className="mt-1.5 space-y-2 rounded-lg border border-dashed border-input bg-muted/30 p-2.5">
          <Input
            id={id}
            aria-label="ชื่อลูกค้าใหม่"
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
            autoFocus
          />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={create} disabled={busy || !name.trim()}>
              {busy ? 'กำลังสร้าง…' : 'สร้างลูกค้า'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => { setCreating(false); setError(''); setName(''); }}
            >
              <X className="h-3.5 w-3.5" /> ยกเลิก
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-1.5 flex items-center gap-2">
          <select
            id={id}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className="h-9 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm shadow-soft transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <option value="">ยังไม่ระบุ</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="shrink-0"
            onClick={() => setCreating(true)}
          >
            <Plus className="h-3.5 w-3.5" /> ใหม่
          </Button>
        </div>
      )}
    </div>
  );
}
