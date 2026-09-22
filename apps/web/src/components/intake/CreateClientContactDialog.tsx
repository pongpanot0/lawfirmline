'use client';

import { useState } from 'react';
import { PHONE_HINT, PHONE_HTML } from '@lawfirm/shared';
import { X } from 'lucide-react';
import { api, ClientContactItem, ClientItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/misc';

export function CreateClientContactDialog({
  client,
  onClose,
  onCreated,
}: {
  client: ClientItem;
  onClose: () => void;
  onCreated: (updatedClient: ClientItem, contactId: string) => void;
}) {
  const { token } = useAuth();
  const [form, setForm] = useState({ firstName: '', lastName: '', position: '', phone: '', email: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || submitting) return;

    const firstName = form.firstName.trim();
    const lastName = form.lastName.trim();
    if (!firstName || !lastName) {
      setError('กรุณาระบุชื่อและนามสกุล');
      return;
    }

    const newContact: ClientContactItem = {
      name: `${firstName} ${lastName}`,
      position: form.position.trim() || undefined,
      phone: form.phone.trim() || undefined,
      email: form.email.trim() || undefined,
      isPrimary: client.contacts.length === 0,
      portalEnabled: false,
    };
    const previousIds = new Set(client.contacts.flatMap((contact) => (contact.id ? [contact.id] : [])));

    setSubmitting(true);
    setError('');
    try {
      const updated = await api.updateClient(token, client.id, {
        contacts: [...client.contacts, newContact],
      });
      const created = updated.contacts.find((contact) => contact.id && !previousIds.has(contact.id));
      if (!created?.id) throw new Error('ไม่พบคนติดต่อที่เพิ่งสร้าง');
      onCreated(updated, created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'บันทึกคนติดต่อไม่สำเร็จ');
      setSubmitting(false);
    }
  };

  return (
    <Modal open onClose={onClose} closeOnBackdrop={!submitting} className="max-w-xl" ariaLabel="เพิ่มคนติดต่อ">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">เพิ่มคนติดต่อของ {client.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">คนนี้จะถูกเลือกเป็นผู้ส่งเรื่องทันทีหลังบันทึก</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="ปิด" onClick={onClose} disabled={submitting}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm font-medium">
            ชื่อ *
            <Input autoFocus required autoComplete="given-name" value={form.firstName} onChange={(event) => setForm((current) => ({ ...current, firstName: event.target.value }))} className="mt-1" placeholder="เช่น สุภาวดี" />
          </label>
          <label className="block text-sm font-medium">
            นามสกุล *
            <Input required autoComplete="family-name" value={form.lastName} onChange={(event) => setForm((current) => ({ ...current, lastName: event.target.value }))} className="mt-1" placeholder="เช่น วัฒนกุล" />
          </label>
          <label className="block text-sm font-medium">
            ตำแหน่ง / ฝ่าย
            <Input autoComplete="organization-title" value={form.position} onChange={(event) => setForm((current) => ({ ...current, position: event.target.value }))} className="mt-1" placeholder="เช่น ฝ่ายสินไหมรถยนต์" />
          </label>
          <label className="block text-sm font-medium">
            เบอร์โทร
            <Input type="tel" inputMode="tel" pattern={PHONE_HTML} title={PHONE_HINT} value={form.phone} onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))} className="mt-1" placeholder="08x-xxx-xxxx" />
          </label>
          <label className="block text-sm font-medium sm:col-span-2">
            อีเมล
            <Input type="email" autoComplete="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} className="mt-1" placeholder="name@company.com" />
          </label>
        </div>

        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>ยกเลิก</Button>
          <Button type="submit" disabled={submitting}>{submitting ? 'กำลังบันทึก…' : 'บันทึกและเลือกคนนี้'}</Button>
        </div>
      </form>
    </Modal>
  );
}
