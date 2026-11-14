'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, CheckCircle2, ClipboardList, Clock, Download, FileSpreadsheet, Gavel, Lock, Receipt, UploadCloud, UserPlus, Users, type LucideIcon } from 'lucide-react';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type ImportBatch, type ImportKind, type ImportPreview } from '@/lib/api';
import { checkImportFile, filterImportRows, importCounts, mergeImportProblems } from '@/lib/data-import';

const icons: Record<ImportKind, LucideIcon> = { clients: Users, cases: Gavel, tasks: ClipboardList, events: CalendarDays, expenses: Receipt, 'time-entries': Clock, members: UserPlus };
const labels: Record<ImportKind, string> = { clients: 'ลูกความ', cases: 'คดี', tasks: 'งาน', events: 'นัดหมาย', expenses: 'ค่าใช้จ่าย', 'time-entries': 'บันทึกเวลา', members: 'สมาชิกทีม' };
const destinations: Record<ImportKind, string> = { clients: '/clients', cases: '/cases', tasks: '/todos', events: '/calendar', expenses: '/expenses', 'time-entries': '/timesheet', members: '/settings' };
type Kind = { kind: ImportKind; label: string; allowed: boolean };
const card = 'rounded-lg border bg-card p-5';
const chip = 'shrink-0 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium';

