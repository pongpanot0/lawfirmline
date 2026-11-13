'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, Link as LinkIcon, Send, Sparkles, Sprout, ThumbsUp, Footprints } from 'lucide-react';
import type { CoachingDraft, CoachingNoteView } from '@lawfirm/shared';
import { request } from '@/lib/api';
import { formatDate } from '@/lib/utils';

const blank: CoachingDraft = { praise: '', improve: '', nextStep: '', linkedTasks: [] };
export function CoachingTab({ token, userId, name, notes, refresh }: { token: string; userId: string; name: string; notes: CoachingNoteView[]; refresh: () => Promise<void> }) {
  const [draft, setDraft] = useState<CoachingDraft | null>(null);
  const [aiDrafted, setAiDrafted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const generate = async () => {
    setPending(true); setError('');
    try { setDraft(await request<CoachingDraft>('/coaching/draft', { token, method: 'POST', body: JSON.stringify({ userId }), silent: true })); setAiDrafted(true); }
    catch (e) { setError(e instanceof Error ? e.message : 'ร่างคำแนะนำไม่สำเร็จ'); }
    finally { setPending(false); }
  };
  const send = async () => {
    if (!draft) return;
    setPending(true); setError('');
    try {
      await request('/coaching', { token, method: 'POST', body: JSON.stringify({ userId, praise: draft.praise, improve: draft.improve, nextStep: draft.nextStep, linkedTaskIds: draft.linkedTasks.map(t => t.id), aiDrafted }), silent: true });
      setDraft(null);
      try { await refresh(); } catch { setError('ส่งคำแนะนำแล้ว แต่โหลดประวัติไม่สำเร็จ กรุณาเปิดใหม่อีกครั้ง'); }
    } catch (e) { setError(e instanceof Error ? e.message : 'ส่งคำแนะนำไม่สำเร็จ'); }
    finally { setPending(false); }
  };
  return <div className="space-y-5">
    <section className="rounded-[22px] border border-[var(--terra-border-eadbd2)] bg-[var(--terra-bg-f1f7f2)] p-5 shadow-lg">
      {!draft ? <>
        <div className="flex items-center gap-3"><HeartHandshake className="h-11 w-11 rounded-full bg-[var(--terra-bg-f7dfd5)] p-3 text-[var(--terra-text-874860)]" /><div><h3 className="font-bold">ช่วยกันเติบโตทีละก้าว</h3><p className="text-sm text-muted-foreground">ร่างคำแนะนำที่เฉพาะกับงานของ{name}</p></div></div>
        <p className="mt-5 text-sm font-semibold">AI จะอ่านข้อมูลล่าสุดของคนนี้</p><ul className="mt-2 space-y-2 text-sm text-muted-foreground"><li>• เช็กอิน อัปเดตงานประจำวันและความคิดเห็นในงาน</li><li>• งานเลยกำหนด และแต้มคิวเทียบเกณฑ์ส่วนตัว</li><li>• แต้มงานที่เสร็จรายสัปดาห์ ย้อนหลัง 8 สัปดาห์</li></ul>
        <button disabled={pending} onClick={() => void generate()} className="mt-5 flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--terra-bg-142e43)] px-4 font-bold text-white shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50"><Sparkles size={17} />ให้ AI ช่วยร่างคำแนะนำ</button><p className="mt-1 text-xs text-muted-foreground">กดเพื่อเริ่มร่าง คุณตรวจและแก้ได้ก่อนส่ง</p>
        <button disabled={pending} onClick={() => { setDraft({ ...blank }); setAiDrafted(false); setError(''); }} className="mt-3 min-h-11 underline focus-visible:outline focus-visible:outline-2 disabled:opacity-50">เขียนคำแนะนำเอง</button><p className="text-xs text-muted-foreground">เริ่มเขียนโดยไม่ใช้ AI</p>
        {pending && <p role="status" className="mt-3 rounded-xl bg-card p-3 text-sm">AI กำลังอ่านอัปเดตงานและเรียบเรียงคำแนะนำ…</p>}
      </> : <>
        <div className="flex items-center gap-3"><Sparkles className="h-11 w-11 rounded-full bg-[var(--terra-bg-d8eee1)] p-3 text-[var(--terra-text-176347)]" /><div><h3 className="font-bold">{aiDrafted ? 'ร่างโดย AI — ตรวจและแก้ก่อนส่ง' : 'เขียนคำแนะนำ'}</h3><p className="text-sm text-muted-foreground">ปรับข้อความให้เป็นเสียงของคุณได้เลย</p></div></div>
        {([['praise', 'ชมเชย', ThumbsUp], ['improve', 'ควรปรับ', Sprout], ['nextStep', 'ก้าวต่อไป', Footprints]] as const).map(([key, label, Icon]) => <div key={key}><label className="mb-1 mt-4 flex items-center gap-1 font-bold" htmlFor={`coaching-${key}`}><Icon size={16} className="text-[var(--terra-text-306e5c)]" />{label}</label><textarea id={`coaching-${key}`} rows={2} maxLength={4000} value={draft[key]} disabled={pending} onChange={e => setDraft({ ...draft, [key]: e.target.value })} className="w-full rounded-xl border border-[var(--terra-border-abb9bc)] bg-card p-3 text-sm focus-visible:outline focus-visible:outline-2" />{key === 'improve' && draft.linkedTasks.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{draft.linkedTasks.map(task => <Link key={task.id} href={`/todos?task=${encodeURIComponent(task.id)}`} className="inline-flex items-center gap-1 rounded-full bg-[var(--terra-bg-e8edf0)] px-3 py-1 text-xs font-semibold"><LinkIcon size={13} />{task.title}{task.caseRef && ` · ${task.caseRef}`}</Link>)}</div>}</div>)}
        <div className="mt-4 grid grid-cols-2 gap-3"><div><button onClick={() => void send()} disabled={pending || !draft.praise.trim() || !draft.improve.trim() || !draft.nextStep.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-[var(--terra-bg-142e43)] text-white focus-visible:outline focus-visible:outline-2 disabled:opacity-50"><Send size={16} />ส่งคำแนะนำ</button><p className="mt-1 text-xs text-muted-foreground">บันทึกและแจ้ง{name}</p></div><div><button disabled={pending} onClick={() => { setDraft(null); setError(''); }} className="min-h-11 w-full rounded-full border bg-card focus-visible:outline focus-visible:outline-2 disabled:opacity-50">ยกเลิกร่าง</button><p className="mt-1 text-xs text-muted-foreground">ทิ้งข้อความที่ยังไม่ได้ส่ง</p></div></div>
      </>}
      {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    </section>
    <div><div className="flex justify-between"><h3 className="font-bold">คำแนะนำที่ผ่านมา</h3><span className="text-xs text-muted-foreground">{notes.length} รายการ</span></div>{notes.length === 0 && <p className="mt-3 text-sm text-muted-foreground">ยังไม่มีคำแนะนำที่ผ่านมา</p>}{notes.map(note => <article key={note.id} className="mt-3 rounded-2xl border border-[var(--terra-border-eadbd2)] bg-[var(--terra-bg-fffaf7)] p-4 text-sm"><div className="flex justify-between gap-2"><strong>{note.nextStep}</strong><span className="shrink-0 rounded-full bg-[var(--terra-bg-e1f2e9)] px-2 py-1 text-xs text-[var(--terra-text-176347)]">{note.acknowledgedAt ? 'รับทราบแล้ว' : 'รอรับทราบ'}</span></div><p className="mt-2">{note.praise}</p><p className="mt-2 text-xs text-muted-foreground">{note.author.firstName} · {formatDate(note.createdAt)}</p>{note.reply && <p className="mt-2">ตอบกลับ: {note.reply}</p>}</article>)}</div>
  </div>;
}
