'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { BriefcaseBusiness, Calendar, Clock, X } from 'lucide-react';
import { CASE_STAGE_LABELS_TH, type CaseStage } from '@lawfirm/shared';
import { api, type Client360Overview, type LogClientContactPayload } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Input } from '@/components/ui/input';
import { InlineEmptyState, Modal, PageLoading } from '@/components/ui/misc';

type ContactForm = Omit<LogClientContactPayload, 'reached'> & { reached: boolean | null };

const initialForm: ContactForm = {
  caseId: '', contactId: '', recipientUserId: '', channel: 'INBOUND_CALL',
  reached: null, note: '',
};

const channelLabels: Record<LogClientContactPayload['channel'], string> = {
  INBOUND_CALL: 'ลูกความโทรเข้า', OUTBOUND_CALL: 'สำนักงานโทรออก',
  EMAIL: 'อีเมล', LINE: 'LINE', MEETING: 'ประชุม',
};

function dateLabel(value: string | null) {
  if (!value) return 'ยังไม่กำหนด';
  return new Date(value).toLocaleDateString('th-TH', {
    day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok',
  });
}

function personName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

export function Client360Panel({
  clientId, token, mode = 'overview', billing, reports, onOpenCases, onChanged, onSaved,
}: { clientId: string; token: string; mode?: 'header' | 'overview' | 'cases'; billing?: React.ReactNode; reports?: React.ReactNode; onOpenCases?: () => void; onChanged?: (overview: Client360Overview) => void; onSaved?: () => void }) {
  const [overview, setOverview] = useState<Client360Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [caseFilter, setCaseFilter] = useState('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [showLog, setShowLog] = useState(false);
  const [form, setForm] = useState<ContactForm>(initialForm);
  const [extraTask, setExtraTask] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState('');

  const load = async () => {
    try {
      const data = await api.getClient360(token, clientId);
      setOverview(data);
      onChanged?.(data);
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลลูกความไม่สำเร็จ');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setOverview(null);
    setLoading(true);
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, token]);

  const openLog = (caseId = '') => {
    setForm({ ...initialForm, caseId: caseId || (overview?.cases.length === 1 ? overview.cases[0].id : '') });
    setExtraTask(false);
    setSaveError('');
    setSaved('');
    setShowLog(true);
  };

  const submitLog = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (form.reached === null || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const payload: LogClientContactPayload = {
        caseId: form.caseId, contactId: form.contactId,
        recipientUserId: form.recipientUserId, channel: form.channel,
        reached: form.reached, note: form.note.trim(),
        ...(form.reached && extraTask ? {
          followupTitle: form.followupTitle?.trim(),
          followupDueDate: form.followupDueDate,
        } : {}),
      };
      await api.logClientContact(token, clientId, payload);
      setShowLog(false);
      setSaved(form.reached ? 'บันทึกการติดต่อแล้ว' : 'บันทึกและสร้างงานโทรกลับให้ทนายแล้ว');
      await load();
      onSaved?.();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'บันทึกการติดต่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !overview) return <PageLoading lines={3} />;
  if (!overview) return <LoadFailed message={loadError || 'โหลดข้อมูลลูกความไม่สำเร็จ'} onRetry={() => { setLoading(true); void load(); }} />;

  const cases = overview.cases.filter((item) => {
    if (mode !== 'cases') return !['CLOSED', 'ARCHIVED'].includes(item.status);
    const matches = caseFilter === 'all' || (caseFilter === 'represented' && item.roles.includes('REPRESENTED')) || (caseFilter === 'payer' && item.roles.includes('PAYER')) || (caseFilter === 'closed' && ['CLOSED', 'ARCHIVED'].includes(item.status));
    const term = caseSearch.trim().toLocaleLowerCase();
    return matches && (!term || [item.title, item.ownRef, item.customerRef, item.policyRef, item.blackCaseNumber, item.redCaseNumber].some((value) => value?.toLocaleLowerCase().includes(term)));
  });
  const activities = overview.activities.filter((item) => item.contactData);
  const caseById = new Map(overview.cases.map((item) => [item.id, item]));
  const contact = overview.client.contacts.find((item) => item.id === form.contactId);
  const lawyer = overview.lawyers.find((item) => item.id === form.recipientUserId);
  const selectedCase = caseById.get(form.caseId);

  return (
    <div className="space-y-5">
      {saved && <div role="status" className="rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">{saved}</div>}
      {mode === 'header' ? <div className="border-t border-amber-200 pt-4">
        <div className="flex items-start gap-3"><Clock className="mt-1 h-5 w-5 text-warning" aria-hidden /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>สิ่งที่ต้องทำต่อ</strong>{overview.tasks[0]?.dueDate && bangkokDateInputValue(overview.tasks[0].dueDate) <= bangkokDateInputValue(new Date()) && <Badge variant="warning">เร่งด่วน</Badge>}</div><p className="text-sm">{overview.tasks[0]?.title ?? 'ยังไม่มีงานค้าง'}</p></div></div>
        <div className="mt-4"><Button onClick={() => openLog(overview.tasks[0]?.caseId)} disabled={!overview.cases.length || !overview.client.contacts.length || !overview.lawyers.length}>บันทึกการติดต่อ</Button><p className="mt-1 text-xs text-muted-foreground">จดว่าลูกความโทรมาเรื่องอะไร ระบบสร้างงานโทรกลับให้</p></div>
      </div> : <>
        <Card className="p-5 sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="flex items-center gap-2"><h3 className="font-display text-xl font-bold">{mode === 'cases' ? 'คดีทั้งหมด' : 'คดีที่เปิดอยู่'}</h3><Badge variant="muted">{cases.length} คดี</Badge></div><div className="flex flex-wrap items-center gap-3"><Link href={`/cases/new?clientId=${encodeURIComponent(clientId)}`} title="กดเพื่อเปิดคดีใหม่ให้ลูกความรายนี้" className={buttonVariants({ size: 'sm', variant: 'outline' })}>เปิดคดีใหม่</Link>{mode === 'overview' && <button type="button" onClick={onOpenCases} className="text-sm font-medium text-primary hover:underline">ดูสำนวนทั้งหมด →</button>}</div></div>
          {mode === 'cases' && <div className="mb-4 flex flex-wrap gap-2"><div role="group" aria-label="กรองคดี" className="flex flex-wrap gap-1">{[['all', 'ทั้งหมด'], ['represented', 'ลูกความ'], ['payer', 'ผู้ว่าจ้าง'], ['closed', 'ปิดแล้ว']].map(([value, label]) => <button key={value} type="button" aria-pressed={caseFilter === value} onClick={() => setCaseFilter(value)} className={`min-h-10 rounded-md px-3 text-sm ${caseFilter === value ? 'bg-muted font-semibold' : 'hover:bg-muted'}`}>{label}</button>)}</div><Input aria-label="ค้นหาคดี" className="max-w-xs" value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="ชื่อคดี / เลขอ้างอิง" /></div>}
          {cases.length ? <div className="divide-y">{cases.map((item) => {
            const next = overview.tasks.filter((task) => task.caseId === item.id && task.dueDate).sort((a, b) => a.dueDate!.localeCompare(b.dueDate!))[0];
            return <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong>{item.blackCaseNumber || item.ownRef}</strong><span>· {item.title}</span>{CASE_STAGE_LABELS_TH[item.stage as CaseStage] && <Badge variant="muted">{CASE_STAGE_LABELS_TH[item.stage as CaseStage]}</Badge>}</div>{next && <p className="mt-2 flex items-center gap-1 text-sm text-muted-foreground"><Calendar className="h-4 w-4" aria-hidden />กำหนด {dateLabel(next.dueDate)} · {next.title}</p>}</div><div className="text-center"><Link href={`/cases/${item.id}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>เปิดคดี</Link><p className="mt-1 text-xs text-muted-foreground">ไปที่แฟ้มคดี</p></div></div>;
          })}</div> : <InlineEmptyState icon={BriefcaseBusiness} title="ยังไม่มีคดีที่เปิดอยู่" description="เริ่มด้วยการเปิดคดีขั้นก่อนฟ้องให้ลูกความรายนี้" action={<Link href={`/cases/new?clientId=${encodeURIComponent(clientId)}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>เปิดคดีใหม่</Link>} />}
        </Card>
        {mode === 'overview' && <>{billing}<details className="rounded-lg border bg-card"><summary className="disclosure cursor-pointer p-5 font-semibold">บันทึกการติดต่อล่าสุด ({activities.length}{overview.activities.length === 30 ? ' +' : ''}) <span className="ml-2 text-sm font-normal text-muted-foreground">คลิกเพื่อขยายดูประวัติ</span></summary><div className="space-y-3 border-t p-5">{activities.length ? activities.map((item) => <div key={item.id}><p className="text-xs text-muted-foreground">{dateLabel(item.activityAt)} · {channelLabels[item.contactData!.channel as LogClientContactPayload['channel']] ?? 'ติดต่อ'}</p><p className="font-medium">{item.title}</p>{item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}</div>) : <p className="text-sm text-muted-foreground">ยังไม่มีบันทึกการติดต่อ</p>}{overview.activities.some((item) => !item.contactData) && <details className="mt-3"><summary className="disclosure cursor-pointer text-sm text-primary">ดูกิจกรรมคดีอื่น</summary><div className="space-y-3 pt-3">{overview.activities.filter((item) => !item.contactData).map((item) => <div key={item.id}><p className="text-xs text-muted-foreground">{dateLabel(item.activityAt)}</p><p className="font-medium">{item.title}</p>{item.description && <p className="text-sm text-muted-foreground">{item.description}</p>}<Link href={`/cases/${item.caseId}`} className="text-xs text-primary hover:underline">{caseById.get(item.caseId)?.ownRef}</Link></div>)}</div></details>}</div></details>{reports}</>}
      </>}

      <Modal open={showLog} onClose={() => !saving && setShowLog(false)} className="max-w-xl p-0" ariaLabel="บันทึกการติดต่อ">
        <form onSubmit={submitLog}>
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-5 py-4"><div><h3 className="text-lg font-bold">บันทึกการติดต่อ</h3><p className="mt-1 text-sm text-muted-foreground">บันทึกในคดีเดิมและหน้าภาพรวมลูกความ</p></div><button type="button" aria-label="ปิด" onClick={() => setShowLog(false)} className="-mr-2 -mt-2 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><X className="h-5 w-5" aria-hidden /></button></div>
          <div className="space-y-4 px-5 py-5">
            <label className="block text-sm font-medium">คดีที่เกี่ยวข้อง <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.caseId} onChange={(event) => setForm({ ...form, caseId: event.target.value })}><option value="">เลือกคดี</option>{overview.cases.map((item) => <option key={item.id} value={item.id}>{item.ownRef} · {item.title}</option>)}</select></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">ผู้ติดต่อจากลูกความ <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.contactId} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">เลือกผู้ติดต่อ</option>{overview.client.contacts.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">ช่องทาง<select className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as LogClientContactPayload['channel'] })}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <label className="block text-sm font-medium">ลูกความต้องการติดต่อใคร <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.recipientUserId} onChange={(event) => setForm({ ...form, recipientUserId: event.target.value })}><option value="">เลือกทนาย</option>{overview.lawyers.map((item) => <option key={item.id} value={item.id}>{personName(item)}</option>)}</select></label>
            <fieldset><legend className="mb-2 text-sm font-medium">ลูกความได้ติดต่อทนายคนนั้นหรือไม่ <span className="text-destructive">*</span></legend><div className="grid gap-2 sm:grid-cols-2"><label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${form.reached === true ? 'border-primary bg-primary/5' : ''}`}><input required type="radio" name="reached" className="mt-1 accent-primary" checked={form.reached === true} onChange={() => { setForm({ ...form, reached: true }); setExtraTask(false); }} /><span><strong className="block">ได้คุยแล้ว</strong><span className="text-xs text-muted-foreground">บันทึกผลการสนทนา</span></span></label><label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${form.reached === false ? 'border-primary bg-primary/5' : ''}`}><input required type="radio" name="reached" className="mt-1 accent-primary" checked={form.reached === false} onChange={() => { setForm({ ...form, reached: false }); setExtraTask(false); }} /><span><strong className="block">ยังไม่ได้คุย</strong><span className="text-xs text-muted-foreground">เช่น ทนายไปศาลหรือไม่ว่าง</span></span></label></div></fieldset>
            <label className="block text-sm font-medium">{form.reached === false ? 'ข้อความที่ลูกความฝาก / เหตุที่ยังไม่ได้คุย' : 'ผลการคุย / ข้อความที่ฝากไว้'} <span className="text-destructive">*</span><textarea required maxLength={2000} rows={3} className="mt-1.5 w-full resize-y rounded-md border bg-card px-3 py-2 text-sm" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={form.reached === false ? 'เช่น ทนายไปศาล ลูกความขอให้โทรกลับเรื่องเอกสาร' : 'สรุปสิ่งที่คุยหรือข้อความที่ฝากไว้'} /></label>
            {form.reached === false && <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-sm text-success"><strong className="block">สร้างงานโทรกลับอัตโนมัติ</strong><span className="mt-1 block text-xs">มอบหมายให้ {lawyer ? personName(lawyer) : 'ทนายที่เลือก'} {form.channel === 'INBOUND_CALL' ? 'โทรกลับ' : 'ติดต่อกลับ'} {contact?.name ?? 'ผู้ติดต่อที่เลือก'}{contact?.phone ? ` (${contact.phone})` : ''} วันนี้ · {selectedCase?.ownRef ?? 'คดีที่เลือก'}</span></div>}
            {form.reached === true && <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extraTask} onChange={(event) => setExtraTask(event.target.checked)} />มีงานอื่นที่ต้องติดตามต่อ</label>{extraTask && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">สิ่งที่ต้องทำ<Input required maxLength={200} className="mt-1" value={form.followupTitle ?? ''} onChange={(event) => setForm({ ...form, followupTitle: event.target.value })} placeholder="เช่น ขอเอกสารเพิ่ม" /></label><label className="text-sm">กำหนดวัน<Input required type="date" className="mt-1" value={form.followupDueDate ?? ''} onChange={(event) => setForm({ ...form, followupDueDate: event.target.value })} /></label><p className="text-xs text-muted-foreground sm:col-span-2">งานจะมอบหมายให้ทนายที่ลูกความติดต่อ</p></div>}</div>}
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          </div>
          <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-card px-5 py-4"><Button type="button" variant="outline" onClick={() => setShowLog(false)} disabled={saving}>ยกเลิก</Button><Button type="submit" disabled={saving || form.reached === null}>{saving ? 'กำลังบันทึก…' : form.reached === false ? 'บันทึกและสร้างงานโทรกลับ' : 'บันทึกการติดต่อ'}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
