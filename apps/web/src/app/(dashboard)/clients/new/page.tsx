'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Plus, Trash2 } from 'lucide-react';
import { PHONE_HINT, PHONE_HTML } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

const emptyContact = () => ({
  name: '',
  email: '',
  phone: '',
  position: '',
  isPrimary: false,
});

export default function NewClientPage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [showDetails, setShowDetails] = useState(false);
  /**
   * Most clients are one person who is also the contact, and asking for that
   * name twice is the commonest thing this form used to do. Companies still get
   * the full contact list.
   */
  const [selfContact, setSelfContact] = useState(true);
  const [form, setForm] = useState({
    name: '',
    type: 'INDIVIDUAL',
    notes: '',
    email: '',
    phone: '',
    contacts: [{ ...emptyContact(), isPrimary: true }],
  });

  const isCompany = form.type === 'COMPANY';
  const useSelf = !isCompany && selfContact;

  const updateContact = (
    index: number,
    field: 'name' | 'email' | 'phone' | 'position' | 'isPrimary',
    value: string | boolean,
  ) => {
    setForm((prev) => {
      const contacts = prev.contacts.map((contact, i) =>
        i === index ? { ...contact, [field]: value } : contact,
      );
      if (field === 'isPrimary' && value === true) {
        return {
          ...prev,
          contacts: contacts.map((contact, i) => ({ ...contact, isPrimary: i === index })),
        };
      }
      return { ...prev, contacts };
    });
  };

  const addContact = () =>
    setForm((prev) => ({ ...prev, contacts: [...prev.contacts, emptyContact()] }));

  const removeContact = (index: number) =>
    setForm((prev) =>
      prev.contacts.length <= 1
        ? prev
        : { ...prev, contacts: prev.contacts.filter((_, i) => i !== index) },
    );

  const filledDetails = [
    form.notes.trim() ? d.clients.notes : null,
    !useSelf && form.contacts.some((contact) => contact.position.trim())
      ? d.clients.position
      : null,
  ].filter(Boolean) as string[];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      const name = form.name.trim();
      const contacts = useSelf
        ? [
            {
              name,
              email: form.email.trim() || undefined,
              phone: form.phone.trim() || undefined,
              isPrimary: true,
            },
          ]
        : form.contacts
            .filter((contact) => contact.name.trim())
            .map((contact, i) => ({
              name: contact.name.trim(),
              email: contact.email.trim() || undefined,
              phone: contact.phone.trim() || undefined,
              position: contact.position.trim() || undefined,
              isPrimary: contact.isPrimary || i === 0,
            }));

      const created = await api.createClient(token, {
        name,
        type: form.type,
        notes: form.notes.trim() || undefined,
        contacts: contacts.length ? contacts : [{ name, isPrimary: true }],
      });
      router.push(`/clients?id=${created.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : d.clients.createFailed);
      setSubmitting(false);
    }
  };

  return (
    <div className="w-full">
      <Link href="/clients" className="text-sm text-primary hover:underline">
        {d.clients.allClients}
      </Link>
      <PageHeader title={d.clients.newTitle} description={d.clients.newDescription} />

      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-5">
            <label className="block">
              <span className="text-sm font-medium">{d.clients.type}</span>
              <select
                value={form.type}
                onChange={(e) => setForm({ ...form, type: e.target.value })}
                className="mt-1 w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
              >
                <option value="INDIVIDUAL">{d.clients.individual}</option>
                <option value="COMPANY">{d.clients.company}</option>
              </select>
            </label>

            <label className="block">
              <span className="text-sm font-medium">{d.clients.name} *</span>
              <Input
                required
                autoFocus
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="mt-1"
                placeholder={
                  isCompany
                    ? d.clients.namePlaceholderCompany
                    : d.clients.namePlaceholderIndividual
                }
              />
            </label>

            {!isCompany && (
              <div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={selfContact}
                    onChange={(e) => setSelfContact(e.target.checked)}
                  />
                  <span>
                    {d.clients.selfContact}
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {d.clients.selfContactHint}
                    </span>
                  </span>
                </label>
              </div>
            )}

            {useSelf ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">{d.clients.email}</span>
                  <Input
                    type="email"
                    className="mt-1"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">{d.clients.phone}</span>
                  <Input
                    type="tel"
                    inputMode="tel"
                    pattern={PHONE_HTML}
                    title={PHONE_HINT}
                    className="mt-1"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  />
                  <span className="mt-1 block text-xs text-muted-foreground">{PHONE_HINT}</span>
                </label>
              </div>
            ) : (
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-medium">{d.clients.contactsTab} *</span>
                  <Button type="button" variant="outline" size="sm" onClick={addContact}>
                    <Plus className="h-3 w-3" />
                    {d.clients.addContact}
                  </Button>
                </div>
                <div className="space-y-4">
                  {form.contacts.map((contact, index) => (
                    <div key={index} className="space-y-3 rounded-lg border border-border p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">
                          {fmt(d.clients.contactNumber, { number: index + 1 })}
                        </span>
                        {form.contacts.length > 1 && (
                          <button
                            type="button"
                            aria-label={d.clients.removeContact}
                            onClick={() => removeContact(index)}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                      <Input
                        required={index === 0}
                        placeholder={`${d.clients.contactName} *`}
                        value={contact.name}
                        onChange={(e) => updateContact(index, 'name', e.target.value)}
                      />
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input
                          placeholder={d.clients.email}
                          type="email"
                          value={contact.email}
                          onChange={(e) => updateContact(index, 'email', e.target.value)}
                        />
                        <div>
                          <Input
                            placeholder={d.clients.phone}
                            type="tel"
                            inputMode="tel"
                            pattern={PHONE_HTML}
                            title={PHONE_HINT}
                            value={contact.phone}
                            onChange={(e) => updateContact(index, 'phone', e.target.value)}
                          />
                          <p className="mt-1 text-xs text-muted-foreground">{PHONE_HINT}</p>
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="radio"
                          name="primaryContact"
                          checked={contact.isPrimary}
                          onChange={() => updateContact(index, 'isPrimary', true)}
                        />
                        {d.clients.primaryContact}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="rounded-lg border border-border">
              <button
                type="button"
                aria-expanded={showDetails}
                onClick={() => setShowDetails((open) => !open)}
                className="flex w-full items-center justify-between px-4 py-3 text-left text-sm"
              >
                <span className="font-medium">{d.clients.moreDetails}</span>
                <span className="text-xs text-muted-foreground">
                  {filledDetails.length
                    ? fmt(d.clients.moreDetailsFilled, { fields: filledDetails.join(', ') })
                    : d.clients.moreDetailsEmpty}
                </span>
              </button>
              {showDetails && (
                <div className="space-y-4 border-t border-border p-4">
                  {!useSelf &&
                    form.contacts.map((contact, index) => (
                      <label key={index} className="block text-sm">
                        <span className="text-muted-foreground">
                          {d.clients.position} — {fmt(d.clients.contactNumber, { number: index + 1 })}
                        </span>
                        <Input
                          className="mt-1"
                          value={contact.position}
                          onChange={(e) => updateContact(index, 'position', e.target.value)}
                        />
                      </label>
                    ))}
                  <label className="block text-sm">
                    <span className="text-muted-foreground">{d.clients.notes}</span>
                    <textarea
                      value={form.notes}
                      onChange={(e) => setForm({ ...form, notes: e.target.value })}
                      rows={2}
                      className="mt-1 w-full resize-none rounded-lg border border-input bg-card px-3 py-2 text-sm"
                    />
                  </label>
                </div>
              )}
            </div>

            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}

            <div className="flex gap-3">
              <Button type="submit" disabled={submitting || !form.name.trim()}>
                {submitting ? d.clients.saving : d.clients.create}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.push('/clients')}>
                {d.common.cancel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
