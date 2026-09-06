'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Mail, Phone, Building2, Briefcase, Plus, User, Pencil, Trash2, Star } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ClientItem, ContactCaseAccessEntry } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { EmptyState } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function ClientsPage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientItem | null>(null);
  const [tab, setTab] = useState('information');
  const [loading, setLoading] = useState(true);

  const emptyContact = { name: '', nickname: '', email: '', phone: '', position: '', isPrimary: false, notes: '' };
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [savingContact, setSavingContact] = useState(false);

  const load = () => {
    if (!token) return;
    api.getClients(token, search || undefined)
      .then(setClients)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setContactForm(emptyContact);
    setShowContactForm(true);
  };

  const openEditContact = (c: ClientItem['contacts'][number]) => {
    setEditingContactId(c.id ?? null);
    setContactForm({ name: c.name, nickname: (c as any).nickname ?? '', email: c.email ?? '', phone: c.phone ?? '', position: c.position ?? '', isPrimary: c.isPrimary ?? false, notes: (c as any).notes ?? '' });
    setShowContactForm(true);
  };

  const cancelContactForm = () => { setShowContactForm(false); setEditingContactId(null); };

  const saveContact = async () => {
    if (!token || !selected || !contactForm.name.trim()) return;
    setSavingContact(true);
    try {
      let updatedContacts;
      if (editingContactId) {
        updatedContacts = selected.contacts.map((c) =>
          c.id === editingContactId ? { ...c, ...contactForm } : c
        );
      } else {
        updatedContacts = [...selected.contacts, { ...contactForm, dateAdded: new Date().toISOString() }];
      }
      const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
      setSelected(updated);
      setShowContactForm(false);
      setEditingContactId(null);
    } finally {
      setSavingContact(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    if (!token || !selected || !confirm('ลบบุคคลติดต่อนี้?')) return;
    const updatedContacts = selected.contacts.filter((c) => c.id !== contactId);
    const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
    setSelected(updated);
  };

  const togglePortalAccess = async (contactId: string, next: boolean) => {
    if (!token || !selected) return;
    const updatedContacts = selected.contacts.map((c) =>
      c.id === contactId ? { ...c, portalEnabled: next } : c,
    );
    const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
    setSelected(updated);
  };

  const [lineStatus, setLineStatus] = useState<Record<string, { connected: boolean }>>({});

  const [caseAccess, setCaseAccess] = useState<Record<string, ContactCaseAccessEntry[]>>({});
  const [caseAccessLoading, setCaseAccessLoading] = useState<Record<string, boolean>>({});
  const [caseAccessError, setCaseAccessError] = useState<Record<string, boolean>>({});
  const [grantSelection, setGrantSelection] = useState<Record<string, string>>({});
  const [grantingCaseId, setGrantingCaseId] = useState<string | null>(null);
  const [revokingAccessId, setRevokingAccessId] = useState<string | null>(null);

  const loadCaseAccess = (caseId: string) => {
    if (!token) return;
    setCaseAccessLoading((s) => ({ ...s, [caseId]: true }));
    setCaseAccessError((s) => ({ ...s, [caseId]: false }));
    api
      .listContactCaseAccess(token, caseId)
      .then((entries) => setCaseAccess((s) => ({ ...s, [caseId]: entries })))
      .catch(() => setCaseAccessError((s) => ({ ...s, [caseId]: true })))
      .finally(() => setCaseAccessLoading((s) => ({ ...s, [caseId]: false })));
  };

  const grantCaseAccess = async (caseId: string) => {
    const clientContactId = grantSelection[caseId];
    if (!token || !clientContactId) return;
    setGrantingCaseId(caseId);
    try {
      await api.grantContactCaseAccess(token, caseId, clientContactId);
      setGrantSelection((s) => ({ ...s, [caseId]: '' }));
      loadCaseAccess(caseId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ให้สิทธิ์ไม่สำเร็จ');
    } finally {
      setGrantingCaseId(null);
    }
  };

  const revokeCaseAccess = async (caseId: string, accessId: string) => {
    if (!token) return;
    setRevokingAccessId(accessId);
    try {
      await api.revokeContactCaseAccess(token, caseId, accessId);
      loadCaseAccess(caseId);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'ถอนสิทธิ์ไม่สำเร็จ');
    } finally {
      setRevokingAccessId(null);
    }
  };

  useEffect(() => {
    if (!selected || !token) return;
    (selected.cases ?? []).forEach((c) => loadCaseAccess(c.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, token]);

  useEffect(() => {
    if (!selected || !token) return;
    selected.contacts.forEach((c) => {
      if (!c.id) return;
      api
        .getContactLineStatus(token, c.id)
        .then((status) => setLineStatus((s) => ({ ...s, [c.id!]: { connected: status.connected } })))
        .catch(() => {});
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id, token]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [token, search]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !token) return;
    api.getClient(token, id).then(setSelected).catch(console.error);
  }, [searchParams, token]);

  if (selected) {
    const primary = selected.contacts.find((c) => c.isPrimary) ?? selected.contacts[0];
    return (
      <div>
        <button type="button" onClick={() => setSelected(null)} className="mb-4 text-sm text-primary hover:underline">
          {d.clients.allClients}
        </button>
        <div className="mb-6 flex items-center gap-4">
          <Avatar fallback={selected.name.slice(0, 2).toUpperCase()} className="h-14 w-14 text-base" />
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-sm text-muted-foreground">
              {selected.type === 'COMPANY' ? d.clients.company : d.clients.individual} · {fmt(d.clients.casesCount, { count: selected._count?.cases ?? selected.cases?.length ?? 0 })}
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="information">{d.clients.information}</TabsTrigger>
            <TabsTrigger value="contacts">{d.clients.contactsTab}</TabsTrigger>
            <TabsTrigger value="cases">{d.clients.casesTab}</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
            <Card>
              <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
                {primary?.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">{d.clients.email}</p><p className="text-sm">{primary.email}</p></div>
                  </div>
                )}
                {primary?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">{d.clients.phone}</p><p className="text-sm">{primary.phone}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">{d.clients.type}</p><p className="text-sm">{selected.type === 'COMPANY' ? d.clients.company : d.clients.individual}</p></div>
                </div>
                {selected.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">{d.clients.notes}</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={openAddContact}>
                  <Plus className="h-4 w-4 mr-1" />เพิ่มบุคคลติดต่อ
                </Button>
              </div>

              {/* Inline form */}
              {showContactForm && (
                <Card className="border-primary/40">
                  <CardContent className="p-4 space-y-3">
                    <p className="font-medium text-sm">{editingContactId ? 'แก้ไขบุคคลติดต่อ' : 'เพิ่มบุคคลติดต่อใหม่'}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">ชื่อ-นามสกุล *</label>
                        <Input value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} placeholder="ชื่อ-นามสกุล" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">ชื่อเล่น</label>
                        <Input value={contactForm.nickname} onChange={(e) => setContactForm((f) => ({ ...f, nickname: e.target.value }))} placeholder="ชื่อเล่น" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">เบอร์โทร</label>
                        <Input value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} placeholder="เบอร์โทร" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">อีเมล</label>
                        <Input value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} placeholder="อีเมล" type="email" />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">ตำแหน่ง / ความสัมพันธ์</label>
                        <Input value={contactForm.position} onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))} placeholder="เช่น CEO, ทายาท, ผู้จัดการ" />
                      </div>
                      <div className="flex items-center gap-2 pt-5">
                        <input type="checkbox" id="isPrimary" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))} className="h-4 w-4" />
                        <label htmlFor="isPrimary" className="text-sm">ผู้ติดต่อหลัก</label>
                      </div>
                      <div className="col-span-2">
                        <label className="text-xs text-muted-foreground">หมายเหตุ</label>
                        <Input value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="เช่น ติดต่อได้เฉพาะวันทำการ" />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="outline" onClick={cancelContactForm}>ยกเลิก</Button>
                      <Button size="sm" onClick={saveContact} disabled={savingContact || !contactForm.name.trim()}>
                        {savingContact ? 'กำลังบันทึก...' : 'บันทึก'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Contact list */}
              {selected.contacts.map((c, i) => (
                <Card key={c.id ?? i}>
                  <CardContent className="flex items-start justify-between gap-3 p-4">
                    <div className="flex items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="font-medium flex items-center gap-2">
                          {c.name}
                          {(c as any).nickname && <span className="text-muted-foreground font-normal text-sm">({(c as any).nickname})</span>}
                          {c.isPrimary && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                        </p>
                        {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                          {c.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{c.phone}</p>}
                          {c.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{c.email}</p>}
                          {(c as any).notes && <p className="text-xs italic">{(c as any).notes}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {c.id && c.email && (
                        <Button size="sm" variant={c.portalEnabled ? 'default' : 'outline'} onClick={() => togglePortalAccess(c.id!, !c.portalEnabled)} className="text-xs h-7">
                          {c.portalEnabled ? 'Portal on' : 'Portal'}
                        </Button>
                      )}
                      {c.id && lineStatus[c.id] && (
                        <span
                          className={`text-xs h-7 flex items-center rounded px-2 ${
                            lineStatus[c.id].connected
                              ? 'bg-green-100 text-green-700'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {lineStatus[c.id].connected ? 'LINE เชื่อมต่อแล้ว' : 'LINE ยังไม่เชื่อมต่อ'}
                        </span>
                      )}
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEditContact(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      {c.id && (
                        <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => deleteContact(c.id!)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}

              {selected.contacts.length === 0 && !showContactForm && (
                <p className="text-sm text-muted-foreground text-center py-6">ยังไม่มีบุคคลติดต่อ — กด "เพิ่มบุคคลติดต่อ" เพื่อเริ่ม</p>
              )}
            </div>
          </TabsContent>

          <TabsContent value="cases">
            <div className="space-y-4">
              {(selected.cases ?? []).map((c) => {
                const eligibleContacts = selected.contacts.filter((ct) => ct.id && ct.portalEnabled);
                const entries = caseAccess[c.id] ?? [];
                const activeEntries = entries.filter((e) => !e.revokedAt);
                const isLoading = caseAccessLoading[c.id];
                const hasError = caseAccessError[c.id];
                return (
                  <Card key={c.id}>
                    <CardContent className="p-4 space-y-3">
                      <div
                        className="flex items-center justify-between cursor-pointer"
                        onClick={() => router.push(`/cases/${c.id}`)}
                      >
                        <div>
                          <p className="font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.ownRef}{c.courtName ? ` · ${c.courtName}` : ''}</p>
                        </div>
                        <CaseStatusBadge status={c.status} />
                      </div>

                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">สิทธิ์เข้าถึงคดี</p>

                        {isLoading ? (
                          <p className="text-xs text-muted-foreground">กำลังโหลด...</p>
                        ) : hasError ? (
                          <p className="text-xs text-destructive">โหลดสิทธิ์เข้าถึงไม่สำเร็จ</p>
                        ) : (
                          <>
                            {activeEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground">ยังไม่มีผู้ติดต่อที่ได้รับสิทธิ์</p>
                            ) : (
                              <ul className="space-y-1">
                                {activeEntries.map((entry) => (
                                  <li key={entry.id} className="flex items-center justify-between text-sm">
                                    <span>
                                      {entry.clientContact.name}
                                      {entry.clientContact.email ? ` (${entry.clientContact.email})` : ''}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-destructive hover:text-destructive"
                                      disabled={revokingAccessId === entry.id}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        revokeCaseAccess(c.id, entry.id);
                                      }}
                                    >
                                      {revokingAccessId === entry.id ? 'กำลังถอน...' : 'ถอนสิทธิ์'}
                                    </Button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}

                        {eligibleContacts.length > 0 && (
                          <div className="flex items-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                            <select
                              className="h-8 flex-1 rounded-md border border-input bg-background px-2 text-sm"
                              value={grantSelection[c.id] ?? ''}
                              onChange={(e) => setGrantSelection((s) => ({ ...s, [c.id]: e.target.value }))}
                            >
                              <option value="">เลือกผู้ติดต่อ...</option>
                              {eligibleContacts
                                .filter((ct) => !activeEntries.some((e) => e.clientContactId === ct.id))
                                .map((ct) => (
                                  <option key={ct.id} value={ct.id}>
                                    {ct.name}
                                  </option>
                                ))}
                            </select>
                            <Button
                              size="sm"
                              className="h-8 text-xs"
                              disabled={!grantSelection[c.id] || grantingCaseId === c.id}
                              onClick={() => grantCaseAccess(c.id)}
                            >
                              {grantingCaseId === c.id ? 'กำลังให้สิทธิ์...' : 'ให้สิทธิ์'}
                            </Button>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              {(selected.cases ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">{d.clients.noCasesLinked}</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={d.clients.title}
        description={d.clients.description}
        actions={
          <Button size="sm" onClick={() => router.push('/clients/new')}>
            <Plus className="h-4 w-4" />{d.clients.addClient}
          </Button>
        }
      />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={d.clients.searchPlaceholder} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-muted-foreground">{d.clients.loading}</p>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={d.clients.empty}
          description={d.clients.emptyHint}
          action={
            <Button size="sm" onClick={() => router.push('/clients/new')}>
              <Plus className="h-4 w-4" />{d.clients.addClient}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const primary = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
            return (
              <Card
                key={client.id}
                className="cursor-pointer transition-shadow hover:shadow-card"
                onClick={() => api.getClient(token!, client.id).then(setSelected)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar fallback={client.name.slice(0, 2).toUpperCase()} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {fmt(d.clients.contacts, { count: client.contacts.length })}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {primary?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{primary.email}</p>}
                    {primary?.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{primary.phone}</p>}
                    <p className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{fmt(d.clients.casesCount, { count: client._count?.cases ?? 0 })}</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
