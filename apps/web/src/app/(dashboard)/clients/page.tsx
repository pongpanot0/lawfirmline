'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { hasFirmCapability } from '@lawfirm/shared';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Search, Mail, Phone, Building2, Briefcase, Plus, User, Pencil, Trash2, Copy, Check, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, ClientItem, ContactCaseAccessEntry } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { SelectField, TextField, TextareaField } from '@/components/ui/form-fields';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { EmptyState, InlineEmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { ClientAnnualReportsPanel } from '@/components/reports/ClientAnnualReportsPanel';
import { Client360Panel } from '@/components/clients/Client360Panel';

export default function ClientsPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientItem | null>(null);
  const [tab, setTab] = useState('overview');
  const [editingInfo, setEditingInfo] = useState(false);
  const [savingInfo, setSavingInfo] = useState(false);
  const [infoForm, setInfoForm] = useState({ taxId: '', branch: '', address: '', billingEmail: '', billingPhone: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [infoError, setInfoError] = useState('');

  const emptyContact = { name: '', nickname: '', email: '', phone: '', position: '', isPrimary: false, notes: '' };
  const [showContactForm, setShowContactForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactForm, setContactForm] = useState(emptyContact);
  const [savingContact, setSavingContact] = useState(false);

  const [deleteError, setDeleteError] = useState<string | null>(null);
  const deleteClient = async () => {
    if (!token || !selected) return;
    if (!window.confirm(`ลบลูกความ "${selected.name}" ถาวร? ผู้ติดต่อและสิทธิ์พอร์ทัลจะถูกลบด้วย กู้คืนไม่ได้`)) return;
    setDeleteError(null);
    try {
      await api.deleteClient(token, selected.id);
      setSelected(null);
      router.replace('/clients');
      load();
    } catch (err) {
      setDeleteError(err instanceof ApiError && err.message ? err.message : 'ลบลูกความไม่สำเร็จ');
    }
  };

  const load = () => {
    if (!token) return;
    setLoadError(false);
    api.getClients(token, search || undefined)
      .then(setClients)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  const openAddContact = () => {
    setEditingContactId(null);
    setContactForm(emptyContact);
    setShowContactForm(true);
  };

  const openEditContact = (c: ClientItem['contacts'][number]) => {
    setEditingContactId(c.id ?? null);
    setContactForm({ name: c.name, nickname: c.nickname ?? '', email: c.email ?? '', phone: c.phone ?? '', position: c.position ?? '', isPrimary: c.isPrimary ?? false, notes: c.notes ?? '' });
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
        updatedContacts = [...selected.contacts, contactForm];
      }
      setContactError(null);
      const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
      setSelected(updated);
      setShowContactForm(false);
      setEditingContactId(null);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'บันทึกบุคคลติดต่อไม่สำเร็จ');
    } finally {
      setSavingContact(false);
    }
  };

  const deleteContact = async (contactId: string) => {
    const name = selected?.contacts.find((c) => c.id === contactId)?.name ?? '';
    if (!token || !selected || !confirm(`ลบบุคคลติดต่อ "${name}"?`)) return;
    const updatedContacts = selected.contacts.filter((c) => c.id !== contactId);
    setContactError(null);
    try {
      const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
      setSelected(updated);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'ลบบุคคลติดต่อไม่สำเร็จ');
    }
  };

  const togglePortalAccess = async (contactId: string, next: boolean) => {
    if (!token || !selected) return;
    const updatedContacts = selected.contacts.map((c) =>
      c.id === contactId ? { ...c, portalEnabled: next } : c,
    );
    setContactError(null);
    try {
      const updated = await api.updateClient(token, selected.id, { contacts: updatedContacts });
      setSelected(updated);
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'อัปเดตสิทธิ์พอร์ทัลไม่สำเร็จ');
    }
  };

  const [invitingContactId, setInvitingContactId] = useState<string | null>(null);
  const [inviteSentFor, setInviteSentFor] = useState<
    Record<string, { inviteUrl: string; emailSent: boolean; lineSent: boolean }>
  >({});
  const [contactError, setContactError] = useState<string | null>(null);
  const [copiedInviteFor, setCopiedInviteFor] = useState<string | null>(null);

  const sendPortalInvite = async (contactId: string) => {
    if (!token) return;
    setInvitingContactId(contactId);
    setContactError(null);
    try {
      const invite = await api.sendPortalInvite(token, contactId);
      setInviteSentFor((prev) => ({
        ...prev,
        [contactId]: {
          inviteUrl: invite.inviteUrl,
          emailSent: invite.emailSent,
          lineSent: invite.lineSent,
        },
      }));
    } catch (err) {
      setContactError(err instanceof Error ? err.message : 'ส่งคำเชิญไม่สำเร็จ');
    } finally {
      setInvitingContactId(null);
    }
  };

  const copyInviteLink = async (contactId: string, inviteUrl: string) => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopiedInviteFor(contactId);
    setTimeout(() => setCopiedInviteFor((id) => (id === contactId ? null : id)), 2000);
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

  const revokeCaseAccess = async (caseId: string, accessId: string, contactName: string) => {
    if (!token || !confirm(`ถอนสิทธิ์เข้าดูคดีของ "${contactName}"?`)) return;
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
    setDeleteError(null);
    if (!selected || !token || !hasFirmCapability(user?.firmRole, 'manageFirmContent')) return;
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
        <button type="button" onClick={() => setSelected(null)} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {d.clients.allClients}
        </button>
        <PageHeader
          title={selected.name}
          description={selected.type === 'COMPANY' ? d.clients.company : d.clients.individual}
        />

        <Tabs value={tab} onValueChange={setTab}>
          <div className="max-w-full overflow-x-auto pb-1">
            <TabsList>
              <TabsTrigger value="overview">ภาพรวม 360</TabsTrigger>
              <TabsTrigger value="information">{d.clients.information}</TabsTrigger>
              <TabsTrigger value="contacts">{d.clients.contactsTab}</TabsTrigger>
              {hasFirmCapability(user?.firmRole, 'manageFirmContent') && <TabsTrigger value="cases">สิทธิ์คดีพอร์ทัล</TabsTrigger>}
              {hasFirmCapability(user?.firmRole, 'manageFirmContent') && <TabsTrigger value="annual-reports">รายงานประจำปี</TabsTrigger>}
            </TabsList>
          </div>

          <TabsContent value="overview">
            {token && <Client360Panel key={selected.id} clientId={selected.id} token={token} onOpenReports={hasFirmCapability(user?.firmRole, 'manageFirmContent') ? () => setTab('annual-reports') : undefined} />}
          </TabsContent>

          <TabsContent value="information">
            <Card>
              <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
                {primary?.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div><p className="text-xs text-muted-foreground">{d.clients.email}</p><p className="text-sm">{primary.email}</p></div>
                  </div>
                )}
                {primary?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <div><p className="text-xs text-muted-foreground">{d.clients.phone}</p><p className="text-sm">{primary.phone}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" aria-hidden />
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

            {/* ข้อมูลที่ใบแจ้งหนี้/ใบเสร็จ/ใบเสนอราคาต้องใช้ — แก้ไขได้ตลอด */}
            <Card className="mt-4">
              <CardContent className="p-6">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold">ข้อมูลออกเอกสาร (ใบแจ้งหนี้ / ใบเสร็จ / ใบเสนอราคา)</h2>
                  {!editingInfo && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setInfoForm({
                          taxId: selected.taxId ?? '',
                          branch: selected.branch ?? '',
                          address: selected.address ?? '',
                          billingEmail: selected.billingEmail ?? '',
                          billingPhone: selected.billingPhone ?? '',
                        });
                        setInfoError('');
                        setEditingInfo(true);
                      }}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden />
                      แก้ไขข้อมูลออกเอกสาร
                    </Button>
                  )}
                </div>
                {editingInfo ? (
                  <form
                    className="grid gap-3 sm:grid-cols-2"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (!token || !selected || savingInfo) return;
                      setSavingInfo(true);
                      try {
                        const updated = await api.updateClient(token, selected.id, {
                          taxId: infoForm.taxId.trim() || null,
                          branch: infoForm.branch.trim() || null,
                          address: infoForm.address.trim() || null,
                          billingEmail: infoForm.billingEmail.trim() || null,
                          billingPhone: infoForm.billingPhone.trim() || null,
                        });
                        setSelected(updated);
                        setClients((prev) => prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)));
                        setEditingInfo(false);
                      } catch (err) {
                        // ค่าที่พิมพ์ยังอยู่ กดบันทึกซ้ำได้
                        setInfoError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
                      } finally {
                        setSavingInfo(false);
                      }
                    }}
                  >
                    <TextField label="เลขประจำตัวผู้เสียภาษี" value={infoForm.taxId} onChange={(e) => setInfoForm((f) => ({ ...f, taxId: e.target.value }))} />
                    <TextField label="สาขา" placeholder="เช่น สำนักงานใหญ่" value={infoForm.branch} onChange={(e) => setInfoForm((f) => ({ ...f, branch: e.target.value }))} />
                    <TextareaField label="ที่อยู่สำหรับออกเอกสาร" containerClassName="sm:col-span-2" rows={2} className="resize-none" value={infoForm.address} onChange={(e) => setInfoForm((f) => ({ ...f, address: e.target.value }))} />
                    <TextField label="อีเมลสำหรับส่งเอกสาร" type="email" value={infoForm.billingEmail} onChange={(e) => setInfoForm((f) => ({ ...f, billingEmail: e.target.value }))} />
                    <TextField label="เบอร์ติดต่อเรื่องเอกสาร" type="tel" inputMode="tel" value={infoForm.billingPhone} onChange={(e) => setInfoForm((f) => ({ ...f, billingPhone: e.target.value }))} />
                    {infoError && <p role="alert" className="text-sm text-destructive sm:col-span-2">{infoError}</p>}
                    <div className="flex flex-wrap justify-end gap-2 sm:col-span-2">
                      <Button type="button" size="sm" variant="outline" onClick={() => setEditingInfo(false)}>ยกเลิก</Button>
                      <Button type="submit" size="sm" disabled={savingInfo}>{savingInfo ? 'กำลังบันทึก…' : 'บันทึกข้อมูลออกเอกสาร'}</Button>
                    </div>
                  </form>
                ) : (
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    <div><p className="text-xs text-muted-foreground">เลขประจำตัวผู้เสียภาษี</p><p>{selected.taxId || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">สาขา</p><p>{selected.branch || '—'}</p></div>
                    <div className="sm:col-span-2"><p className="text-xs text-muted-foreground">ที่อยู่สำหรับออกเอกสาร</p><p className="whitespace-pre-wrap">{selected.address || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">อีเมลสำหรับส่งเอกสาร</p><p>{selected.billingEmail || '—'}</p></div>
                    <div><p className="text-xs text-muted-foreground">เบอร์ติดต่อเรื่องเอกสาร</p><p>{selected.billingPhone || '—'}</p></div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts">
            <div className="space-y-3">
              <div className="flex justify-end">
                <Button size="sm" onClick={openAddContact}>
                  <Plus className="h-4 w-4" aria-hidden />เพิ่มบุคคลติดต่อ
                </Button>
              </div>

              {/* Inline form */}
              {showContactForm && (
                <Card className="border-primary/40">
                  <CardContent className="p-4 space-y-3">
                    <h2 className="text-sm font-medium">{editingContactId ? 'แก้ไขบุคคลติดต่อ' : 'เพิ่มบุคคลติดต่อใหม่'}</h2>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <TextField label="ชื่อ-นามสกุล" required value={contactForm.name} onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))} />
                      <TextField label="ชื่อเล่น" value={contactForm.nickname} onChange={(e) => setContactForm((f) => ({ ...f, nickname: e.target.value }))} />
                      <TextField label="เบอร์โทร" type="tel" inputMode="tel" value={contactForm.phone} onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))} />
                      <TextField label="อีเมล" type="email" value={contactForm.email} onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))} />
                      <TextField label="ตำแหน่ง / ความสัมพันธ์" value={contactForm.position} onChange={(e) => setContactForm((f) => ({ ...f, position: e.target.value }))} placeholder="เช่น CEO, ทายาท, ผู้จัดการ" />
                      <div className="flex min-h-11 items-center gap-2 sm:pt-6">
                        <input type="checkbox" id="isPrimary" checked={contactForm.isPrimary} onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))} className="h-4 w-4" />
                        <label htmlFor="isPrimary" className="text-sm">ผู้ติดต่อหลัก</label>
                      </div>
                      <TextField label="หมายเหตุ" containerClassName="sm:col-span-2" value={contactForm.notes} onChange={(e) => setContactForm((f) => ({ ...f, notes: e.target.value }))} placeholder="เช่น ติดต่อได้เฉพาะวันทำการ" />
                    </div>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="outline" onClick={cancelContactForm}>ยกเลิก</Button>
                      <Button size="sm" onClick={saveContact} disabled={savingContact || !contactForm.name.trim()}>
                        {savingContact ? 'กำลังบันทึก...' : 'บันทึกบุคคลติดต่อ'}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}

              {contactError && <p role="alert" className="text-sm text-destructive">{contactError}</p>}

              {/* Contact list */}
              {selected.contacts.map((c, i) => (
                <Card key={c.id ?? i}>
                  <CardContent className="space-y-3 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                      <User className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 font-medium">
                          {c.name}
                          {c.nickname && <span className="text-sm font-normal text-muted-foreground">({c.nickname})</span>}
                          {c.isPrimary && <Badge variant="default">ผู้ติดต่อหลัก</Badge>}
                          {c.portalEnabled && <Badge variant="success">เปิดพอร์ทัลแล้ว</Badge>}
                          {c.id && lineStatus[c.id] && (
                            <Badge variant={lineStatus[c.id].connected ? 'success' : 'muted'}>
                              {lineStatus[c.id].connected ? 'LINE เชื่อมต่อแล้ว' : 'LINE ยังไม่เชื่อมต่อ'}
                            </Badge>
                          )}
                        </p>
                        {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                        <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                          {c.phone && <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{c.phone}</p>}
                          {c.email && <p className="flex items-center gap-1 break-all"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />{c.email}</p>}
                          {c.notes && <p className="text-xs">{c.notes}</p>}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-1">
                      {c.id && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          disabled={invitingContactId === c.id}
                          onClick={() => sendPortalInvite(c.id!)}
                        >
                          {invitingContactId === c.id
                            ? 'กำลังส่ง...'
                            : c.portalEnabled
                              ? 'สร้างลิงก์เข้าใช้ใหม่'
                              : c.email || lineStatus[c.id]?.connected
                                ? 'ส่งคำเชิญเข้าใช้พอร์ทัล'
                                : 'สร้างลิงก์คำเชิญ'}
                        </Button>
                      )}
                      {c.id && c.email && (
                        <Button size="sm" variant="outline" onClick={() => togglePortalAccess(c.id!, !c.portalEnabled)} className="text-xs">
                          {c.portalEnabled ? 'ปิดพอร์ทัล' : 'เปิดพอร์ทัล'}
                        </Button>
                      )}
                      <Button size="icon" variant="ghost" aria-label={`แก้ไข ${c.name}`} onClick={() => openEditContact(c)}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      {c.id && (
                        <Button size="icon" variant="ghost" aria-label={`ลบ ${c.name}`} className="text-destructive hover:text-destructive" onClick={() => deleteContact(c.id!)}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                    </div>

                    {c.id && inviteSentFor[c.id] && (
                      <div className="rounded-md border bg-muted/40 p-3 space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {[
                            inviteSentFor[c.id!].emailSent ? `ส่งอีเมลแล้ว (${c.email})` : null,
                            inviteSentFor[c.id!].lineSent ? 'ส่งทาง LINE แล้ว' : null,
                          ].filter(Boolean).join(' · ') ||
                            'คัดลอกลิงก์ด้านล่างส่งให้ลูกค้าทาง LINE เองได้เลย'}
                        </p>
                        <div className="flex min-w-0 items-center gap-2">
                          <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-xs">
                            {inviteSentFor[c.id!].inviteUrl}
                          </code>
                          <Button
                            size="sm"
                            variant="outline"
                            className="shrink-0 text-xs"
                            onClick={() => copyInviteLink(c.id!, inviteSentFor[c.id!].inviteUrl)}
                          >
                            {copiedInviteFor === c.id ? (
                              <><Check className="h-3.5 w-3.5" aria-hidden />คัดลอกแล้ว</>
                            ) : (
                              <><Copy className="h-3.5 w-3.5" aria-hidden />คัดลอกลิงก์</>
                            )}
                          </Button>
                        </div>
                        <p className="text-xs text-muted-foreground">ลิงก์ใช้ได้ 7 วัน</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}

              {selected.contacts.length === 0 && !showContactForm && (
                <InlineEmptyState title="ยังไม่มีบุคคลติดต่อ" action={<Button size="sm" variant="outline" onClick={openAddContact}><Plus className="h-4 w-4" aria-hidden />เพิ่มบุคคลติดต่อ</Button>} />
              )}
            </div>
          </TabsContent>

          {hasFirmCapability(user?.firmRole, 'manageFirmContent') && <TabsContent value="cases">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">คดีที่ลูกค้ารายนี้เป็นลูกความหลัก และผู้ติดต่อที่เห็นคดีในพอร์ทัล</p>
              {(selected.cases ?? []).map((c) => {
                const eligibleContacts = selected.contacts.filter((ct) => ct.id && ct.portalEnabled);
                const entries = caseAccess[c.id] ?? [];
                const activeEntries = entries.filter((e) => !e.revokedAt);
                const isLoading = caseAccessLoading[c.id];
                const hasError = caseAccessError[c.id];
                return (
                  <Card key={c.id}>
                    <CardContent className="p-4 space-y-3">
                      <Link
                        href={`/cases/${c.id}`}
                        className="flex min-h-11 items-center justify-between gap-3 rounded-md hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <div className="min-w-0">
                          <p className="font-medium">{c.title}</p>
                          <p className="text-xs text-muted-foreground">{c.ownRef}{c.courtName ? ` · ${c.courtName}` : ''}</p>
                        </div>
                        <CaseStatusBadge status={c.status} />
                      </Link>

                      <div className="border-t pt-3 space-y-2">
                        <p className="text-xs font-medium text-muted-foreground">สิทธิ์เข้าถึงคดี</p>

                        {isLoading ? (
                          <div role="status" aria-label="กำลังโหลดสิทธิ์เข้าถึง" className="h-8 w-full animate-pulse rounded-md bg-muted" />
                        ) : hasError ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <p role="alert" className="text-xs text-destructive">โหลดสิทธิ์เข้าถึงไม่สำเร็จ</p>
                            <Button size="sm" variant="outline" onClick={() => loadCaseAccess(c.id)}>{d.common.retry}</Button>
                          </div>
                        ) : (
                          <>
                            {activeEntries.length === 0 ? (
                              <p className="text-xs text-muted-foreground">ยังไม่มีผู้ติดต่อที่ได้รับสิทธิ์</p>
                            ) : (
                              <ul className="space-y-1">
                                {activeEntries.map((entry) => (
                                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                                    <span className="min-w-0 break-words">
                                      {entry.clientContact.name}
                                      {entry.clientContact.email ? ` (${entry.clientContact.email})` : ''}
                                    </span>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="text-xs text-destructive hover:text-destructive"
                                      disabled={revokingAccessId === entry.id}
                                      onClick={() => revokeCaseAccess(c.id, entry.id, entry.clientContact.name)}
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
                          <div className="flex flex-wrap items-end gap-2 pt-1">
                            <SelectField
                              label="ให้สิทธิ์ผู้ติดต่อ"
                              containerClassName="min-w-0 flex-1"
                              value={grantSelection[c.id] ?? ''}
                              onChange={(e) => setGrantSelection((s) => ({ ...s, [c.id]: e.target.value }))}
                            >
                              <option value="">เลือกผู้ติดต่อ</option>
                              {eligibleContacts
                                .filter((ct) => !activeEntries.some((e) => e.clientContactId === ct.id))
                                .map((ct) => (
                                  <option key={ct.id} value={ct.id}>
                                    {ct.name}
                                  </option>
                                ))}
                            </SelectField>
                            <Button
                              size="sm"
                              variant="outline"
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
                <InlineEmptyState
                  title={d.clients.noCasesLinked}
                  description="ถ้าเป็นผู้ว่าจ้างหรือลูกความเพิ่มเติม ให้ดูรายการในภาพรวม 360"
                />
              )}
            </div>
          </TabsContent>}
          {hasFirmCapability(user?.firmRole, 'manageFirmContent') && token && (
            <TabsContent value="annual-reports">
              <ClientAnnualReportsPanel
                key={selected.id} client={selected} token={token}
                onOpenContacts={() => setTab('contacts')}
              />
            </TabsContent>
          )}
        </Tabs>

        {user?.firmRole === 'OWNER' && (
          <div className="mt-8 flex flex-col items-end gap-2 border-t pt-6">
            {deleteError && <p role="alert" className="text-sm text-destructive">{deleteError}</p>}
            <Button variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void deleteClient()}>
              <Trash2 className="h-4 w-4" aria-hidden />ลบลูกความ {selected.name}
            </Button>
          </div>
        )}
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
            <Plus className="h-4 w-4" aria-hidden />{d.clients.addClient}
          </Button>
        }
      />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input type="search" aria-label={d.clients.searchPlaceholder} placeholder={d.clients.searchPlaceholder} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loadError ? (
        <LoadFailed onRetry={load} />
      ) : loading ? (
        <PageLoading title={d.clients.loading} lines={3} />
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={d.clients.empty}
          description={d.clients.emptyHint}
          action={search ? undefined : (
            <Button size="sm" variant="outline" onClick={() => router.push('/clients/new')}>
              <Plus className="h-4 w-4" aria-hidden />{d.clients.addClient}
            </Button>
          )}
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const primary = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
            return (
              <button
                type="button"
                key={client.id}
                className="group rounded-xl border bg-card text-left transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                onClick={() => api.getClient(token!, client.id).then(setSelected).catch(() => setLoadError(true))}
              >
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar fallback={client.name.slice(0, 2).toUpperCase()} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{client.name}</p>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        {fmt(d.clients.contacts, { count: client.contacts.length })}
                      </p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground group-hover:text-primary" aria-hidden />
                  </div>
                  {(primary?.email || primary?.phone) && (
                    <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                      {primary?.email && <p className="flex min-w-0 items-center gap-1"><Mail className="h-3.5 w-3.5 shrink-0" aria-hidden /><span className="truncate">{primary.email}</span></p>}
                      {primary?.phone && <p className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" aria-hidden />{primary.phone}</p>}
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