export default function DataImportPage() {
  const { token } = useAuth();
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [kind, setKind] = useState<ImportKind | null>(null);
  const [history, setHistory] = useState<ImportBatch[] | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [fileName, setFileName] = useState('');
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [done, setDone] = useState<{ kind: ImportKind; created: number } | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const refreshHistory = (accessToken: string) => api.getDataImportBatches(accessToken).then(({ batches }) => { setHistory(batches); setHistoryError(''); }).catch(() => setHistoryError('โหลดประวัติไม่สำเร็จ'));

  useEffect(() => {
    if (!token) return;
    api.getDataImportKinds(token).then(({ kinds: list }) => {
      setKinds(list);
      const requested = new URLSearchParams(window.location.search).get('kind');
      setKind(list.find((item) => item.kind === requested && item.allowed)?.kind ?? list.find((item) => item.allowed)?.kind ?? null);
    }).catch((e) => setError(e instanceof ApiError ? e.message : 'โหลดประเภทข้อมูลไม่สำเร็จ'));
    void refreshHistory(token);
  }, [token]);

  const selectKind = (next: ImportKind) => {
    setKind(next); setPreview(null); setDone(null); setError('');
    const url = new URL(window.location.href); url.searchParams.set('kind', next); window.history.replaceState(null, '', url);
  };
  const download = async () => {
    if (!token || !kind) return;
    setBusy('template'); setError('');
    try {
      const blob = await api.downloadDataImportTemplate(token, kind);
      const url = URL.createObjectURL(blob); const a = document.createElement('a');
      a.href = url; a.download = `samnuan-import-${kind}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'ดาวน์โหลดแบบฟอร์มไม่สำเร็จ'); }
    finally { setBusy(''); }
  };
  const upload = async (file?: File) => {
    if (!file || !token || !kind || busy) return;
    const issue = checkImportFile(file);
    if (issue) { setError(issue); return; }
    setBusy('preview'); setError('');
    try {
      const result = await api.previewDataImport(token, kind, file);
      setPreview(result); setFileName(file.name); setProblemsOnly(result.problemRows > 0); setDone(null);
    } catch (e) { setError(e instanceof ApiError ? e.message : 'อ่านไฟล์ไม่สำเร็จ กรุณาลองใหม่'); }
    finally { setBusy(''); }
  };
  const commit = async () => {
    if (!token || !preview || busy) return;
    setBusy('commit'); setError('');
    try {
      const result = await api.commitDataImport(token, preview.batchId);
      setDone(result); setPreview(null); void refreshHistory(token);
    } catch (e) {
      const body = e instanceof ApiError && e.status === 409 ? e.body as { rows?: { rowNumber: number; problems: string[] }[] } : null;
      if (Array.isArray(body?.rows)) {
        setPreview((current) => current ? { ...current, rows: mergeImportProblems(current.rows, body.rows!), canCommit: false } : current);
        setProblemsOnly(true);
      } else setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่');
    } finally { setBusy(''); }
  };
  const counts = preview ? importCounts(preview.rows) : { ready: 0, problems: 0 };
  const label = (value: ImportKind) => kinds.find((item) => item.kind === value)?.label ?? labels[value];
  return (
    <div className="min-w-0 space-y-6 pb-24">
      <PageHeader title="นำเข้าข้อมูลจาก Excel" description="ย้ายข้อมูลจากระบบเดิมเข้าสำนวน: ดาวน์โหลดแบบฟอร์ม กรอก แล้วอัปโหลดกลับ ระบบตรวจทุกแถวก่อนบันทึก" />
      <div className="overflow-x-auto rounded-lg bg-muted p-1" aria-label="ประเภทข้อมูล">
        <div className="flex min-w-max gap-1" aria-busy={kinds.length === 0 && !error}>{kinds.length === 0 && !error && Array.from({ length: 7 }, (_, i) => <div key={i} className="min-h-11 min-w-28 flex-1 animate-pulse rounded-md bg-card/60 motion-reduce:animate-none" />)}{kinds.map((item) => {
          const Icon = icons[item.kind];
          return <button key={item.kind} type="button" disabled={!item.allowed || !!busy} title={!item.allowed ? 'ไม่มีสิทธิ์นำเข้าข้อมูลประเภทนี้' : undefined} aria-pressed={kind === item.kind} onClick={() => selectKind(item.kind)} className={`flex min-h-11 flex-1 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sm font-semibold disabled:opacity-50 ${kind === item.kind ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:bg-card/50'}`}><Icon className="h-4 w-4 shrink-0" />{item.label}{!item.allowed && <Lock className="h-4 w-4 shrink-0" />}</button>;
        })}</div>
      </div>
      <input ref={input} type="file" accept=".xlsx" className="sr-only" tabIndex={-1} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} />
      {done ? <section className={`${card} text-center`} role="status"><CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" /><h2 className="mt-3 text-xl font-semibold">บันทึกแล้ว {done.created} รายการ</h2>{done.kind === 'members' && <p className="mt-2">ส่งคำเชิญทางอีเมลแล้ว</p>}<div className="mt-4 flex flex-wrap justify-center gap-3"><Link href={destinations[done.kind]} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap text-sm font-semibold text-primary underline">ไปยังข้อมูล{label(done.kind)}</Link><Button className="shrink-0 whitespace-nowrap" onClick={() => { setDone(null); setError(''); }}>นำเข้าไฟล์อื่น</Button></div></section> : preview ? <>
        <section className={`${card} flex flex-wrap items-center justify-between gap-4`}>
          <div className="flex min-w-0 items-center gap-3"><FileSpreadsheet className="h-8 w-8 shrink-0 text-primary" /><div className="min-w-0"><p className="break-all font-semibold">{fileName}</p><p className="text-sm text-muted-foreground">ทั้งหมด {preview.total} แถว</p></div></div>
          <div className="flex flex-wrap items-center gap-3"><span className={`${chip} bg-emerald-50 text-emerald-700`}>พร้อมบันทึก {counts.ready}</span>{counts.problems > 0 && <span className={`${chip} bg-destructive/10 text-destructive`}>ต้องแก้ {counts.problems}</span>}<div className="shrink-0 text-center"><Button variant="outline" className="shrink-0 whitespace-nowrap" disabled={!!busy} onClick={() => input.current?.click()}>{busy === 'preview' ? 'กำลังตรวจ…' : 'อัปโหลดไฟล์ใหม่'}</Button><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">แก้ในไฟล์แล้วอัปโหลดอีกครั้ง</p></div></div>
        </section>
        {counts.problems > 0 && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">ยังบันทึกไม่ได้ — มี {counts.problems} แถวที่ต้องแก้ ระบบบันทึกแบบทั้งหมดหรือไม่บันทึกเลย จึงยังไม่มีข้อมูลใดถูกบันทึก</div>}
        {error && <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
        <div className="flex w-fit max-w-full overflow-x-auto rounded-lg bg-muted p-1">{[false, true].map((only) => <button key={String(only)} type="button" aria-pressed={problemsOnly === only} onClick={() => setProblemsOnly(only)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-md px-4 text-sm font-semibold ${problemsOnly === only ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}>{only ? `เฉพาะแถวที่ต้องแก้ (${counts.problems})` : `ทุกแถว (${preview.total})`}</button>)}</div>
        <div className="max-h-[60vh] overflow-auto rounded-lg border bg-card"><table className="w-full text-left text-sm"><thead className="sticky top-0 z-10 bg-muted text-muted-foreground"><tr><th className="whitespace-nowrap p-3">แถว</th><th className="whitespace-nowrap p-3">ปัญหา</th>{preview.columns.map((column) => <th key={column.key} className="whitespace-nowrap p-3">{column.label}</th>)}</tr></thead><tbody>{filterImportRows(preview.rows, problemsOnly).map((row) => <tr key={row.rowNumber} className={`border-t ${row.problems.length ? 'border-l-4 border-l-destructive bg-destructive/5' : ''}`}><td className="p-3">{row.rowNumber}</td><td className="min-w-64 p-3 align-top">{row.problems.length ? <ul className="list-disc pl-4 text-destructive">{row.problems.map((problem, i) => <li key={i}>{problem}</li>)}</ul> : <span className="inline-flex items-center gap-1 whitespace-nowrap text-emerald-700"><Check className="h-4 w-4" />ผ่าน</span>}</td>{preview.columns.map((column) => <td key={column.key} className="min-w-36 p-3">{row.cells[column.key] || '—'}</td>)}</tr>)}</tbody></table></div>
        <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm md:pr-36"><p className="whitespace-nowrap text-sm font-semibold">บันทึกครั้งเดียวทั้ง {preview.total} แถว</p><div className="flex flex-wrap items-start gap-2"><Button variant="ghost" className="shrink-0 whitespace-nowrap" disabled={!!busy} onClick={() => { setPreview(null); setError(''); }}>ยกเลิก</Button><div className="shrink-0 text-center"><Button className="shrink-0 whitespace-nowrap" disabled={!!busy || counts.problems > 0 || !preview.canCommit} onClick={commit}>{busy === 'commit' ? 'กำลังบันทึก…' : 'บันทึกทั้งหมด'}</Button><p className="mt-1 whitespace-nowrap text-xs text-muted-foreground">{counts.problems > 0 ? `แก้ ${counts.problems} แถวก่อน จึงจะกดได้` : 'ข้อมูลทั้งหมดจะถูกบันทึกพร้อมกัน'}</p></div></div></div>
      </> : <div className="grid gap-4 lg:grid-cols-3">
        <section className={`${card} flex flex-col gap-4`}><span className={`${chip} w-fit bg-muted`}>ขั้นตอนที่ 1</span><h2 className="text-lg font-semibold">ดาวน์โหลดแบบฟอร์ม</h2><p className="text-sm text-muted-foreground">ดาวน์โหลดแบบฟอร์มสำหรับข้อมูลที่เลือก</p><div className="mt-auto"><Button className="w-full shrink-0 whitespace-nowrap" disabled={!kind || !!busy} onClick={download}><Download className="h-4 w-4" />{busy === 'template' ? 'กำลังดาวน์โหลด…' : 'ดาวน์โหลดแบบฟอร์ม'}</Button><p className="mt-2 text-center text-xs text-muted-foreground">ไฟล์ภาษาไทย กรอกได้สูงสุด 300 แถว</p></div></section>
        <section className={`${card} flex flex-col gap-4`}><span className={`${chip} w-fit bg-muted`}>ขั้นตอนที่ 2</span><h2 className="text-lg font-semibold">กรอกข้อมูล</h2><ul className="space-y-3 text-sm">{['คอลัมน์ที่มี * ต้องกรอก', 'วันที่ใช้ วว/ดด/ปปปป (พ.ศ. หรือ ค.ศ.)', 'ห้ามเปลี่ยนชื่อคอลัมน์ในแถวแรก'].map((text) => <li key={text} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-primary" />{text}</li>)}</ul></section>
        <section className={`${card} flex flex-col gap-4 border-primary shadow-sm`}><span className={`${chip} w-fit bg-primary/10 text-primary`}>ขั้นตอนที่ 3</span><h2 className="text-lg font-semibold">อัปโหลดเพื่อตรวจ</h2><div className="mt-auto rounded-lg border-2 border-dashed p-4 text-center" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void upload(e.dataTransfer.files[0]); }}><UploadCloud className="mx-auto mb-2 h-7 w-7 text-primary" /><Button variant="outline" className="shrink-0 whitespace-nowrap" disabled={!kind || !!busy} onClick={() => input.current?.click()}>{busy === 'preview' ? 'กำลังตรวจ…' : 'ลากไฟล์มาวาง หรือ เลือกไฟล์'}</Button><p className="mt-2 text-xs text-muted-foreground">เฉพาะ .xlsx ไม่เกิน 2 MB · ยังไม่บันทึกจนกว่าจะกดยืนยัน</p></div>{error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}</section>
      </div>}
      <section className="overflow-hidden rounded-lg border bg-card"><h2 className="border-b p-4 font-semibold">ประวัติการนำเข้าล่าสุด</h2>{historyError ? <p className="p-4 text-sm text-destructive">{historyError}</p> : history === null ? <p className="p-4 text-sm text-muted-foreground">กำลังโหลด…</p> : history.length === 0 ? <p className="p-4 text-sm text-muted-foreground">ยังไม่มีการนำเข้า</p> : <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/50 text-muted-foreground"><tr>{['วันที่', 'ประเภท', 'จำนวนแถว', 'ผู้นำเข้า', 'สถานะ'].map((heading) => <th key={heading} className="whitespace-nowrap p-3">{heading}</th>)}</tr></thead><tbody>{history.map((batch) => <tr key={batch.id} className="border-t"><td className="whitespace-nowrap p-3">{new Date(batch.committedAt).toLocaleString('th-TH', { dateStyle: 'medium', timeStyle: 'short' })}</td><td className="whitespace-nowrap p-3">{label(batch.kind)}</td><td className="p-3">{batch.total}</td><td className="whitespace-nowrap p-3">{batch.createdBy.firstName} {batch.createdBy.lastName}</td><td className="p-3"><span className={`${chip} bg-emerald-50 text-emerald-700`}>บันทึกแล้ว</span></td></tr>)}</tbody></table></div>}</section>
    </div>
  );
}
