'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Paperclip, Search, X } from 'lucide-react';
import { api, type CaseEmailThreadItem, type LinkCandidate, type LinkCandidates } from '@/lib/api';
import { Button } from '@/components/ui/button';

function Highlight({ value, query }: { value: string; query: string }) {
  const i = query.length >= 2 ? value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return i < 0 ? <>{value}</> : <>{value.slice(0, i)}<mark>{value.slice(i, i + query.length)}</mark>{value.slice(i + query.length)}</>;
}

export function LinkEmailDialog({ token, caseId, caseRef, threads = [], onClose, onLinked }: { token: string; caseId: string; caseRef: string; threads?: CaseEmailThreadItem[]; onClose: () => void; onLinked: () => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [suggestions, setSuggestions] = useState<LinkCandidate[]>([]);
  const [selected, setSelected] = useState<LinkCandidate[]>([]);
  const [search, setSearch] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState<LinkCandidates | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [hidden, setHidden] = useState<string[]>([]);
  useEffect(() => { const previous = document.activeElement as HTMLElement | null; dialog.current?.showModal(); return () => previous?.focus(); }, []);
  useEffect(() => { let active = true; api.getCaseEmailLinkCandidates(token, caseId).then(data => { if (active) { setSuggestions(data.suggested); setSelected(data.suggested); } }).catch(() => { if (active) setError('โหลดอีเมลแนะนำไม่สำเร็จ'); }); return () => { active = false; }; }, [token, caseId]);
  useEffect(() => {
    if (!search || q.trim().length < 2) { setResults(null); return; }
    let active = true; const timer = setTimeout(() => { api.getCaseEmailLinkCandidates(token, caseId, q.trim()).then(data => { if (active) setResults(data); }).catch(() => { if (active) setError('ค้นหาอีเมลไม่สำเร็จ'); }); }, 300);
    return () => { active = false; clearTimeout(timer); };
  }, [search, q, token, caseId]);
  const link = async () => {
    setBusy(true); setError(''); const failed: LinkCandidate[] = [];
    for (const row of selected) { try { await api.linkThreadToCase(token, row.threadId, caseId); } catch { failed.push(row); } }
    await onLinked(); setBusy(false); setSelected(failed);
    if (failed.length) setError(`ผูกไม่สำเร็จ: ${failed.map(row => row.subject).join(' · ')}`); else dialog.current?.close();
  };
  const move = async (row: LinkCandidate) => {
    setBusy(true); setError(''); let unlinked = false;
    try { await api.unlinkThreadFromCase(token, row.threadId); unlinked = true; await api.linkThreadToCase(token, row.threadId, caseId); setHidden(ids => [...ids, row.threadId]); await onLinked(); }
    catch { setError(unlinked ? `ย้าย “${row.subject}” ไม่สำเร็จ: ยกเลิกการผูกกับคดีเดิมแล้ว แต่ผูกคดีนี้ไม่สำเร็จ` : `ยกเลิกการผูก “${row.subject}” กับคดีเดิมไม่สำเร็จ`); }
    finally { setBusy(false); }
  };
  const matches = (row: { subject: string; fromName: string | null; fromAddress: string | null }) => [row.subject, row.fromName, row.fromAddress].some(value => value?.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const rows = search ? (results?.suggested ?? []).filter(matches) : suggestions;
  const elsewhere = search ? (results?.linkedElsewhere ?? []).filter(row => matches(row) && !hidden.includes(row.threadId)) : [];
  const linked = threads.filter(row => !search || (q.trim().length >= 2 && matches(row)));
  const senders = [...new Set(threads.map(row => row.fromAddress || row.fromName).filter((s): s is string => !!s))];
  return <dialog ref={dialog} onClose={onClose} onCancel={e => { if (busy) e.preventDefault(); }} aria-labelledby="link-email-title" className="m-auto max-h-[90dvh] w-[min(42rem,calc(100vw-2rem))] rounded-lg border bg-card p-0 text-foreground shadow-xl backdrop:bg-black/50">
    <div className="flex items-start justify-between gap-4 border-b p-4"><div><h2 id="link-email-title" className="text-lg font-semibold">{search ? 'ค้นหาอีเมลเพื่อผูกเข้าคดี' : 'ผูกอีเมลเข้าคดี'}</h2><p className="mt-1 text-sm text-muted-foreground">{search ? 'ค้นได้จากชื่อผู้ส่ง อีเมลผู้ส่ง หัวเรื่อง หรือเลขคดี · ค้นเฉพาะอีเมลในกล่องของคุณ' : 'เลือกได้หลายฉบับ — ทั้งเรื่อง (ทุกข้อความในเธรด) จะเข้าคดีนี้'}</p><span className="sr-only">{caseRef}</span></div><Button type="button" variant="ghost" disabled={busy} aria-label="ปิด" onClick={() => dialog.current?.close()}><X aria-hidden="true" /></Button></div>
    <div className="max-h-[55dvh] space-y-3 overflow-y-auto overscroll-contain p-4">
      {search ? <><button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => { setSearch(false); setQ(''); }}>กลับไปอีเมลที่ระบบแนะนำ ({suggestions.length})</button><div className="flex items-center gap-2 rounded-lg border px-3"><Search aria-hidden="true" className="h-4 w-4" /><input autoFocus type="text" inputMode="search" enterKeyHint="search" aria-label="ค้นหาอีเมล" value={q} onChange={e => setQ(e.target.value)} className="min-h-11 min-w-0 flex-1 bg-transparent text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />{q && <button type="button" aria-label="ล้างคำค้น" className="flex h-11 w-11 items-center justify-center" onClick={() => setQ('')}><X aria-hidden="true" className="h-4 w-4" /></button>}</div>{senders.length > 0 && <div><p className="text-sm">ค้นจากคนที่เคยส่งเรื่องคดีนี้:</p><div className="flex flex-wrap gap-2">{senders.map(sender => <Button key={sender} type="button" variant="outline" onClick={() => setQ(sender)}>{sender}</Button>)}</div></div>}{q.trim().length >= 2 && results && <p className="text-sm">พบ {rows.length + elsewhere.length + linked.length} เรื่อง</p>}</> : <><h3 className="font-semibold">ระบบเลือกอีเมลที่น่าจะเกี่ยวกับคดีนี้ไว้ให้แล้ว</h3><p className="text-sm text-muted-foreground">อ้างอิงจากเลขคดีและผู้ติดต่อของลูกความ</p></>}
      {rows.map(row => <label key={row.threadId} className="flex min-h-11 cursor-pointer gap-3 rounded-lg border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"><input type="checkbox" disabled={busy} checked={selected.some(item => item.threadId === row.threadId)} onChange={e => setSelected(e.target.checked ? [...selected, row] : selected.filter(item => item.threadId !== row.threadId))} /><span className="min-w-0 text-sm"><strong className="block break-words"><Highlight value={row.subject} query={search ? q.trim() : ''} /></strong><span className="block break-words"><Highlight value={row.fromName || 'ไม่ทราบผู้ส่ง'} query={search ? q.trim() : ''} /> · <Highlight value={row.fromAddress || ''} query={search ? q.trim() : ''} /></span><span className="text-muted-foreground">{new Date(row.lastMessageAt).toLocaleDateString('th-TH')} · <Paperclip aria-label="ไฟล์แนบ" className="inline h-3 w-3" /> {row.attachmentCount}</span></span></label>)}
      {linked.map(row => <div key={row.id} className="rounded-lg border p-3 text-sm text-muted-foreground">{row.subject} · ผูกกับคดีนี้แล้ว</div>)}
      {elsewhere.map(row => <div key={row.threadId} className="space-y-2 rounded-lg border p-3 text-sm"><strong className="block break-words"><Highlight value={row.subject} query={q.trim()} /></strong><p className="break-words"><Highlight value={row.fromName || 'ไม่ทราบผู้ส่ง'} query={q.trim()} /> · <Highlight value={row.fromAddress || ''} query={q.trim()} /> · {new Date(row.lastMessageAt).toLocaleDateString('th-TH')} · <Paperclip aria-label="ไฟล์แนบ" className="inline h-3 w-3" /> {row.attachmentCount}</p><div className="rounded bg-warning/10 p-3"><p>อีเมลนี้ผูกกับคดีอื่นอยู่: {row.linkedCase?.ownRef} · {row.linkedCase?.title}</p><p>ถ้าย้ายมาคดีนี้ จะหายจากคดีเดิม และไฟล์แนบ {row.attachmentCount} ไฟล์จะย้ายมาแท็บเอกสารของคดีนี้ด้วย</p><div className="mt-2 flex flex-wrap gap-2"><Button type="button" disabled={busy} onClick={() => void move(row)}><ArrowRightLeft aria-hidden="true" className="h-4 w-4" />ย้ายมาคดีนี้</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setHidden(ids => [...ids, row.threadId])}>ไม่ย้าย</Button></div></div></div>)}
      {!search && <button type="button" className="min-h-11 text-sm text-primary underline" onClick={() => setSearch(true)}>หาอีเมลอื่นไม่เจอ? ค้นหาเอง</button>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </div><div className="border-t bg-card p-4"><p className="mb-2 text-sm text-muted-foreground">{search ? 'ไม่เจอเลย? อีเมลอาจอยู่ในกล่องของคนอื่น — ให้คนนั้นเปิดหน้าคดีนี้แล้วกดผูกจากกล่องของเขา' : `ไฟล์แนบ ${selected.reduce((sum, row) => sum + row.attachmentCount, 0)} ไฟล์จะเข้าแท็บเอกสาร`}</p><div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => dialog.current?.close()}>ยกเลิก</Button><Button type="button" disabled={busy || !selected.length} onClick={() => void link()}>{busy ? 'กำลังผูก…' : `ผูก ${selected.length} อีเมลเข้าคดี`}</Button></div></div>
  </dialog>;
}
