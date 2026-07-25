'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const emptyContact = () => ({
  name: '',
  email: '',
  phone: '',
  position: '',
  isPrimary: false,
});

export default function NewClientPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    type: 'INDIVIDUAL',
    notes: '',
    contacts: [{ ...emptyContact(), isPrimary: true }],
  });

  const updateContact = (index: number, field: 'name' | 'email' | 'phone' | 'position' | 'isPrimary', value: string | boolean) => {
    setForm((prev) => {
      const contacts = [...prev.contacts];
      contacts[index] = { ...contacts[index], [field]: value };
      if (field === 'isPrimary' && value === true) {
        contacts.forEach((c, i) => {
          if (i !== index) c.isPrimary = false;
        });
      }
      return { ...prev, contacts };
    });
  };

  const addContact = () => {
    setForm((prev) => ({
      ...prev,
      contacts: [...prev.contacts, emptyContact()],
    }));
  };

  const removeContact = (index: number) => {
    if (form.contacts.length <= 1) return;
    setForm((prev) => ({
      ...prev,
      contacts: prev.contacts.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitting(true);
    setError('');
    try {
      const contacts = form.contacts
        .filter((c) => c.name.trim())
        .map((c, i) => ({
          name: c.name.trim(),
          email: c.email?.trim() || undefined,
          phone: c.phone?.trim() || undefined,
          position: c.position?.trim() || undefined,
          isPrimary: c.isPrimary ?? i === 0,
        }));
      const created = await api.createClient(token, {
        name: form.name.trim(),
        type: form.type,
        notes: form.notes.trim() || undefined,
        contacts: contacts.length ? contacts : [{ name: form.name.trim(), isPrimary: true }],
      });
      router.push(`/clients?id=${created.id}`);
    } catch {
      setError('Failed to create client. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <Link href="/clients" className="text-sm text-primary hover:underline">
        ← Back to Clients
      </Link>
      <PageHeader
        title="Add Client / เพิ่มลูกค้า"
        description="Create a client with multiple contact persons"
      />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="text-sm font-medium">Client Name / ชื่อลูกค้า *</label>
              <Input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
                placeholder="บริษัท ABC จำกัด หรือ นายสมชาย ใจดี"
              />
            </div>

            <div>
              <label className="text-sm font-medium">Type / ประเภท</label>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="INDIVIDUAL">Individual / บุคคล</option>
                <option value="COMPANY">Company / นิติบุคคล</option>
              </select>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <label className="text-sm font-medium">Contacts / ผู้ติดต่อ *</label>
                <Button type="button" variant="outline" size="sm" onClick={addContact}>
                  <Plus className="h-3 w-3" />Add Contact
                </Button>
              </div>
              <div className="space-y-4">
                {form.contacts.map((contact, index) => (
                  <div key={index} className="rounded-lg border border-border p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-muted-foreground">
                        Contact {index + 1}
                      </span>
                      {form.contacts.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeContact(index)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                    <Input
                      required={index === 0}
                      placeholder="ชื่อผู้ติดต่อ *"
                      value={contact.name}
                      onChange={(e) => updateContact(index, 'name', e.target.value)}
                    />
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input
                        placeholder="Email"
                        type="email"
                        value={contact.email ?? ''}
                        onChange={(e) => updateContact(index, 'email', e.target.value)}
                      />
                      <Input
                        placeholder="Phone / เบอร์โทร"
                        value={contact.phone ?? ''}
                        onChange={(e) => updateContact(index, 'phone', e.target.value)}
                      />
                    </div>
                    <Input
                      placeholder="Position / ตำแหน่ง"
                      value={contact.position ?? ''}
                      onChange={(e) => updateContact(index, 'position', e.target.value)}
                    />
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="radio"
                        name="primaryContact"
                        checked={contact.isPrimary}
                        onChange={() => updateContact(index, 'isPrimary', true)}
                      />
                      Primary contact / ผู้ติดต่อหลัก
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-sm font-medium">Notes</label>
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={2}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-3">
              <Button type="button" variant="outline" onClick={() => router.push('/clients')}>
                Cancel
              </Button>
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting ? 'Saving...' : 'Create Client'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
