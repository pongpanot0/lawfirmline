'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const PREFIX_PATTERN = /^[A-Z0-9-]{1,12}$/;

/** Owner-only: the prefix new case numbers start with ({prefix}{YYYY}{NNNN}). */
export function CaseNumberPrefixCard() {
  const { token } = useAuth();
  const [saved, setSaved] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getFirmSettings(token)
      .then((s) => { setSaved(s.ownRefPrefix); setValue(s.ownRefPrefix); })
      .catch(() => setMessage({ type: 'error', text: 'โหลดคำนำหน้าเลขคดีไม่สำเร็จ' }));
  }, [token]);

  const normalized = value.trim().toUpperCase();
  const valid = PREFIX_PATTERN.test(normalized);
  const year = new Date().toLocaleDateString('en-US', { timeZone: 'Asia/Bangkok', year: 'numeric' });

  const save = async () => {
    if (!token || !valid) return;
    setSaving(true);
    setMessage(null);
    try {
      const s = await api.updateFirmSettings(token, { ownRefPrefix: normalized });
      setSaved(s.ownRefPrefix);
      setValue(s.ownRefPrefix);
      setMessage({ type: 'success', text: 'บันทึกแล้ว คดีที่เปิดใหม่จะใช้คำนำหน้านี้' });
    } catch (err) {
      setMessage({ type: 'error', text: err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <CardTitle>คำนำหน้าเลขคดี</CardTitle>
        <p className="text-sm text-muted-foreground">มีผลกับคดีที่เปิดใหม่เท่านั้น เลขคดีเดิมไม่เปลี่ยน และยังแก้เลขแต่ละคดีเองได้ในหน้าคดี</p>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1 space-y-1 text-sm">
            <span className="font-medium">คำนำหน้า</span>
            <Input
              value={value}
              maxLength={12}
              onChange={(e) => setValue(e.target.value.toUpperCase())}
              aria-invalid={!valid}
              placeholder="เช่น TSBREF"
            />
          </label>
          <Button onClick={save} disabled={saving || !valid || normalized === saved}>
            {saving ? 'กำลังบันทึก…' : 'บันทึก'}
          </Button>
        </div>
        {valid ? (
          <p className="text-sm text-muted-foreground">เลขคดีถัดไปจะหน้าตาแบบ <span className="font-mono text-foreground">{normalized}{year}0001</span></p>
        ) : (
          <p className="text-sm text-destructive">ใช้ได้เฉพาะ A–Z, 0–9 และ - ยาว 1–12 ตัว</p>
        )}
        {message && (
          <p className={`text-sm ${message.type === 'error' ? 'text-destructive' : 'text-green-600'}`}>{message.text}</p>
        )}
      </CardContent>
    </Card>
  );
}
