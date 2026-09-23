'use client';

import { useEffect, useRef, useState } from 'react';
import { api, IntakePrecedentAnalysisItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import type { CaseDetail } from '@/lib/api';

const FIELD_LABELS: Record<string, string> = { courtName: 'ศาล', blackCaseNumber: 'หมายเลขคดีดำ', redCaseNumber: 'หมายเลขคดีแดง', claimedAmount: 'ทุนทรัพย์', chargeSection: 'ข้อหาหรือฐานความผิด' };

export function CaseSummaryPanel({ caseId, onChanged }: { caseId: string; onChanged?: () => void }) {
  const { token } = useAuth();
  const [result, setResult] = useState<IntakePrecedentAnalysisItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const [current, setCurrent] = useState<CaseDetail | null>(null);
  const [applied, setApplied] = useState<string[]>([]);
  const [applying, setApplying] = useState('');
  const valueFor = (c: CaseDetail | null, field: string): unknown => field === 'chargeSection' ? c?.customFields?.chargeSection : c?.[field as keyof CaseDetail];
  const hasValue = (value: unknown) => value != null && String(value).trim() !== '';
  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    Promise.all([api.listCasePrecedentAnalyses(token, caseId), api.getCase(token, caseId)])
      .then(([rows, c]) => { if (active) { setCurrent(c); setResult(rows.find(row => row.status === 'COMPLETE' && row.extractedFacts?.caseSummary) ?? rows.find(row => row.status === 'COMPLETE' && row.documentSummary) ?? null); } })
      .catch(() => { if (active) setError('โหลดสรุปไม่สำเร็จ กรุณาลองโหลดหน้าใหม่'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, caseId]);
  const summarize = async () => {
    if (!token || lock.current) return;
    lock.current = true; setBusy(true); setError('');
    try { setResult(await api.summarizeCase(token, caseId)); setApplied([]); setCurrent(await api.getCase(token, caseId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'สรุปไม่สำเร็จ ผลเดิมยังอยู่'); }
    finally { lock.current = false; setBusy(false); }
  };
  const apply = async (key: string, field?: string, value?: string, taskId?: string) => {
    if (!token || lock.current) return;
    lock.current = true; setApplying(key); setError('');
    try {
      const latest = await api.getCase(token, caseId);
      setCurrent(latest);
      if (taskId) {
        const task = latest.tasks.find(t => t.id === taskId);
        if (!task) throw new Error('ไม่พบงานนี้ในคดีแล้ว กรุณาสรุปใหม่');
        if (task.status !== 'DONE') await api.updateTask(token, caseId, taskId, { status: 'DONE' });
      } else if (field && value && FIELD_LABELS[field]) {
        if (hasValue(valueFor(latest, field))) throw new Error('ช่องนี้มีข้อมูลแล้ว กรุณาตรวจและแก้ไขจากข้อมูลคดี เพื่อไม่ทับข้อมูลเดิม');
        const data: Record<string, unknown> = field === 'chargeSection' ? { customFields: { ...latest.customFields, chargeSection: value } } : { [field]: field === 'claimedAmount' ? Number(value.replace(/,/g, '')) : value };
        if (field === 'claimedAmount' && (!Number.isFinite(data[field]) || Number(data[field]) < 0)) throw new Error('ทุนทรัพย์ไม่ใช่จำนวนเงินที่ถูกต้อง กรุณาตรวจต้นฉบับ');
        await api.updateCase(token, caseId, data);
      } else return;
      setApplied(prev => [...prev, key]);
      onChanged?.();
      setCurrent(await api.getCase(token, caseId));
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ กรุณาลองใหม่'); }
    finally { lock.current = false; setApplying(''); }
  };
  return <section aria-label="สรุปคดีด้วย AI" className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">สรุปคดีด้วย AI</h2><Button disabled={loading || busy || !!applying} onClick={() => void summarize()}>{busy ? 'กำลังสรุปและค้นฎีกา…' : 'สรุปข้อมูลคดีล่าสุด · 5 เครดิต'}</Button></div>
    <p className="text-sm text-muted-foreground">สรุปข้อมูลคดีและเอกสาร พร้อมค้นหาฎีกาที่เกี่ยวข้องจากข้อเท็จจริงล่าสุด</p>
    {loading && <p role="status">กำลังโหลดสรุป…</p>}
    {busy && <p role="status">กำลังสรุปคดีและค้นหาฎีกาที่เกี่ยวข้อง</p>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result && <>
      <p className="text-xs text-muted-foreground">{result.extractedFacts?.caseSummary ? 'สรุปคดี' : 'ผลวิเคราะห์เดิม — ยังไม่ใช่สรุปทั้งคดี'} · {new Date(result.createdAt).toLocaleString('th-TH')} · ข้อมูลเปลี่ยนแล้วให้กดสรุปใหม่</p>
      {!!result.extractedFacts?.attachmentWarnings?.length && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"><p className="font-medium">ข้อมูลที่อ่านไม่ครบ</p>{result.extractedFacts.attachmentWarnings.map((warning, index) => <p key={index}>{warning}</p>)}</div>}
      <h3 className="text-sm font-semibold">ประเด็นสำคัญ</h3>
      <ol className="list-decimal space-y-2 pl-5 text-sm leading-relaxed">{(result.factsList?.length ? result.factsList : result.documentSummary?.split(/\n+/).filter(Boolean) ?? []).map((point, index) => <li key={index} className="whitespace-pre-wrap break-words">{point}</li>)}</ol>
      <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
        <h3 className="text-sm font-semibold">ฎีกาที่เกี่ยวข้อง</h3>
        {result.extractedFacts?.precedentWarning && <p role="status" className="text-sm text-amber-800">{result.extractedFacts.precedentWarning}</p>}
        {result.summaryBullets && <p className="whitespace-pre-wrap text-sm leading-relaxed">{result.summaryBullets}</p>}
        {result.precedents.length ? <ul className="space-y-2">
          {result.precedents.map((precedent) => <li key={precedent.dekaId} className="rounded-md border bg-card p-3 text-sm">
            <p className="font-medium">{precedent.sourceUrl.startsWith('https://') || precedent.sourceUrl.startsWith('http://') ? <a className="text-primary hover:underline" href={precedent.sourceUrl} target="_blank" rel="noopener noreferrer">ฎ. {precedent.dekaId} · เปิดแหล่งคำพิพากษา</a> : `ฎ. ${precedent.dekaId}`}</p>
            {precedent.headnote && <p className="mt-1 whitespace-pre-wrap leading-relaxed">{precedent.headnote}</p>}
            {(precedent.courtLevel || precedent.judgmentDate) && <p className="mt-1 text-xs text-muted-foreground">{[precedent.courtLevel, precedent.judgmentDate].filter(Boolean).join(' · ')}</p>}
            {!!precedent.citedStatutes.length && <p className="mt-1 text-xs text-muted-foreground">บทกฎหมายที่อ้าง: {precedent.citedStatutes.join(', ')}</p>}
          </li>)}
        </ul> : !result.extractedFacts?.precedentWarning && !result.summaryBullets && <p className="text-sm text-muted-foreground">ยังไม่มีฎีกาในสรุปนี้ กดสรุปข้อมูลคดีล่าสุดเพื่อค้นหาจากข้อมูลปัจจุบัน</p>}
        <p className="text-xs text-muted-foreground">ตรวจเทียบคำพิพากษาฉบับเต็มก่อนนำไปใช้อ้างอิง</p>
      </div>
      {!!result.factsList?.length && result.documentSummary && <details><summary className="cursor-pointer text-sm font-medium">อ่านสรุปเต็ม</summary><p className="mt-2 whitespace-pre-wrap break-words text-sm">{result.documentSummary}</p></details>}
      {!!result.timeline?.length && <details><summary className="cursor-pointer text-sm font-medium">ลำดับเหตุการณ์</summary><ul className="mt-2 space-y-2 text-sm">{result.timeline.map((item, i) => <li key={i}>{item.date} · {item.event}</li>)}</ul></details>}
      <div className="space-y-3 border-t pt-3">
        <h3 className="text-sm font-semibold">ข้อมูลที่เสนอให้เติมลงคดี</h3>
        <p className="text-xs text-muted-foreground">ตรวจข้อความต้นทาง แล้วกดยืนยันเติมทีละช่อง ช่องที่มีข้อมูลอยู่แล้วให้ตรวจแก้ในข้อมูลคดี</p>
        {!result.extractedFacts?.suggestions?.length && <p className="text-sm text-muted-foreground">ยังไม่มีข้อเสนอที่มีข้อความต้นทางรองรับ กดสรุปใหม่หลังเพิ่มข้อมูลได้</p>}
        {result.extractedFacts?.suggestions?.filter(s => FIELD_LABELS[s.field]).map((s, i) => {
          const key = `field:${i}`;
          const old = valueFor(current, s.field);
          return <div key={key} className="space-y-2 rounded-lg border p-3 text-sm"><p className="font-medium">{FIELD_LABELS[s.field]}</p><p>ปัจจุบัน: {hasValue(old) ? String(old) : 'ยังไม่ระบุ'}</p><p className="break-words">AI เสนอ: {s.value}</p><blockquote className="border-l-2 pl-3 text-muted-foreground whitespace-pre-wrap break-words">{s.quote}</blockquote><Button size="sm" disabled={!current || busy || !!applying || applied.includes(key) || hasValue(old)} onClick={() => void apply(key, s.field, s.value)}>{applied.includes(key) ? 'บันทึกแล้ว' : applying === key ? 'กำลังบันทึก…' : `ยืนยันเติม${FIELD_LABELS[s.field]}`}</Button></div>;
        })}
      </div>
      <div className="space-y-3 border-t pt-3"><h3 className="text-sm font-semibold">งานที่มีหลักฐานว่าเสร็จแล้ว</h3><p className="text-xs text-muted-foreground">ติ๊กเพื่อยืนยันและบันทึกงานเป็นเสร็จแล้ว การแนบไฟล์อย่างเดียวไม่ถือว่างานเสร็จ</p>
        {current?.tasks.filter(task => task.status === 'DONE' && !result.extractedFacts?.completedTasks?.some(s => s.taskId === task.id)).map(task => <label key={task.id} className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked disabled /><span>{task.title} · เสร็จแล้วในระบบ</span></label>)}
        {!result.extractedFacts?.completedTasks?.length && <p className="text-sm text-muted-foreground">ยังไม่มีหลักฐานเพียงพอให้เสนอปิดงาน</p>}
        {result.extractedFacts?.completedTasks?.map((s, i) => {
          const key = `task:${i}`;
          const task = current?.tasks.find(t => t.id === s.taskId);
          const done = task?.status === 'DONE' || applied.includes(key);
          return <div key={key} className="space-y-2 rounded-lg border p-3 text-sm"><label className="flex min-h-11 items-center gap-2"><input type="checkbox" checked={done} disabled={!task || done || busy || !!applying} onChange={() => void apply(key, undefined, undefined, s.taskId)} /><span>{done ? 'เสร็จแล้ว' : 'ยืนยันว่าเสร็จแล้ว'} · {s.title}</span></label><blockquote className="border-l-2 pl-3 text-muted-foreground whitespace-pre-wrap break-words">{s.quote}</blockquote></div>;
        })}
      </div>
      {!!result.extractedFacts?.selectedAttachments?.length && <p className="text-xs text-muted-foreground">เอกสารที่ใช้: {result.extractedFacts.selectedAttachments.map(file => `${file.filename} · รุ่น ${file.version ?? '—'}`).join(', ')}</p>}
      <p className="text-xs text-muted-foreground">สรุปเพื่อช่วยทบทวน โปรดตรวจข้อมูลและต้นฉบับก่อนใช้งาน</p>
    </>}
    {!loading && !busy && !result && !error && <p className="text-sm text-muted-foreground">ยังไม่มีสรุป กดสรุปข้อมูลคดีล่าสุดเพื่อเริ่ม</p>}
  </section>;
}
