'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HeartHandshake, Sparkles, Sprout } from 'lucide-react';
import { hasFirmCapability, type CoachingNoteView, type CoachingTeamSummary, type TeamRadarMember } from '@lawfirm/shared';
import { api, request } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { bangkokDateInputValue } from '@/lib/bangkok';
import { formatDate } from '@/lib/utils';
import { avatarColor } from '@/components/operations/team-radar-helpers';

type Result = { summary: CoachingTeamSummary; notes: CoachingNoteView[] };
export default function CoachingPage() {
  const { token, user, loading } = useAuth();
  const allowed = hasFirmCapability(user?.firmRole, 'runOperations');
  const [result, setResult] = useState<Result | null>(null);
  const [members, setMembers] = useState<TeamRadarMember[]>([]);
  const [person, setPerson] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { if (!token || !allowed) return; api.getTeamRadar(token, bangkokDateInputValue(new Date())).then(r => setMembers(r.members)).catch(() => setError('โหลดรายชื่อสมาชิกไม่สำเร็จ')); }, [token, allowed]);
  useEffect(() => {
    if (!token || !allowed) return;
    let active = true;
    const params = new URLSearchParams(); if (person) params.set('userId', person); if (status) params.set('status', status);
    setResult(null);
    request<Result>(`/coaching?${params}`, { token, silent: true }).then(r => { if (active) setResult(r); }).catch(() => { if (active) setError('โหลดคำแนะนำไม่สำเร็จ กรุณาลองใหม่'); });
    return () => { active = false; };
  }, [token, allowed, person, status]);
  if (!loading && !allowed) return <p>หน้านี้สำหรับผู้ดูแลทีม <Link href="/operations" className="underline">กลับไปภาพรวมงาน</Link></p>;
  return <main className="space-y-6 pb-24"><header><p className="text-sm text-muted-foreground">ภาพรวมงาน / คำแนะนำทีม</p><h1 className="text-3xl font-semibold">คำแนะนำทีม</h1><p className="text-sm text-muted-foreground">บทสนทนาสั้น ๆ ที่ช่วยให้ทีมเติบโตไปด้วยกัน</p></header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {result ? <><section className="rounded-[22px] border border-[var(--terra-border)] bg-[var(--terra-soft-mint)] p-6 shadow-lg"><div className="flex items-center gap-3"><HeartHandshake className="h-12 w-12 rounded-full bg-[var(--terra-mint)] p-3 text-[var(--terra-green-text)]" /><div><h2 className="font-bold">ดูแลทีมอย่างต่อเนื่อง</h2><p className="text-sm text-muted-foreground">ภาพรวมคำแนะนำของเดือนนี้</p></div></div><div className="mt-6 grid grid-cols-3 gap-4">{[[result.summary.sentThisMonth, 'ส่งแล้วเดือนนี้'], [result.summary.awaitingAck, 'รอรับทราบ'], [result.summary.notCoached30d, 'ยังไม่ได้รับคำแนะนำใน 30 วัน']].map(([value, label]) => <div key={label}><b className="text-3xl">{value}</b><p className="text-sm">{label}</p></div>)}</div></section>
    <section className="rounded-[22px] border bg-card p-6 shadow-sm"><div className="flex flex-wrap justify-between gap-4"><div><h2 className="text-lg font-bold">ประวัติคำแนะนำ</h2><p className="text-sm text-muted-foreground">ดูสิ่งที่ส่งไปและการตอบรับจากทีม</p></div><div className="flex flex-wrap gap-3"><label className="text-xs font-bold">สมาชิก<select value={person} onChange={e => setPerson(e.target.value)} className="mt-1 block min-h-11 rounded-xl border bg-card px-3 text-sm"><option value="">ทุกคนในทีม</option>{members.map(m => <option key={m.userId} value={m.userId}>{m.firstName} {m.lastName}</option>)}</select></label><label className="text-xs font-bold">สถานะ<select value={status} onChange={e => setStatus(e.target.value)} className="mt-1 block min-h-11 rounded-xl border bg-card px-3 text-sm"><option value="">ทุกสถานะ</option><option value="pending">รอรับทราบ</option><option value="acknowledged">รับทราบแล้ว</option></select></label></div></div>
    {result.notes.length ? <div className="mt-5 divide-y">{result.notes.map(note => <article key={note.id} className="flex gap-3 py-4"><div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full font-bold ${avatarColor(note.user.id)}`}>{note.user.firstName.slice(0, 1)}</div><div className="min-w-0 flex-1"><div className="flex flex-wrap justify-between gap-2"><div><b>{note.user.firstName} {note.user.lastName}</b><p className="text-xs text-muted-foreground">{note.author.firstName} ส่งเมื่อ {formatDate(note.createdAt)}</p></div><span className={`h-fit rounded-full px-3 py-1 text-xs font-bold ${note.acknowledgedAt ? 'bg-[var(--terra-mint)] text-[var(--terra-green-text)]' : 'bg-[var(--terra-yellow)] text-[var(--terra-yellow-text)]'}`}>{note.acknowledgedAt ? 'รับทราบแล้ว' : 'รอรับทราบ'}</span></div><p className="mt-3 font-bold">{note.nextStep}</p><p className="text-sm">{note.praise}</p>{note.reply && <p className="mt-2 text-sm text-muted-foreground">ตอบกลับ: {note.reply}</p>}</div></article>)}</div> : <div className="py-12 text-center"><div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--terra-peach)] text-[var(--terra-rose-text)]"><HeartHandshake /><Sprout className="absolute -bottom-1 -left-2 rounded-full bg-[var(--terra-mint)] p-1" /><Sparkles className="absolute -right-1 -top-1 rounded-full bg-[var(--terra-yellow)] p-1" /></div><p className="mt-4 font-bold">ยังไม่มีคำแนะนำในรายการนี้</p><p className="text-sm text-muted-foreground">เริ่มส่งคำแนะนำได้จากรายละเอียดสมาชิกในภาพรวมงาน</p></div>}</section></> : !error && <p role="status">กำลังโหลดคำแนะนำ…</p>}
  </main>;
}
