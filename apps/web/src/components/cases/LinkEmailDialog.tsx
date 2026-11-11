'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRightLeft, Paperclip, Search, TriangleAlert, User, X } from 'lucide-react';
import { api, type CaseEmailThreadItem, type LinkCandidate, type LinkCandidates } from '@/lib/api';

function Highlight({ value, query }: { value: string; query: string }) {
  const i = query.length >= 2 ? value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase()) : -1;
  return i < 0 ? <>{value}</> : <>{value.slice(0, i)}<mark className="rounded bg-[#fbf3e0] px-0.5">{value.slice(i, i + query.length)}</mark>{value.slice(i + query.length)}</>;
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
  useEffect(() => { let active = true; api.getCaseEmailLinkCandidates(token, caseId).then(data => { if (active) { setSuggestions(data.suggested); setSelected(data.suggested); } }).catch(() => { if (active) setError('โหลดอีเมลแนะนำไม่สำเร็จ ลองโหลดหน้าใหม่'); }); return () => { active = false; }; }, [token, caseId]);
  useEffect(() => {
    if (!search || q.trim().length < 2) { setResults(null); return; }
    let active = true; const timer = setTimeout(() => { api.getCaseEmailLinkCandidates(token, caseId, q.trim()).then(data => { if (active) setResults(data); }).catch(() => { if (active) setError('ค้นหาอีเมลไม่สำเร็จ ลองค้นอีกครั้ง'); }); }, 300);
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
    catch {
      if (!unlinked) setError(`ยกเลิกการผูก “${row.subject}” กับคดีเดิมไม่สำเร็จ ลองอีกครั้ง`);
      else if (row.linkedCase) {
        try { await api.linkThreadToCase(token, row.threadId, row.linkedCase.id); setError(`ย้าย “${row.subject}” ไม่สำเร็จ — คืนอีเมลไปคดี ${row.linkedCase.ownRef} ตามเดิมแล้ว ลองอีกครั้ง`); }
        catch { setError(`ย้าย “${row.subject}” ไม่สำเร็จ และคืนกลับคดี ${row.linkedCase.ownRef} ไม่ได้ — อีเมลนี้ตอนนี้ไม่ได้ผูกกับคดีไหน ผูกใหม่ได้จากหน้าคดีที่ต้องการ`); }
      } else setError(`ย้าย “${row.subject}” ไม่สำเร็จ — อีเมลนี้ตอนนี้ไม่ได้ผูกกับคดีไหน ลองผูกอีกครั้ง`);
    }
    finally { setBusy(false); }
  };
  const matches = (row: { subject: string; fromName: string | null; fromAddress: string | null }) => [row.subject, row.fromName, row.fromAddress].some(value => value?.toLocaleLowerCase().includes(q.trim().toLocaleLowerCase()));
  const rows = search ? (results?.suggested ?? []).filter(matches) : suggestions;
  const elsewhere = search ? (results?.linkedElsewhere ?? []).filter(row => matches(row) && !hidden.includes(row.threadId)) : [];
  const linked = threads.filter(row => !search || (q.trim().length >= 2 && matches(row)));
  const senders = [...new Set(threads.map(row => row.fromAddress || row.fromName).filter((s): s is string => !!s))];
  const qq = search ? q.trim() : '';
  const date = (value: string) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', timeZone: 'Asia/Bangkok' });
  const hint = 'mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground';
  const label = 'text-[.8rem] text-muted-foreground';
  const btn = 'inline-flex min-h-11 items-center justify-center gap-[.4rem] rounded-lg px-4 text-[.95rem] font-semibold disabled:opacity-60';
  const sender = (row: { fromName: string | null; fromAddress: string | null }) => <><Highlight value={row.fromName || 'ไม่ทราบผู้ส่ง'} query={qq} />{row.fromAddress && <> · <span className="break-all text-muted-foreground">{qq.length >= 2 && row.fromAddress.toLocaleLowerCase().includes(qq.toLocaleLowerCase()) ? <Mark value={row.fromAddress} query={qq} /> : row.fromAddress}</span></>}</>;
  return <dialog ref={dialog} onClose={onClose} onCancel={e => { if (busy) e.preventDefault(); }} aria-labelledby="link-email-title" className="m-auto w-[min(42rem,calc(100vw-2rem))] max-w-none rounded-2xl bg-[#fffdfa] p-0 text-foreground shadow-2xl backdrop:bg-[#101d2a]/45">
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
    <div className="flex items-start justify-between border-b border-[#e2e0d8] px-6 py-4"><div><h2 id="link-email-title" tabIndex={-1} autoFocus={!search} className="text-xl font-bold outline-none">{search ? 'ค้นหาอีเมลเพื่อผูกเข้าคดี' : 'ผูกอีเมลเข้าคดี'}</h2><p className={hint}>{search ? 'ค้นได้จากชื่อผู้ส่ง อีเมลผู้ส่ง หัวเรื่อง หรือเลขคดี · ค้นเฉพาะอีเมลในกล่องของคุณ' : 'เลือกได้หลายฉบับ — อีเมลทุกฉบับในเรื่องเดียวกันจะเข้าคดีนี้ด้วย'}</p><span className="sr-only">{caseRef}</span></div><button type="button" disabled={busy} aria-label="ปิดหน้าต่างผูกอีเมล" onClick={() => dialog.current?.close()} className={`${btn} text-muted-foreground`}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button></div>
    <div className="min-h-0 space-y-4 overflow-y-auto overscroll-contain px-6 py-5">
      {search ? <>
        <button type="button" className="inline-flex items-center gap-1 text-sm font-semibold underline" onClick={() => { setSearch(false); setQ(''); }}><ArrowLeft aria-hidden="true" className="h-[1.1em] w-[1.1em]" />กลับไปอีเมลที่ระบบแนะนำ ({suggestions.length})</button>
        <label className="relative block"><span className="sr-only">ค้นหาอีเมล</span><Search aria-hidden="true" className="absolute left-3 top-[15px] h-[1.1em] w-[1.1em] text-muted-foreground" /><input autoFocus type="text" inputMode="search" enterKeyHint="search" value={q} onChange={e => setQ(e.target.value)} placeholder="ชื่อผู้ส่ง อีเมลผู้ส่ง หัวเรื่อง หรือเลขคดี" className="min-h-[46px] w-full rounded-lg border border-[#c9ccc6] bg-white py-[.55rem] pl-10 pr-12 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />{q && <button type="button" aria-label="ล้างคำค้น" className="absolute right-1 top-0 flex h-[46px] w-11 items-center justify-center text-muted-foreground" onClick={() => setQ('')}><X aria-hidden="true" className="h-[1.1em] w-[1.1em]" /></button>}</label>
        {senders.length > 0 && <div className="flex flex-wrap items-center gap-2 text-sm"><span className={label}>ค้นจากคนที่เคยส่งเรื่องคดีนี้:</span>{senders.map(item => <button key={item} type="button" onClick={() => setQ(item)} className="inline-flex min-h-9 items-center gap-[.4rem] rounded-full bg-[#eeebe3] px-[.9rem] py-[.45rem] text-[.85rem]"><User aria-hidden="true" className="h-[1.1em] w-[1.1em]" />{item}</button>)}</div>}
        {q.trim().length >= 2 && results && <p className="text-sm"><b>พบ {rows.length + elsewhere.length + linked.length} เรื่อง</b> <span className={hint}>ที่ชื่อผู้ส่ง อีเมลผู้ส่ง หรือหัวเรื่องตรงกับ “{q.trim()}”</span></p>}
      </> : <p className="text-sm"><b>ระบบเลือกอีเมลที่น่าจะเกี่ยวกับคดีนี้ไว้ให้แล้ว</b> <span className={hint}>· ตรงกับชื่อลูกความ เลขคดี หรือคู่ความ — ตรวจแล้วกดผูกได้เลย</span></p>}
      {(rows.length > 0 || linked.length > 0 || elsewhere.length > 0) && <ul className="divide-y divide-[#e2e0d8] rounded-lg border border-[#e2e0d8] bg-white text-sm">
        {rows.map(row => { const on = selected.some(item => item.threadId === row.threadId); return <li key={row.threadId}><label className={`flex cursor-pointer items-start gap-3 px-4 py-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring ${on ? 'bg-[#f3f7fb]' : ''}`}><input type="checkbox" disabled={busy} checked={on} onChange={e => setSelected(e.target.checked ? [...selected, row] : selected.filter(item => item.threadId !== row.threadId))} className="mt-1 h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><b className="block break-words"><Highlight value={row.subject} query={qq} /></b><span className="mt-0.5 block break-words">{sender(row)}</span><span className={label}>{date(row.lastMessageAt)} · {row.attachmentCount ? <><Paperclip aria-hidden="true" className="inline h-[1em] w-[1em]" /> {row.attachmentCount} ไฟล์</> : 'ไม่มีไฟล์แนบ'}</span></span></label></li>; })}
        {elsewhere.map(row => <li key={row.threadId} className="px-4 py-3"><div className="flex items-start gap-3"><input type="checkbox" disabled aria-label={`${row.subject} ผูกกับคดีอื่นอยู่`} className="mt-1 h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><b className="block break-words"><Highlight value={row.subject} query={qq} /></b><span className="mt-0.5 block break-words">{sender(row)}</span><span className={label}>{date(row.lastMessageAt)} · {row.attachmentCount ? <><Paperclip aria-hidden="true" className="inline h-[1em] w-[1em]" /> {row.attachmentCount} ไฟล์</> : 'ไม่มีไฟล์แนบ'}</span></span></div>
          <div className="ml-8 mt-3 border-l-4 border-[#b8913a] bg-[#fbf3e0] py-2 pl-3 pr-2"><p className="flex items-center gap-1 font-semibold text-[#6b4f0b]"><TriangleAlert aria-hidden="true" className="h-[1.1em] w-[1.1em] shrink-0" />อีเมลนี้ผูกกับคดีอื่นอยู่: {row.linkedCase?.ownRef} · {row.linkedCase?.title}</p><p className={hint}>ถ้าย้ายมาคดีนี้ จะหายจากคดีเดิม และไฟล์แนบ {row.attachmentCount} ไฟล์จะย้ายมาแท็บเอกสารของคดีนี้ด้วย</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void move(row)} className={`${btn} min-h-9 border border-[#c9ccc6] bg-white py-2 text-[#142e43]`}><ArrowRightLeft aria-hidden="true" className="h-[1.1em] w-[1.1em]" />ย้ายมาคดีนี้</button><button type="button" disabled={busy} onClick={() => setHidden(ids => [...ids, row.threadId])} className={`${btn} min-h-9 py-2 text-muted-foreground`}>ไม่ย้าย</button></div></div></li>)}
        {linked.map(row => <li key={row.id} className="flex items-start gap-3 px-4 py-3 text-muted-foreground"><input type="checkbox" disabled aria-label={`${row.subject} ผูกกับคดีนี้แล้ว`} className="mt-1 h-5 w-5 shrink-0" /><span className="min-w-0 flex-1"><b className="block break-words">{row.subject}</b><span className={label}>ผูกกับคดีนี้แล้ว</span></span></li>)}
      </ul>}
      {!search && !rows.length && <p className={hint}>ยังไม่มีอีเมลที่ระบบแนะนำ — ลองค้นหาเองด้านล่าง</p>}
      {!search && <button type="button" className="text-sm font-semibold underline" onClick={() => setSearch(true)}>หาอีเมลอื่นไม่เจอ? ค้นหาเอง</button>}
      <p className={hint}>{search ? 'ไม่เจอเลย? อีเมลอาจอยู่ในกล่องของคนอื่น — ให้คนนั้นเปิดหน้าคดีนี้แล้วกดผูกจากกล่องของเขา' : 'อีเมล 1 เรื่องผูกได้คดีเดียว — ถ้าผูกคดีอื่นอยู่ ระบบจะบอกชื่อคดีและถามก่อนย้าย'}</p>
      {error && <p role="alert" className="text-[.85rem] font-semibold text-[#a83232]">{error}</p>}
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2e0d8] px-6 py-4"><p className={hint}>{selected.length ? `เลือก ${selected.length} อีเมล · ` : ''}ไฟล์แนบ {selected.reduce((sum, row) => sum + row.attachmentCount, 0)} ไฟล์จะเข้าแท็บเอกสาร</p><div className="flex gap-2"><button type="button" disabled={busy} onClick={() => dialog.current?.close()} className={`${btn} text-muted-foreground`}>ยกเลิก</button><button type="button" disabled={busy || !selected.length} onClick={() => void link()} className={`${btn} bg-[#142e43] text-[#fffdfa]`}>{busy ? 'กำลังผูก…' : `ผูก ${selected.length} อีเมลเข้าคดี`}</button></div></div>
    </div>
  </dialog>;
}

function Mark({ value, query }: { value: string; query: string }) {
  const i = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase());
  return i < 0 ? <>{value}</> : <>{value.slice(0, i)}<mark className="rounded bg-[#fbf3e0] px-0.5">{value.slice(i, i + query.length)}</mark>{value.slice(i + query.length)}</>;
}
