'use client';
/* Hallmark · genre: modern-minimal · macrostructure: Workbench · design-system: design.md · designed-as-app */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Check } from 'lucide-react';
import { FirmRole, hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useLocale } from '@/components/landing/LocaleProvider';
import { ImportPreview, parseImportCsv, setupChecks, setupRequest, SetupProgress } from '@/lib/practice-setup';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Step = { title: string; hint: string; href: string; action: string; done: boolean };

/**
 * Where a new owner or office manager starts: finish the three setup records,
 * then learn the short routine that runs the office each day.
 */
export default function GettingStarted() {
  const { user, token } = useAuth(); const { locale } = useLocale(); const th = locale === 'th';
  const [progress, setProgress] = useState<SetupProgress | null>(null); const [csv, setCsv] = useState('clientName,caseRef,caseTitle\n'); const [preview, setPreview] = useState<ImportPreview | null>(null); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const load = async () => { if (token) setProgress(await setupRequest(token, '/progress')); };
  useEffect(() => { if (token && hasFirmCapability(user?.firmRole, 'manageFirmContent')) load().catch(e => setError(e.message)); }, [token, user?.firmRole]);
  async function run(fn: () => Promise<void>) { setBusy(true); setError(''); setNotice(''); try { await fn(); } catch(e) { setError(e instanceof Error ? e.message : 'Failed'); } finally { setBusy(false); } }

  if (!hasFirmCapability(user?.firmRole, 'manageFirmContent')) {
    return <div className="mx-auto max-w-3xl">
      <PageHeader title={th ? 'เริ่มต้นใช้งาน' : 'Getting started'} description={th ? 'หน้านี้สำหรับเจ้าของหรือผู้ดูแลสำนักงาน ถ้าคุณต้องดูแลทั้งสำนักงาน ให้เจ้าของเปลี่ยนบทบาทของคุณเป็น "ผู้จัดการสำนักงาน" ที่หน้าจัดการทีม' : 'This page is for the owner or office manager. If you run the office, ask the owner to change your role to "Office manager" on the Team page.'} />
      <Link href="/dashboard" className={cn(buttonVariants({ variant: 'outline' }), 'min-h-11')}>{th ? 'ไปที่งานของฉัน' : 'Go to my work'}</Link>
    </div>;
  }

  const checks = progress && setupChecks(progress);
  const steps: Step[] = progress && checks ? [
    { title: th ? 'ทีมงาน' : 'Team', hint: th ? `สมาชิก ${progress.members} คน · คำเชิญรอตอบ ${progress.invites}` : `${progress.members} members · ${progress.invites} pending invitations`, href: '/team', action: th ? 'เชิญทีม' : 'Invite team', done: checks.team },
    { title: th ? 'ลูกความ' : 'Clients', hint: th ? `${progress.clients} ราย · เพิ่มทีละรายหรือนำเข้าจาก CSV ด้านล่าง` : `${progress.clients} on file · add one or import a CSV below`, href: '/clients/new', action: th ? 'เพิ่มลูกความ' : 'Add client', done: checks.clients },
    { title: th ? 'คดีแรก' : 'First case', hint: th ? `${progress.cases} คดี · เปิดคดีแล้วเลือกทนายผู้รับผิดชอบ` : `${progress.cases} cases · open one and choose its owner`, href: '/cases/new', action: th ? 'เปิดคดี' : 'Open case', done: checks.cases },
  ] : [];
  const next = steps.find(s => !s.done);
  const doneCount = steps.filter(s => s.done).length;

  // Routine links go to real pages; nothing here is counted or scored.
  const routine = [
    { when: th ? 'ทุกเช้า' : 'Every morning', items: [
      { href: '/operations', label: th ? 'ภาระงานทีม → ต้องจัดการวันนี้' : 'Operations → Today', what: th ? 'มอบงานที่ยังไม่มีคนรับ และกดตามงานที่เลยกำหนด' : 'Assign unclaimed work and nudge overdue tasks' },
      { href: '/court-schedule', label: th ? 'ตารางศาล' : 'Court schedule', what: th ? 'เช็กว่าใครไปศาลไหน และไม่มีนัดซ้อน' : 'Check who is in court and that nothing overlaps' },
    ] },
    { when: th ? 'ระหว่างวัน' : 'During the day', items: [
      { href: '/cases', label: th ? 'เรื่องและคดี' : 'Matters & cases', what: th ? 'รับเรื่องใหม่ เปิดคดี และเลือกผู้รับผิดชอบ' : 'Receive new matters, open cases, choose owners' },
      { href: '/leaves', label: th ? 'การลา' : 'Leave', what: th ? 'อนุมัติใบลา ก่อนจัดคนไปนัด' : 'Approve leave before staffing hearings' },
    ] },
    { when: th ? 'ทุกสัปดาห์' : 'Every week', items: [
      { href: '/expenses', label: th ? 'ค่าใช้จ่าย' : 'Expenses', what: user?.firmRole === FirmRole.OWNER ? (th ? 'ตรวจหลักฐานและอนุมัติการเบิก' : 'Check receipts and approve claims') : (th ? 'ตรวจหลักฐานการเบิก — เจ้าของเป็นผู้อนุมัติ' : 'Check receipts — the owner approves claims') },
      { href: '/invoices', label: th ? 'ใบแจ้งหนี้' : 'Invoices', what: th ? 'ติดตามใบแจ้งหนี้ที่ค้างชำระ' : 'Follow up unpaid invoices' },
      { href: '/operations', label: th ? 'ภาระงานทีม → สุขภาพคดี' : 'Operations → Case health', what: th ? 'ดูคดีที่นิ่งนานหรือติดขัด' : 'Spot quiet or stuck cases' },
    ] },
  ];

  return <div className="mx-auto max-w-4xl space-y-10">
    <PageHeader title={th ? 'เริ่มต้นใช้งานสำนักงาน' : 'Getting started'} description={th ? 'สำหรับเจ้าของและผู้ดูแลสำนักงาน: ตั้งค่า 3 อย่างครั้งเดียว แล้วใช้ "ภาระงานทีม" เป็นหน้าทำงานทุกวัน' : 'For owners and office managers: set up three things once, then run each day from Operations.'} />
    {error && <p role="alert" className="text-destructive">{error}</p>}{notice && <p role="status" className="rounded-lg bg-muted p-3">{notice}</p>}

    {progress && <section aria-labelledby="setup-heading" className="space-y-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-heading" className="text-lg font-semibold">{th ? '1. ตั้งค่าครั้งแรก' : '1. One-time setup'}</h2>
        <p className="text-sm text-muted-foreground">{th ? `เสร็จแล้ว ${doneCount} จาก ${steps.length}` : `${doneCount} of ${steps.length} done`}</p>
      </div>
      <ol className="divide-y rounded-lg border bg-card">
        {steps.map((s, i) => <li key={s.href} className={cn('grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 p-4 sm:flex sm:items-center', s === next && 'bg-muted/40')}>
          <span aria-hidden className={cn('flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold', s.done ? 'border-primary bg-primary text-primary-foreground' : 'text-muted-foreground')}>{s.done ? <Check className="size-4" /> : i + 1}</span>
          <div className="min-w-0 flex-1">
            <p className="font-medium">{s.title} <span className="text-sm font-normal text-muted-foreground">· {s.done ? (th ? 'เสร็จแล้ว' : 'Done') : s === next ? (th ? 'ทำต่อขั้นนี้' : 'Do this next') : (th ? 'ยังไม่เริ่ม' : 'Not started')}</span></p>
            <p className="mt-0.5 text-sm text-muted-foreground">{s.hint}</p>
          </div>
          <Link href={s.href} className={cn(buttonVariants({ variant: s === next ? 'default' : 'outline', size: 'sm' }), 'col-start-2 min-h-11 shrink-0 justify-self-start whitespace-nowrap')}>{s.action}</Link>
        </li>)}
      </ol>
      {!next && <div className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm">{th ? 'ตั้งค่าครบแล้ว หน้าทำงานประจำของคุณคือ "ภาระงานทีม"' : 'Setup is complete. Your daily screen is Operations.'}</p>
        <Link href="/operations" className={cn(buttonVariants(), 'min-h-11 shrink-0 whitespace-nowrap')}>{th ? 'เปิดภาระงานทีม' : 'Open Operations'}</Link>
      </div>}
    </section>}

    <section aria-labelledby="routine-heading" className="space-y-4">
      <div>
        <h2 id="routine-heading" className="text-lg font-semibold">{th ? '2. งานประจำของผู้ดูแลสำนักงาน' : '2. The office manager’s routine'}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{th ? 'ทำตามลำดับนี้ทุกวัน ไม่ต้องเปิดทุกเมนู' : 'Follow this order; you don’t need every menu.'}</p>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {routine.map(group => <div key={group.when} className="min-w-0 rounded-lg border bg-card">
          <h3 className="border-b px-4 py-3 text-sm font-semibold">{group.when}</h3>
          <ul className="divide-y">
            {group.items.map(item => <li key={item.label}>
              <Link href={item.href} className="block min-h-11 px-4 py-3 hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset">
                <span className="block text-sm font-medium text-primary">{item.label}</span>
                <span className="mt-0.5 block text-sm text-muted-foreground">{item.what}</span>
              </Link>
            </li>)}
          </ul>
        </div>)}
      </div>
    </section>

    <details className="group rounded-lg border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-3 p-4 font-medium sm:px-6">
        <span>{th ? 'มีรายชื่อลูกความหรือคดีเดิมใน Excel? นำเข้าจาก CSV' : 'Have clients or cases in Excel? Import a CSV'}</span>
        <span aria-hidden className="text-muted-foreground transition-transform group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-4 border-t p-4 sm:p-6">
        <p className="text-sm text-muted-foreground">{th ? 'ไม่เกิน 200 แถว ชื่อลูกความเดิมจะใช้รายเดิม เลขคดีซ้ำจะหยุดให้แก้ไข ถ้าต้องการเพิ่มเฉพาะลูกความ เว้นสองช่องคดีว่างได้' : 'Up to 200 rows. Existing client names are reused; duplicate case references must be corrected. Leave both case columns blank to import clients only.'}</p>
        <Button variant="outline" onClick={() => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿clientName,caseRef,caseTitle\nตัวอย่างลูกความ,DEMO-001,ตัวอย่างชื่อคดี\n'], { type: 'text/csv;charset=utf-8' })); a.download = 'samnuan-import-template.csv'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); }}>{th ? 'ดาวน์โหลดตัวอย่าง CSV' : 'Download CSV template'}</Button>
        <label className="block text-sm">{th ? 'เลือกไฟล์ CSV (UTF-8)' : 'Choose a CSV file (UTF-8)'}<Input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 1024 * 1024) { setError(th ? 'ไฟล์ใหญ่เกิน 1 MB' : 'File exceeds 1 MB'); return; } file.text().then(text => { setCsv(text); setPreview(null); }); }} /></label>
        <label className="block text-sm">{th ? 'ตรวจหรือแก้ไขข้อมูลก่อนนำเข้า' : 'Review or edit before importing'}<textarea spellCheck={false} value={csv} onChange={e => { setCsv(e.target.value); setPreview(null); }} className="mt-1 min-h-36 w-full rounded-lg border bg-background p-3 font-mono text-sm" /></label>
        <Button className="min-h-11" disabled={busy} onClick={() => token && run(async () => { setPreview(await setupRequest<ImportPreview>(token, '/imports/preview', { rows: parseImportCsv(csv) })); })}>{th ? 'ตรวจตัวอย่างก่อนบันทึก' : 'Preview before importing'}</Button>
        {preview && <div className="space-y-3"><h3 className="font-medium">{th ? `ตัวอย่าง ${preview.rows.length} แถว` : `${preview.rows.length} preview rows`}</h3><ol className="max-h-96 space-y-2 overflow-y-auto">{preview.rows.map(r => <li key={r.row} className="rounded-lg border p-3 text-sm"><strong>{r.row}. {r.clientName || '—'}</strong><p className="break-words">{r.caseRef} · {r.caseTitle}</p><p className="text-xs text-muted-foreground">{r.existingClientId ? (th ? 'ใช้ลูกความเดิม' : 'Reuse existing client') : (th ? 'เพิ่มลูกความใหม่ (ชื่อซ้ำในชุดเดียวกันรวมเป็นรายเดียว)' : 'Create client; matching names in this batch share one record')}</p>{r.errors.map(e => <p key={e} className="text-destructive">{e}</p>)}</li>)}</ol><Button disabled={busy || !preview.canCommit} className="min-h-11" onClick={() => token && run(async () => { await setupRequest(token, `/imports/${preview.id}/commit`, {}); setPreview(null); setNotice(th ? 'นำเข้าแล้ว ตรวจข้อมูลได้ที่ลูกความและคดี' : 'Imported. View records in Clients and Cases.'); await load(); })}>{th ? 'ยืนยันนำเข้าข้อมูลชุดนี้' : 'Confirm this import'}</Button></div>}
        {!!progress?.batches.length && <div className="space-y-3 border-t pt-4"><h3 className="font-medium">{th ? 'ประวัติการนำเข้า' : 'Import history'}</h3><p className="text-sm text-muted-foreground">{th ? 'ยกเลิกได้เฉพาะข้อมูลที่ชุดนี้สร้างและยังไม่ถูกแก้ไขหรือใช้ต่อ ระบบจะไม่ลบข้อมูลชุดอื่น' : 'Undo removes only records created by that batch, if unchanged and unused.'}</p>{progress.batches.map(b => <div key={b.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"><p className="text-sm">{new Date(b.createdAt).toLocaleString(th ? 'th-TH' : 'en-GB')} · {b.status}</p>{b.status === 'COMMITTED' && <Button variant="outline" disabled={busy} onClick={() => { if (!confirm(th ? 'ยกเลิกข้อมูลที่นำเข้าจากชุดนี้?' : 'Undo the records created by this batch?')) return; if (token) run(async () => { await setupRequest(token, `/imports/${b.id}/undo`, {}); setNotice(th ? 'ยกเลิกชุดนำเข้าแล้ว' : 'Import undone'); await load(); }); }}>{th ? 'ยกเลิกชุดนำเข้านี้' : 'Undo this batch'}</Button>}</div>)}</div>}
      </div>
    </details>

    <Link href="/playbooks" className="inline-flex min-h-11 items-center text-primary underline">{th ? 'ไม่บังคับ: จัดขั้นตอนงานด้วย Playbook →' : 'Optional: set up workflow playbooks →'}</Link>
  </div>;
}
