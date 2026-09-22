'use client';

import { useEffect, useRef, useState } from 'react';
import { api, IntakePrecedentAnalysisItem, DocumentItem, ResearchFact } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { DocumentDropZone } from '@/components/DocumentDropZone';
import { RelatedStatutes } from '@/components/intake/RelatedStatutes';
import { CaseSummaryPanel } from '@/components/cases/CaseSummaryPanel';

const STATUS = { PENDING: 'รอตรวจ', REVIEWED: 'ตรวจแล้ว', CONFLICT: 'มีข้อขัดแย้ง', MISSING: 'ข้อมูลขาด' };

export function ResearchWorkspace({ intakeId, caseId, initialText = '', documents = [], onUploaded, onResult }: {
  intakeId?: string;
  caseId?: string;
  initialText?: string;
  documents?: DocumentItem[];
  onUploaded?: () => void;
  onResult?: (result: IntakePrecedentAnalysisItem) => void;
}) {
  const { token } = useAuth();
  const [text, setText] = useState(initialText);
  const [filesExpanded, setFilesExpanded] = useState(documents.length === 0);
  const [selected, setSelected] = useState<string[]>([]);
  const [history, setHistory] = useState<IntakePrecedentAnalysisItem[]>([]);
  const [result, setResult] = useState<IntakePrecedentAnalysisItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [chosenFacts, setChosenFacts] = useState<number[]>([]);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);
  const field = 'w-full rounded-lg border border-input bg-background px-3 py-2 text-sm';

  useEffect(() => {
    if (!token) return;
    let active = true;
    setLoading(true);
    (caseId ? api.listCasePrecedentAnalyses(token, caseId) : intakeId ? api.listPrecedentAnalyses(token, intakeId) : api.listResearch(token))
      .then((rows) => { if (active) { setHistory(rows); setResult(rows[0] ?? null); } })
      .catch(() => { if (active) setError('โหลดผลที่บันทึกไว้ไม่สำเร็จ'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, intakeId, caseId, retry]);

  const showResult = (row: IntakePrecedentAnalysisItem) => {
    setResult(row); setChosenFacts([]); setEditing(null);
    setHistory((prev) => [row, ...prev.filter((item) => item.id !== row.id)]);
    onResult?.(row);
  };
  const run = async (factsOnly: boolean, selectedText?: string) => {
    if (!token || lock.current) return;
    lock.current = true; setBusy(factsOnly ? 'กำลังจัดข้อเท็จจริง…' : 'กำลังค้นฎีกา…'); setError('');
    try { showResult(await api.research(token, selectedText ?? text, intakeId, selectedText ? [] : selected, factsOnly, caseId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'ทำรายการไม่สำเร็จ ข้อมูลที่พิมพ์และไฟล์ยังอยู่'); }
    finally { lock.current = false; setBusy(''); }
  };
  const summarize = async () => {
    if (!token || lock.current || !selected.length) return;
    lock.current = true; setBusy('กำลังสรุปข้อมูลจากเอกสาร…'); setError('');
    try { showResult(await api.summarizeResearchDocuments(token, selected, intakeId, caseId)); }
    catch (e) { setError(e instanceof Error ? e.message : 'สรุปเอกสารไม่สำเร็จ'); }
    finally { lock.current = false; setBusy(''); }
  };
  const upload = async (files: File[]) => {
    if (!token || (!intakeId && !caseId) || lock.current) return;
    lock.current = true; setError('');
    const failed: string[] = []; const ids: string[] = [];
    if (files.length + selected.length > 10 || files.some((f) => f.size > 30 * 1024 * 1024 || !/\.(pdf|txt)$/i.test(f.name))) {
      setError('เลือก PDF / TXT ไม่เกิน 10 ไฟล์ และไม่เกิน 30MB ต่อไฟล์'); lock.current = false; return;
    }
    try {
      for (const file of files) {
        setBusy(`กำลังเก็บ ${file.name}`);
        try { const doc = caseId ? await api.uploadDocument(token, caseId, file) : await api.uploadIntakeDocument(token, intakeId!, file); ids.push(doc.id); }
        catch { failed.push(file.name); }
      }
      setSelected((prev) => [...new Set([...prev, ...ids])].slice(0, 10));
      onUploaded?.();
      if (failed.length) setError(`เก็บไฟล์ไม่สำเร็จ: ${failed.join(', ')} — ลองใหม่เฉพาะไฟล์เหล่านี้`);
    } finally { lock.current = false; setBusy(''); }
  };
  const facts = result?.extractedFacts?.factItems ?? [];
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const saveFact = async (index: number, statement: string, status: ResearchFact['status']) => {
    if (!token || !result || lock.current) return;
    lock.current = true; setBusy('กำลังบันทึกข้อเท็จจริง…'); setError('');
    try {
      const updated = await api.reviewResearchFact(token, result.id, index, facts[index], statement, status);
      setResult(updated); setHistory((prev) => prev.map((item) => item.id === updated.id ? updated : item));
      setEditing(null); onResult?.(updated);
    } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ'); }
    finally { lock.current = false; setBusy(''); }
  };

  return <section aria-label="ข้อเท็จจริงและฎีกา" className="min-w-0 space-y-5">
    {caseId && <CaseSummaryPanel caseId={caseId} />}
    <div className="space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5">
      <h2 className="text-lg font-semibold">เริ่มจากเรื่องที่ต้องการรู้</h2>
      <p className="text-sm text-muted-foreground">พิมพ์เหตุการณ์เพื่อจัดข้อเท็จจริงหรือค้นฎีกา หรือเลือกเอกสารเพื่อสรุปข้อมูลจากไฟล์</p>
      <label htmlFor="research-text" className="block text-sm font-medium">เหตุการณ์หรือประเด็นที่ต้องการค้น</label>
      <textarea id="research-text" rows={5} maxLength={12000} value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy} className={field} placeholder="เช่น บริษัทประกันมอบหมายให้ต่อสู้คดี ผู้เอาประกันโต้แย้งว่าไม่ได้เป็นฝ่ายประมาท ต้องการหาแนวฎีกาเรื่องภาระการพิสูจน์…" />
      {(intakeId || caseId) && <details className="rounded-lg border border-border p-3" open={filesExpanded} onToggle={(e) => setFilesExpanded(e.currentTarget.open)}>
        <summary className="cursor-pointer text-sm font-medium">เอกสาร · เลือก {selected.length} ไฟล์</summary>
        <div className="mt-3 space-y-3">
          <DocumentDropZone multiple accept=".pdf,.txt,application/pdf,text/plain" disabled={!!busy} onFiles={(files) => void upload(files)} label="แนบเอกสารของเรื่อง" hint="PDF / TXT ไม่เกิน 30MB ต่อไฟล์ · ไฟล์สแกนจะอ่านข้อความเมื่อกดวิเคราะห์" />
          <p className="text-xs text-muted-foreground">ไฟล์เก็บไว้ในเรื่องทันที การเก็บไฟล์ยังไม่ใช่การอ่านด้วย AI</p>
          {documents.map((doc) => <label key={doc.id} className="flex items-start gap-2 text-sm">
            <input type="checkbox" checked={selected.includes(doc.id)} disabled={!!busy || (!selected.includes(doc.id) && selected.length >= 10) || !['application/pdf','text/plain'].includes(doc.mimeType)} onChange={() => setSelected((prev) => prev.includes(doc.id) ? prev.filter((id) => id !== doc.id) : [...prev, doc.id])} />
            <span className="min-w-0 break-words">{doc.filename} <span className="text-xs text-muted-foreground">· {['application/pdf','text/plain'].includes(doc.mimeType) ? 'เก็บไฟล์แล้ว' : 'เก็บได้ แต่ AI ยังไม่รองรับชนิดนี้'}</span></span>
          </label>)}
        </div>
      </details>}
      <div className="flex flex-wrap gap-2">
        <Button disabled={!!busy || (!text.trim() && !selected.length)} onClick={() => void run(false)}>ค้นฎีกา · 10 เครดิต</Button>
        <Button variant="outline" disabled={!!busy || (!text.trim() && !selected.length)} onClick={() => void run(true)}>จัดข้อเท็จจริง · 5 เครดิต</Button>
        {(intakeId || caseId) && <Button variant="outline" disabled={!!busy || !selected.length} onClick={() => void summarize()}>สรุปข้อมูลจากเอกสาร · 5 เครดิต</Button>}
      </div>
      {(intakeId || caseId) && <p className="text-xs text-muted-foreground">สรุปเอกสารใช้เฉพาะไฟล์ที่เลือก ไม่รวมข้อความในช่องด้านบน{!selected.length && ' · เปิดส่วนเอกสารแล้วเลือกไฟล์ก่อนสรุป'}</p>}
      <p className="text-xs text-muted-foreground">ผลสำเร็จบันทึกอัตโนมัติ{caseId ? 'ในคดีนี้' : intakeId ? 'ในเรื่องนี้ และติดตามไปเมื่อเปิดเป็นคดี' : 'ในประวัติของคุณ'} · ข้อความเป็นข้อมูลที่ผู้ใช้ระบุ จนกว่าจะตรวจเทียบหลักฐาน</p>
      {busy && <p role="status" className="text-sm text-primary">{busy}</p>}
      {error && <div role="alert" className="text-sm text-destructive">{error} <button type="button" disabled={!!busy} className="underline" onClick={() => { setError(''); setRetry((n) => n + 1); }}>โหลดผลล่าสุด</button></div>}
    </div>
    {loading ? <p role="status">กำลังโหลดประวัติ…</p> : history.length > 0 && <label className="block text-sm">ผลที่บันทึกไว้
      <select className={`${field} mt-1`} disabled={!!busy} value={result?.id ?? ''} onChange={(e) => { setResult(history.find((r) => r.id === e.target.value) ?? null); setEditing(null); setChosenFacts([]); }}>
        {history.map((row) => <option key={row.id} value={row.id}>{new Date(row.createdAt).toLocaleString('th-TH')} · {row.status === 'FAILED' ? 'ไม่สำเร็จ' : row.extractedFacts?.caseSummary ? 'สรุปคดี' : row.extractedFacts?.summaryOnly ? 'สรุปเอกสาร' : row.extractedFacts?.factsOnly ? 'ข้อเท็จจริง' : 'ข้อเท็จจริงและฎีกา'}</option>)}
      </select>
    </label>}
    {result?.extractedFacts?.description && <Button variant="ghost" disabled={!!busy} onClick={() => { setText(result.extractedFacts?.description ?? ''); document.getElementById('research-text')?.focus(); }}>ใช้ข้อความเดิมค้นต่อ</Button>}
    {result && (result.status !== 'COMPLETE' ? <p role="alert">ผลนี้วิเคราะห์ไม่สำเร็จ: {result.errorMessage}</p> : <>
      {!!result.extractedFacts?.attachmentWarnings?.length && <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
        <p className="font-semibold">ผลจากข้อมูลไม่ครบ — ตรวจขอบเขตก่อนนำไปใช้</p>
        {result.extractedFacts.attachmentWarnings.map((warning) => <p key={warning}>{warning}</p>)}
      </div>}
      {!result.extractedFacts?.summaryOnly && <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">ข้อเท็จจริงที่ตรวจได้</h2>
        <div className="flex flex-wrap gap-2">
          <select aria-label="กรองข้อเท็จจริง" className="rounded-lg border border-input bg-background p-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="ALL">ทั้งหมด ({facts.length})</option>{Object.entries(STATUS).map(([key,label]) => <option key={key} value={key}>{label} ({facts.filter((f) => f.status === key).length})</option>)}
          </select>
          <input aria-label="ค้นหาข้อเท็จจริงหรือแหล่งที่มา" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ค้นข้อเท็จจริง / ชื่อไฟล์" className="min-w-0 flex-1 rounded-lg border border-input bg-background p-2 text-sm" />
        </div>
        <p className="text-xs text-muted-foreground">“ตรวจแล้ว” คืออ่านเทียบแหล่งที่มา ไม่ใช่ข้อยุติของคดี เลือกข้อที่ต้องการใช้ค้นฎีกาต่อได้</p>
        {facts.length === 0 && <p className="text-sm text-muted-foreground">ผลนี้ยังไม่มีข้อเท็จจริงพร้อมข้อความอ้างอิง กดจัดข้อเท็จจริงจากข้อความหรือไฟล์อีกครั้ง</p>}
        <ul className="space-y-3">{facts.map((fact,index) => ({fact,index})).filter(({fact}) => (filter === 'ALL' || filter === fact.status) && `${fact.statement} ${fact.source}`.toLowerCase().includes(search.toLowerCase())).map(({fact,index}) => <li key={`${result.id}-${index}`} className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex items-start gap-2"><input type="checkbox" aria-label={`เลือกข้อเท็จจริง ${index+1}`} checked={chosenFacts.includes(index)} onChange={() => setChosenFacts((prev) => prev.includes(index) ? prev.filter((i) => i !== index) : [...prev,index])} /><span className="text-xs font-medium">{STATUS[fact.status]}</span></div>
          {editing === index ? <textarea aria-label="แก้ไขข้อเท็จจริง" className={field} rows={3} maxLength={2000} value={draft} onChange={(e) => setDraft(e.target.value)} /> : <p className="text-sm whitespace-pre-wrap break-words">{fact.statement}</p>}
          <p className="text-xs text-muted-foreground break-words">{fact.source}{fact.page ? ` · หน้า ${fact.page}` : ''}</p>
          {fact.quote && <blockquote className="border-l-2 border-border pl-3 text-sm text-muted-foreground whitespace-pre-wrap break-words">“{fact.quote}”</blockquote>}
          {(intakeId || caseId) && (() => {
            const matches = result.extractedFacts?.selectedAttachments?.filter((d) => d.filename === fact.source) ?? [];
            const source = matches.length === 1 ? matches[0] : null;
            const doc = source && documents.find((d) => d.id === source.id);
            if (!doc || !source) return null;
            if (!source.version || (!caseId && doc.version !== source.version)) return <p className="text-xs text-amber-700">ต้นฉบับอาจเปลี่ยนรุ่นแล้ว กรุณาจัดข้อเท็จจริงใหม่ก่อนตรวจเทียบ</p>;
            return <button type="button" className="text-sm text-primary underline" onClick={async () => {
              if (!token) return;
              try {
                const blob = caseId ? await api.downloadDocument(token, caseId, doc.id, source.version) : await api.downloadIntakeDocument(token, intakeId!, doc.id);
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a'); link.href = `${url}${fact.page ? `#page=${fact.page}` : ''}`; link.target = '_blank'; link.rel = 'noopener'; link.click();
                setTimeout(() => URL.revokeObjectURL(url),60000);
              } catch { setError('เปิดเอกสารไม่สำเร็จ'); }
            }}>เปิดต้นฉบับ · รุ่น {source.version}</button>;
          })()}
          <div className="flex flex-wrap gap-2">
            {editing === index ? <><Button size="sm" disabled={!!busy || !draft.trim()} onClick={() => void saveFact(index,draft,fact.quote ? 'PENDING' : fact.status)}>บันทึกการแก้ไข</Button><Button size="sm" variant="ghost" onClick={() => setEditing(null)}>ยกเลิก</Button></> : <>
              <Button size="sm" variant="outline" disabled={!!busy} onClick={() => {setEditing(index);setDraft(fact.statement);}}>แก้ไข</Button>
              {fact.quote && fact.status !== 'REVIEWED' && <Button size="sm" disabled={!!busy} onClick={() => void saveFact(index,fact.statement,'REVIEWED')}>ตรวจเทียบแล้ว</Button>}
              {fact.quote && <Button size="sm" variant="ghost" disabled={!!busy} onClick={() => void saveFact(index,fact.statement, fact.status === 'CONFLICT' ? 'PENDING' : 'CONFLICT')}>{fact.status === 'CONFLICT' ? 'กลับไปรอตรวจ' : 'ระบุข้อขัดแย้ง'}</Button>}
            </>}
          </div>
          {!!fact.revisions?.length && <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">ประวัติแก้ไข ({fact.revisions.length})</summary>{fact.revisions.map((rev,i) => <p key={i}>{new Date(rev.at).toLocaleString('th-TH')} · {rev.statement}</p>)}</details>}
        </li>)}</ul>
        {chosenFacts.length > 0 && <Button disabled={!!busy} onClick={() => void run(false, chosenFacts.map((index) => `[ผู้ใช้เลือกจากผล ${result.id} ข้อ ${index + 1} · ${STATUS[facts[index].status]} · ${facts[index].source}] ${facts[index].statement}`).join('\n'))}>ค้นฎีกาจาก {chosenFacts.length} ข้อที่เลือก · 10 เครดิต</Button>}
      </div>}
      <details key={result.id} open={result.extractedFacts?.summaryOnly || undefined} className="rounded-xl border border-border p-4"><summary className="cursor-pointer font-medium">{result.extractedFacts?.caseSummary ? 'สรุปข้อมูลคดีและเอกสาร' : result.extractedFacts?.summaryOnly ? 'สรุปข้อมูลจากเอกสาร' : 'สรุปเหตุการณ์และลำดับเวลา'}</summary>{result.extractedFacts?.summaryOnly && <p className="mt-2 text-xs text-muted-foreground">{result.extractedFacts.caseSummary && 'ใช้ข้อมูลคดีที่บันทึกไว้ร่วมด้วย · '}ไฟล์ที่ใช้: {result.extractedFacts.selectedAttachments?.map(file => `${file.filename} · รุ่น ${file.version ?? '—'}`).join(', ') || 'ไม่มี'} · โปรดตรวจเทียบต้นฉบับก่อนใช้งาน</p>}<p className="mt-3 whitespace-pre-wrap text-sm">{result.documentSummary}</p>{result.timeline?.map((item,index) => <p key={index} className="mt-2 text-sm"><strong>{item.date}</strong> · {item.event}</p>)}</details>
      {!result.extractedFacts?.factsOnly && <div className="rounded-xl border border-border bg-card p-4 space-y-3">
        <h2 className="font-semibold">ฎีกาที่ค้นพบ ({result.precedents.length})</h2>
        {!result.precedents.length && <p className="text-sm">ไม่พบฎีกาจากการค้นครั้งนี้ ลองระบุประเด็นให้เจาะจงขึ้น</p>}
        {result.precedents.map((p) => <details key={p.dekaId} className="rounded-lg border border-border p-3"><summary className="cursor-pointer font-medium text-sm">ฎ. {p.dekaId} <span className="font-normal text-muted-foreground">· อ่านบทสรุป</span></summary><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed">{p.headnote}</p>{/^https?:\/\//.test(p.sourceUrl) && <a className="mt-2 block text-sm text-primary underline" href={p.sourceUrl} target="_blank" rel="noopener noreferrer">เปิดแหล่งข้อมูลฎีกา</a>}</details>)}
        <p className="whitespace-pre-wrap text-sm">{result.summaryBullets}</p>
        <RelatedStatutes precedents={result.precedents} />
        <p className="text-xs text-muted-foreground">ผลค้นเบื้องต้น ไม่ยืนยันว่าได้ตรวจฉบับเต็มแล้ว โปรดเทียบข้อเท็จจริงและต้นฉบับก่อนใช้อ้างอิง</p>
      </div>}
    </>)}
  </section>;
}
