'use client';

import { useEffect, useState } from 'react';
import type { BillingUsage } from '@lawfirm/shared';
import { HardDrive, Layers, Sparkles } from 'lucide-react';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { nextBangkokMonth } from './usageMath';
import { AddOnDialog } from './AddOnDialog';

const gb = (bytes: number) => (bytes / 1073741824).toFixed(1);
const date = (value: string | Date) => new Date(value).toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });

function Meter({ value, max, label }: { value: number; max: number; label: string }) { return <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={max} aria-valuenow={Math.min(value, max)} className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${max > 0 ? Math.min(100, Math.max(0, value / max * 100)) : 0}%` }} /></div>; }
export function BillingUsageSection({ token, owner, initialTopup, returned }: { token: string; owner: boolean; initialTopup: boolean; returned: boolean }) {
  const [usage, setUsage] = useState<BillingUsage | null>(null);
  const [error, setError] = useState('');
  const [dialog, setDialog] = useState<'ai' | 'storage' | null>(null);
  useEffect(() => { if (!token) return; api.getBillingUsage(token).then((data) => { setUsage(data); if (initialTopup && owner && !data.ai.unlimited) setDialog('ai'); }).catch((e) => setError(e instanceof Error ? e.message : 'โหลดการใช้งานไม่สำเร็จ')); }, [token, initialTopup, owner, returned]);
  if (error) return <p role="alert" className="text-destructive">{error}</p>;
  if (!usage) return <p role="status">กำลังโหลดการใช้งาน...</p>;
  const { ai, storage } = usage;
  return <section className="space-y-5" aria-labelledby="usage-heading">
    {returned && <div role="status" className="rounded-lg border border-success/30 bg-success/10 p-3 text-success">กลับจากการชำระเงินแล้ว ข้อมูลการใช้งานล่าสุดแสดงด้านล่าง</div>}
    {(!ai.unlimited || !storage.unlimited) && <><h2 id="usage-heading" className="text-lg font-semibold">การใช้งาน</h2><div className="grid gap-4 md:grid-cols-2">
      {!ai.unlimited && <div className="rounded-lg border bg-card p-5"><h3 className="flex items-center gap-2 border-b pb-3 font-semibold"><Sparkles aria-hidden className="h-4 w-4" />เครดิต AI</h3><p className="mt-4"><strong className="text-3xl tabular-nums">{ai.remaining?.toLocaleString()}</strong> <span className="text-sm text-muted-foreground">เครดิตคงเหลือ</span></p><Meter label="เครดิตจากแพ็กเกจที่เหลือ" value={ai.planRemaining ?? 0} max={ai.planQuota ?? 0} /><div className="mt-4 space-y-2 border-y py-3 text-sm"><p className="flex justify-between gap-3"><span>จากแพ็กเกจ ({ai.period === 'MONTH' ? `รีเซ็ต ${date(nextBangkokMonth(new Date()))}` : 'ทดลองใช้ฟรี'})</span><span>ใช้ไป {ai.planUsed.toLocaleString()} จาก {ai.planQuota?.toLocaleString()}</span></p><p className="flex justify-between gap-3"><span>ที่ซื้อเพิ่ม (ไม่มีวันหมดอายุ)</span><span>เหลือ {ai.packRemaining.toLocaleString()}</span></p></div><p className="my-4 text-xs text-muted-foreground">แชทหรือสรุปงานใช้ 1 เครดิต · อ่านเอกสารสแกนใช้ 1 เครดิตต่อ 2 หน้า</p>{owner ? <><Button title="เลือกแพ็กเกจเครดิต AI" className="w-full whitespace-nowrap" onClick={() => setDialog('ai')}>เติมเครดิต AI</Button><p className="mt-2 text-center text-xs text-muted-foreground">จ่ายครั้งเดียว ใช้หลังเครดิตแพ็กเกจหมด</p></> : <p className="text-sm">ติดต่อเจ้าของสำนักงานเพื่อเติมเครดิต</p>}</div>}
      {!storage.unlimited && <div className="rounded-lg border bg-card p-5"><h3 className="flex items-center gap-2 border-b pb-3 font-semibold"><HardDrive aria-hidden className="h-4 w-4" />พื้นที่เก็บไฟล์</h3><p className="mt-4"><strong className="text-3xl tabular-nums">{gb(storage.usedBytes)} GB</strong> <span className="text-sm text-muted-foreground">จาก {gb(storage.limitBytes ?? 0)} GB</span></p><Meter label="พื้นที่ที่ใช้ไป" value={storage.usedBytes} max={storage.limitBytes ?? 0} /><div className="mt-4 space-y-2 border-y py-3 text-sm"><p className="flex justify-between"><span>จากแพ็กเกจ</span><span>{storage.planGb.toFixed(1)} GB</span></p><p className="flex justify-between"><span>ซื้อเพิ่ม</span><span>{storage.addOnGb.toFixed(1)} GB</span></p></div><p className="my-4 text-xs text-muted-foreground">นับรวมไฟล์เอกสารและหลักฐานทุกคดี</p>{owner ? <><Button title="เลือกแพ็กเกจพื้นที่เก็บไฟล์" variant="outline" className="w-full whitespace-nowrap" onClick={() => setDialog('storage')}>เพิ่มพื้นที่</Button><p className="mt-2 text-center text-xs text-muted-foreground">ใช้ได้ 30 วัน ไม่ตัดบัตรอัตโนมัติ</p></> : <p className="text-sm">ติดต่อเจ้าของสำนักงานเพื่อเพิ่มพื้นที่</p>}</div>}
    </div></>}
    <div className="overflow-hidden rounded-lg border bg-card"><h2 className="flex items-center gap-2 border-b p-4 font-semibold"><Layers aria-hidden className="h-4 w-4" />รายการที่ซื้อเพิ่ม</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-muted-foreground"><tr><th className="p-3">รายการ</th><th className="p-3">จำนวนเงิน</th><th className="p-3">วันที่ซื้อ</th><th className="p-3">หมดอายุ</th></tr></thead><tbody>{usage.addOns.filter((item) => !(ai.unlimited && item.credits)).map((item, i) => <tr className="border-t" key={`${item.createdAt}-${i}`}><td className="p-3">{item.credits ? `เครดิต AI +${item.credits.toLocaleString()}` : `พื้นที่ +${item.storageGb} GB`}</td><td className="p-3 whitespace-nowrap">{item.amountThb.toLocaleString()} บาท</td><td className="p-3 whitespace-nowrap">{date(item.createdAt)}</td><td className="p-3 whitespace-nowrap">{item.expiresAt ? date(item.expiresAt) : 'ไม่มีวันหมดอายุ'}</td></tr>)}{!usage.addOns.filter((item) => !(ai.unlimited && item.credits)).length && <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">ยังไม่มีรายการที่ซื้อเพิ่ม</td></tr>}</tbody></table></div></div>
    {owner && <AddOnDialog type={dialog} usage={usage} token={token} onClose={() => setDialog(null)} />}
  </section>;
}
