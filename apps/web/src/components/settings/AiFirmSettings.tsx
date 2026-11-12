'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import type { FirmMcpConnection, McpFirmSettings } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { confirmDialog } from '@/lib/confirm-dialog';
import { formatDate } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function AiFirmSettings() {
  const { token } = useAuth();
  const [settings, setSettings] = useState<McpFirmSettings | null>(null);
  const [connections, setConnections] = useState<FirmMcpConnection[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!token) return;
    try { const [s, c] = await Promise.all([api.getMcpSettings(token), api.getFirmMcpConnections(token)]); setSettings(s); setConnections(c); setError(''); }
    catch { setError('โหลดการตั้งค่า AI ไม่สำเร็จ ลองใหม่อีกครั้ง'); }
  }, [token]);
  useEffect(() => { void load(); }, [load]);
  const toggle = async () => {
    if (!token || !settings) return;
    if (settings.enabled && !await confirmDialog(`ปิดการเชื่อมต่อ AI ทั้งสำนักงาน?\nการเชื่อมต่อ ${connections.length} รายการจะถูกตัดทันที ทนายต้องเชื่อมต่อใหม่เมื่อเปิดอีกครั้ง`, { action: 'ปิดและตัดการเชื่อมต่อ', cancel: 'ไม่ปิด', danger: true })) return;
    setBusy(true);
    try { await api.setMcpSettings(token, !settings.enabled); await load(); }
    catch { setError('เปลี่ยนการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setBusy(false); }
  };
  const revoke = async (c: FirmMcpConnection) => {
    if (!token || !await confirmDialog(`ยกเลิกการเชื่อมต่อ ${c.clientName} ของ ${c.user.firstName} ${c.user.lastName}?\n${c.clientName} จะอ่านหรือบันทึกข้อมูลใน Samnuan ไม่ได้อีก ถ้าต้องการใช้ต่อต้องเชื่อมต่อใหม่`, { action: 'ยกเลิกการเชื่อมต่อ', cancel: 'ไม่ยกเลิก', danger: true })) return;
    setBusy(true);
    try { await api.revokeFirmMcpConnection(token, c.id); await load(); }
    catch { setError('ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setBusy(false); }
  };
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" aria-hidden />AI ของทนาย (Claude, Codex)</CardTitle><p className="text-sm text-muted-foreground">ให้ทนายในสำนักงานใช้ AI ของตัวเองทำงานกับคดี — แต่ละคนเห็นเฉพาะคดีที่ตัวเองรับผิดชอบหรือมีงานอยู่ รวมถึงเจ้าของสำนักงานและผู้ดูแล</p></CardHeader><CardContent className="space-y-6">
    {error && <p role="alert" className="text-destructive">{error} <button onClick={() => void load()} className="underline">ลองใหม่อีกครั้ง</button></p>}
    {!settings ? <p>กำลังโหลดการตั้งค่า...</p> : <><div className="flex flex-wrap items-start justify-between gap-4 rounded-lg border p-4"><div><h3 className="font-semibold">อนุญาตให้ทนายเชื่อมต่อ AI ของตัวเอง</h3><p className="mt-1 text-sm text-muted-foreground">ข้อมูลคดีที่ AI อ่านจะส่งไปยังผู้ให้บริการ AI ของแต่ละคน</p><p className="text-sm text-muted-foreground">ปิดเมื่อไรจะตัดการเชื่อมต่อทุกคนทันที</p></div><div className="flex items-center gap-2"><span>{settings.enabled ? 'เปิดอยู่' : 'ปิดอยู่'}</span><button type="button" role="switch" aria-checked={settings.enabled} aria-label="อนุญาตให้ทนายในสำนักงานเชื่อมต่อ AI ของตัวเอง" disabled={busy} onClick={() => void toggle()} className={`relative h-11 w-14 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${settings.enabled ? 'bg-primary' : 'bg-muted-foreground'}`}><span className={`absolute top-2 h-7 w-7 rounded-full bg-background transition-transform ${settings.enabled ? 'translate-x-0' : '-translate-x-6'}`} /></button></div></div>
    <div><h3 className="text-lg font-semibold">ผู้ที่เชื่อมต่ออยู่ ({connections.length})</h3><p className="mb-3 text-sm text-muted-foreground">ยกเลิกรายคนได้เมื่อทนายลาออกหรือเครื่องหาย — AI ของคนนั้นจะเข้าถึงข้อมูลไม่ได้ทันที</p>{connections.length === 0 ? <p>ยังไม่มีทนายเชื่อมต่อ — ส่งลิงก์ ตั้งค่า › การเชื่อมต่อ ให้ทีมเพื่อเริ่มใช้</p> : <div className="overflow-x-auto"><table className="hidden w-full text-left text-sm md:table"><thead><tr className="border-b"><th className="p-3">ทนาย</th><th>แอป</th><th>เชื่อมต่อเมื่อ</th><th>ใช้ล่าสุด</th><th>การจัดการ</th></tr></thead><tbody>{connections.map(c => <tr className="border-b" key={c.id}><td className="p-3"><span className="mr-2 inline-flex h-9 w-9 items-center justify-center rounded-full bg-muted">{c.user.firstName.slice(0, 1)}</span><span className="inline-block align-middle"><strong>{c.user.firstName} {c.user.lastName}</strong><br /><span className="text-muted-foreground">{c.user.email}</span></span></td><td>{c.clientName}</td><td>{formatDate(c.createdAt)}</td><td>{c.lastUsedAt ? formatDate(c.lastUsedAt) : 'ยังไม่เคยใช้'}</td><td><Button variant="outline" disabled={busy} aria-label={`ยกเลิกการเชื่อมต่อ ${c.clientName} ของ ${c.user.firstName} ${c.user.lastName}`} onClick={() => void revoke(c)}>ยกเลิกการเชื่อมต่อ</Button></td></tr>)}</tbody></table><ul className="divide-y md:hidden">{connections.map(c => <li key={c.id} className="space-y-2 py-4"><p className="font-semibold">{c.user.firstName} {c.user.lastName}</p><p className="text-sm text-muted-foreground">{c.user.email}</p><p>{c.clientName} · เชื่อมต่อเมื่อ {formatDate(c.createdAt)} · ใช้ล่าสุด {c.lastUsedAt ? formatDate(c.lastUsedAt) : 'ยังไม่เคยใช้'}</p><Button variant="outline" disabled={busy} aria-label={`ยกเลิกการเชื่อมต่อ ${c.clientName} ของ ${c.user.firstName} ${c.user.lastName}`} onClick={() => void revoke(c)}>ยกเลิกการเชื่อมต่อ</Button></li>)}</ul></div>}<Link className="mt-4 inline-flex min-h-11 items-center text-primary underline" href="/admin/audit-log">ดูสิ่งที่ AI บันทึกในประวัติการใช้งาน</Link></div></>}
  </CardContent></Card>;
}
