'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { ArrowRight, BriefcaseBusiness, CalendarClock, Mail, Phone, Plus, Search, X } from 'lucide-react';
import { CASE_STAGE_LABELS_TH, type CaseStage } from '@lawfirm/shared';
import { api, type Client360Overview, type LogClientContactPayload } from '@/lib/api';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { InlineEmptyState, Modal, PageLoading } from '@/components/ui/misc';

type CaseFilter = 'all' | 'represented' | 'payer' | 'closed';
type TimelineFilter = 'all' | 'contact' | 'other';
type ContactForm = Omit<LogClientContactPayload, 'reached'> & { reached: boolean | null };

const initialForm: ContactForm = {
  caseId: '', contactId: '', recipientUserId: '', channel: 'INBOUND_CALL',
  reached: null, note: '',
};

const channelLabels: Record<LogClientContactPayload['channel'], string> = {
  INBOUND_CALL: 'ลูกค้าโทรเข้า', OUTBOUND_CALL: 'สำนักงานโทรออก',
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
  clientId, token, onOpenReports,
}: { clientId: string; token: string; onOpenReports?: () => void }) {
  const [overview, setOverview] = useState<Client360Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [caseFilter, setCaseFilter] = useState<CaseFilter>('all');
  const [caseSearch, setCaseSearch] = useState('');
  const [timelineFilter, setTimelineFilter] = useState<TimelineFilter>('all');
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
      setLoadError('');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'โหลดข้อมูลลูกค้าไม่สำเร็จ');
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
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'บันทึกการติดต่อไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (loading && !overview) return <PageLoading lines={3} />;
  if (!overview) return <InlineEmptyState title="เปิดภาพรวมลูกค้าไม่ได้" description={loadError} action={<Button size="sm" onClick={() => void load()}>ลองอีกครั้ง</Button>} />;

  const cases = overview.cases.filter((item) => {
    const matchesFilter = caseFilter === 'all'
      || (caseFilter === 'represented' && item.roles.includes('REPRESENTED'))
      || (caseFilter === 'payer' && item.roles.includes('PAYER'))
      || (caseFilter === 'closed' && ['CLOSED', 'ARCHIVED'].includes(item.status));
    const term = caseSearch.trim().toLocaleLowerCase();
    return matchesFilter && (!term || [item.title, item.ownRef, item.customerRef, item.policyRef, item.blackCaseNumber, item.redCaseNumber]
      .some((value) => value?.toLocaleLowerCase().includes(term)));
  });
  const activities = overview.activities.filter((item) => timelineFilter === 'all'
    || (timelineFilter === 'contact' ? Boolean(item.contactData) : !item.contactData));
  const caseById = new Map(overview.cases.map((item) => [item.id, item]));
  const primary = overview.client.contacts.find((item) => item.isPrimary) ?? overview.client.contacts[0];
  const contact = overview.client.contacts.find((item) => item.id === form.contactId);
  const lawyer = overview.lawyers.find((item) => item.id === form.recipientUserId);
  const selectedCase = caseById.get(form.caseId);
  const representedCount = overview.cases.filter((item) => item.roles.includes('REPRESENTED')).length;
  const payerCount = overview.cases.filter((item) => item.roles.includes('PAYER')).length;

  return (
    <div className="space-y-5">
      {saved && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{saved}</div>}
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-start sm:justify-between sm:p-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-primary">Customer 360</p>
            <h2 className="mt-1 text-xl font-bold">ภาพรวมความสัมพันธ์</h2>
            <p className="mt-1 text-sm text-muted-foreground">ดูคดีทุกบทบาท งานที่ต้องทำ และการติดต่อของ {overview.client.name} ในที่เดียว</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => openLog()} disabled={!overview.cases.length || !overview.client.contacts.length || !overview.lawyers.length}>
              <Plus className="mr-1.5 h-4 w-4" />บันทึกการติดต่อ
            </Button>
            <Link href={`/cases/new?clientId=${encodeURIComponent(clientId)}`} className={buttonVariants({ variant: 'outline' })}>เปิด Case ใหม่</Link>
          </div>
        </div>
        <div className="grid grid-cols-2 border-t bg-muted/20 md:grid-cols-4">
          <div className="border-b p-4 md:border-b-0 md:border-r"><p className="text-xs text-muted-foreground">ผู้ติดต่อหลัก</p><p className="mt-1 font-semibold">{primary?.name ?? 'ยังไม่มี'}</p>{primary?.phone && <a className="text-xs text-primary hover:underline" href={`tel:${primary.phone}`}>{primary.phone}</a>}</div>
          <div className="border-b p-4 md:border-b-0 md:border-r"><p className="text-xs text-muted-foreground">เป็นลูกความ</p><p className="mt-1 text-lg font-bold">{representedCount} คดี</p></div>
          <div className="border-r p-4"><p className="text-xs text-muted-foreground">เป็นผู้ว่าจ้าง</p><p className="mt-1 text-lg font-bold">{payerCount} คดี</p></div>
          <div className="p-4"><p className="text-xs text-muted-foreground">งานที่ต้องทำ</p><p className="mt-1 text-lg font-bold">{overview.tasks.length} งาน</p></div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-5">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-widest text-primary">Next action</p><h3 className="mt-1 text-lg font-bold">ต้องทำต่อ</h3><p className="text-sm text-muted-foreground">งานค้างที่ผูกกับคดีของลูกค้ารายนี้</p></div><CalendarClock className="h-5 w-5 text-primary" /></div>
            {overview.tasks.length ? <div className="divide-y rounded-lg border">
              {overview.tasks.map((task) => <Link key={task.id} href={`/todos?task=${task.id}`} className="flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/50 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><p className="font-medium">{task.title}</p><p className="mt-0.5 text-xs text-muted-foreground">{caseById.get(task.caseId)?.ownRef} · {task.assignee ? personName(task.assignee) : 'ยังไม่มีผู้รับ'}</p></div>
                <span className={`shrink-0 text-xs font-medium ${task.dueDate && bangkokDateInputValue(task.dueDate) < bangkokDateInputValue(new Date()) ? 'text-destructive' : 'text-muted-foreground'}`}>{task.dueDate ? `กำหนด ${dateLabel(task.dueDate)}` : 'ยังไม่กำหนดวัน'} <ArrowRight className="ml-1 inline h-3 w-3" /></span>
              </Link>)}
            </div> : <InlineEmptyState title="ยังไม่มีงานค้าง" description="เมื่อมีงานติดตามจาก Case งานจะแสดงตรงนี้" />}
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Matters</p><h3 className="mt-1 text-lg font-bold">คดีที่เกี่ยวข้อง <span className="text-sm font-medium text-muted-foreground">{overview.cases.length}</span></h3><p className="text-sm text-muted-foreground">หนึ่ง Case แสดงครั้งเดียว แม้ลูกค้าจะมีหลายบทบาท</p></div>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div role="group" aria-label="กรองคดี" className="flex max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">
                {([['all', 'ทั้งหมด'], ['represented', 'ลูกความ'], ['payer', 'ผู้ว่าจ้าง'], ['closed', 'ปิดแล้ว']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={caseFilter === value} onClick={() => setCaseFilter(value)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${caseFilter === value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}
              </div>
              <label className="relative sm:w-56"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><span className="sr-only">ค้นหาคดี</span><Input className="pl-9" value={caseSearch} onChange={(event) => setCaseSearch(event.target.value)} placeholder="ชื่อคดี / เลขอ้างอิง" /></label>
            </div>
            {cases.length ? <div className="divide-y rounded-lg border">
              {cases.map((item) => <div key={item.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0"><Link href={`/cases/${item.id}`} className="font-semibold hover:text-primary hover:underline">{item.title}</Link><p className="mt-1 text-xs text-muted-foreground">{item.ownRef}{item.customerRef ? ` · Customer Ref: ${item.customerRef}` : ''}{item.policyRef ? ` · Policy Ref: ${item.policyRef}` : ''}</p><div className="mt-2 flex flex-wrap gap-1.5">{item.roles.includes('REPRESENTED') && <span className="rounded bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">ลูกความ</span>}{item.roles.includes('PAYER') && <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">ผู้ว่าจ้าง</span>}<span className="rounded bg-muted px-2 py-0.5 text-xs">{['CLOSED', 'ARCHIVED'].includes(item.status) ? 'ปิดแล้ว' : CASE_STAGE_LABELS_TH[item.stage as CaseStage] ?? item.stage}</span></div></div>
                <Button size="sm" variant="outline" className="shrink-0 self-start" onClick={() => openLog(item.id)}>บันทึกการติดต่อ</Button>
              </div>)}
            </div> : <InlineEmptyState icon={BriefcaseBusiness} title={overview.cases.length ? 'ไม่พบคดีที่ตรงกับตัวกรอง' : 'ยังไม่มี Case ของลูกค้ารายนี้'} description={overview.cases.length ? 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง' : 'เริ่มด้วยการเปิด Case ขั้นก่อนฟ้อง'} action={!overview.cases.length && <Link href={`/cases/new?clientId=${encodeURIComponent(clientId)}`} className={buttonVariants({ size: 'sm' })}>เปิด Case ใหม่</Link>} />}
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="mb-4"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Relationship history</p><h3 className="mt-1 text-lg font-bold">ประวัติความสัมพันธ์</h3><p className="text-sm text-muted-foreground">กิจกรรมจาก Case ที่คุณมีสิทธิ์ดู</p></div>
            <div role="group" aria-label="กรองประวัติ" className="mb-4 flex w-fit max-w-full gap-1 overflow-x-auto rounded-lg bg-muted p-1">{([['all', 'ทั้งหมด'], ['contact', 'การติดต่อ'], ['other', 'กิจกรรมคดี']] as const).map(([value, label]) => <button key={value} type="button" aria-pressed={timelineFilter === value} onClick={() => setTimelineFilter(value)} className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium ${timelineFilter === value ? 'bg-card text-primary shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{label}</button>)}</div>
            {activities.length ? <ol className="space-y-4 border-l pl-5">{activities.map((item) => <li key={item.id} className="relative before:absolute before:-left-[26px] before:top-1 before:h-2.5 before:w-2.5 before:rounded-full before:border-2 before:border-primary before:bg-card"><p className="text-xs text-muted-foreground">{dateLabel(item.activityAt)}{item.contactData ? ` · ${channelLabels[item.contactData.channel as LogClientContactPayload['channel']] ?? 'ติดต่อ'}` : ''}</p><p className="mt-1 font-semibold">{item.title}</p>{item.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}<Link href={`/cases/${item.caseId}`} className="mt-1 inline-block text-xs font-medium text-primary hover:underline">{caseById.get(item.caseId)?.ownRef} · {personName(item.createdBy)}</Link></li>)}</ol> : <InlineEmptyState title="ยังไม่มีกิจกรรมประเภทนี้" description="บันทึกการติดต่อแล้วประวัติจะปรากฏที่นี่" />}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="p-5"><h3 className="font-bold">ผู้ติดต่อ</h3><p className="mb-4 text-xs text-muted-foreground">คนที่ติดต่อในนามลูกค้ารายนี้</p><div className="divide-y">{overview.client.contacts.map((item) => <div key={item.id} className="py-3 first:pt-0"><p className="font-medium">{item.name}{item.isPrimary && <span className="ml-2 rounded bg-blue-50 px-2 py-0.5 text-xs text-blue-700">หลัก</span>}</p>{item.position && <p className="text-xs text-muted-foreground">{item.position}</p>}<div className="mt-2 flex gap-3 text-xs text-primary">{item.phone && <a href={`tel:${item.phone}`} className="inline-flex items-center gap-1 hover:underline"><Phone className="h-3 w-3" />โทร</a>}{item.email && <a href={`mailto:${item.email}`} className="inline-flex items-center gap-1 hover:underline"><Mail className="h-3 w-3" />อีเมล</a>}</div></div>)}</div>{!overview.client.contacts.length && <p className="text-sm text-muted-foreground">ยังไม่มีผู้ติดต่อ เพิ่มได้ในแท็บผู้ติดต่อ</p>}</Card>
          {overview.latestReport && onOpenReports && <Card className="p-5"><p className="text-xs font-semibold uppercase tracking-widest text-primary">Approved report</p><h3 className="mt-1 font-bold">รายงานประจำปี {overview.latestReport.year}</h3><p className="mt-1 text-xs text-muted-foreground">ฉบับล่าสุดที่เผยแพร่แล้ว · {dateLabel(overview.latestReport.publishedAt)}</p><Button variant="link" className="mt-3 h-auto p-0" onClick={onOpenReports}>เปิดรายงาน <ArrowRight className="ml-1 h-4 w-4" /></Button></Card>}
        </div>
      </div>

      <Modal open={showLog} onClose={() => !saving && setShowLog(false)} className="max-w-xl p-0" ariaLabel="บันทึกการติดต่อ">
        <form onSubmit={submitLog}>
          <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b bg-card px-5 py-4"><div><h3 className="text-lg font-bold">บันทึกการติดต่อ</h3><p className="mt-1 text-sm text-muted-foreground">บันทึกใน Case เดิมและหน้า Customer 360</p></div><button type="button" aria-label="ปิด" onClick={() => setShowLog(false)} className="rounded-md p-1 text-muted-foreground hover:bg-muted"><X className="h-5 w-5" /></button></div>
          <div className="space-y-4 px-5 py-5">
            <label className="block text-sm font-medium">Case ที่เกี่ยวข้อง <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.caseId} onChange={(event) => setForm({ ...form, caseId: event.target.value })}><option value="">เลือก Case</option>{overview.cases.map((item) => <option key={item.id} value={item.id}>{item.ownRef} · {item.title}</option>)}</select></label>
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-medium">ผู้ติดต่อจากลูกค้า <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.contactId} onChange={(event) => setForm({ ...form, contactId: event.target.value })}><option value="">เลือกผู้ติดต่อ</option>{overview.client.contacts.filter((item) => item.id).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="block text-sm font-medium">ช่องทาง<select className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.channel} onChange={(event) => setForm({ ...form, channel: event.target.value as LogClientContactPayload['channel'] })}>{Object.entries(channelLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>
            <label className="block text-sm font-medium">ลูกค้าต้องการติดต่อใคร <span className="text-destructive">*</span><select required className="mt-1.5 h-10 w-full rounded-md border bg-card px-3 text-sm" value={form.recipientUserId} onChange={(event) => setForm({ ...form, recipientUserId: event.target.value })}><option value="">เลือกทนาย</option>{overview.lawyers.map((item) => <option key={item.id} value={item.id}>{personName(item)}</option>)}</select></label>
            <fieldset><legend className="mb-2 text-sm font-medium">ลูกค้าได้ติดต่อทนายคนนั้นหรือไม่ <span className="text-destructive">*</span></legend><div className="grid gap-2 sm:grid-cols-2"><label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${form.reached === true ? 'border-primary bg-primary/5' : ''}`}><input required type="radio" name="reached" className="mt-1 accent-primary" checked={form.reached === true} onChange={() => { setForm({ ...form, reached: true }); setExtraTask(false); }} /><span><strong className="block">ได้คุยแล้ว</strong><span className="text-xs text-muted-foreground">บันทึกผลการสนทนา</span></span></label><label className={`flex cursor-pointer gap-2 rounded-lg border p-3 text-sm ${form.reached === false ? 'border-primary bg-primary/5' : ''}`}><input required type="radio" name="reached" className="mt-1 accent-primary" checked={form.reached === false} onChange={() => { setForm({ ...form, reached: false }); setExtraTask(false); }} /><span><strong className="block">ยังไม่ได้คุย</strong><span className="text-xs text-muted-foreground">เช่น ทนายไปศาลหรือไม่ว่าง</span></span></label></div></fieldset>
            <label className="block text-sm font-medium">{form.reached === false ? 'ข้อความที่ลูกค้าฝาก / เหตุที่ยังไม่ได้คุย' : 'ผลการคุย / ข้อความที่ฝากไว้'} <span className="text-destructive">*</span><textarea required maxLength={2000} rows={3} className="mt-1.5 w-full resize-y rounded-md border bg-card px-3 py-2 text-sm" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={form.reached === false ? 'เช่น ทนายไปศาล ลูกค้าขอให้โทรกลับเรื่องเอกสาร' : 'สรุปสิ่งที่คุยหรือข้อความที่ฝากไว้'} /></label>
            {form.reached === false && <div role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900"><strong className="block">สร้างงานโทรกลับอัตโนมัติ</strong><span className="mt-1 block text-xs">มอบหมายให้ {lawyer ? personName(lawyer) : 'ทนายที่เลือก'} {form.channel === 'INBOUND_CALL' ? 'โทรกลับ' : 'ติดต่อกลับ'} {contact?.name ?? 'ผู้ติดต่อที่เลือก'}{contact?.phone ? ` (${contact.phone})` : ''} วันนี้ · {selectedCase?.ownRef ?? 'Case ที่เลือก'}</span></div>}
            {form.reached === true && <div className="space-y-3"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={extraTask} onChange={(event) => setExtraTask(event.target.checked)} />มีงานอื่นที่ต้องติดตามต่อ</label>{extraTask && <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">สิ่งที่ต้องทำ<Input required maxLength={200} className="mt-1" value={form.followupTitle ?? ''} onChange={(event) => setForm({ ...form, followupTitle: event.target.value })} placeholder="เช่น ขอเอกสารเพิ่ม" /></label><label className="text-sm">กำหนดวัน<Input required type="date" className="mt-1" value={form.followupDueDate ?? ''} onChange={(event) => setForm({ ...form, followupDueDate: event.target.value })} /></label><p className="text-xs text-muted-foreground sm:col-span-2">งานจะมอบหมายให้ทนายที่ลูกค้าติดต่อ</p></div>}</div>}
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
          </div>
          <div className="sticky bottom-0 z-10 flex justify-end gap-2 border-t bg-card px-5 py-4"><Button type="button" variant="outline" onClick={() => setShowLog(false)} disabled={saving}>ยกเลิก</Button><Button type="submit" disabled={saving || form.reached === null}>{saving ? 'กำลังบันทึก…' : form.reached === false ? 'บันทึกและสร้างงานโทรกลับ' : 'บันทึกการติดต่อ'}</Button></div>
        </form>
      </Modal>
    </div>
  );
}
