'use client';

import { useEffect, useMemo, useState } from 'react';
import type { AddOnKind, BillingUsage } from '@lawfirm/shared';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { savingsPercent } from './usageMath';
import { Modal } from '@/components/ui/misc';

export function AddOnDialog({ type, usage, token, onClose }: { type: 'ai' | 'storage' | null; usage: BillingUsage; token: string; onClose: () => void }) {
  const prices = useMemo(() => usage.prices.filter((p) => type === 'ai' ? p.credits > 0 : p.storageGb > 0), [type, usage.prices]);
  const [selected, setSelected] = useState<AddOnKind | null>(null);
  const [payment, setPayment] = useState<'card' | 'promptpay'>('card');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setSelected(prices[1]?.kind ?? prices[0]?.kind ?? null); setError(''); setPayment('card'); }, [prices]);
  const choice = prices.find((p) => p.kind === selected);
  const unit = (p: typeof prices[number]) => p.priceThb / (type === 'ai' ? p.credits : p.storageGb);
  const checkout = async () => {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try { window.location.href = (await api.checkoutAddOn(token, selected, payment)).url; }
    catch (e) { setError(e instanceof Error ? e.message : 'ไม่สามารถเริ่มการชำระเงินได้'); setBusy(false); }
  };
  return <Modal open={!!type} onClose={onClose} ariaLabel={type === 'ai' ? 'เติมเครดิต AI' : 'เพิ่มพื้นที่เก็บไฟล์'} className="max-w-xl rounded-lg">
    <h2 className="text-xl font-semibold">{type === 'ai' ? 'เติมเครดิต AI' : 'เพิ่มพื้นที่เก็บไฟล์'}</h2>
    <p className="mt-1 border-b pb-4 text-sm text-muted-foreground">{type === 'ai' ? `เหลือ ${usage.ai.remaining?.toLocaleString()} เครดิต · เครดิตที่ซื้อไม่มีวันหมดอายุ` : `ใช้ ${(usage.storage.usedBytes / 1073741824).toFixed(1)} GB จาก ${((usage.storage.limitBytes ?? 0) / 1073741824).toFixed(1)} GB · ใช้ได้ 30 วัน ไม่ตัดบัตรอัตโนมัติ`}</p>
    <fieldset className="mt-4 space-y-2"><legend className="sr-only">เลือกแพ็กเกจ</legend>{prices.map((p) => { const saving = savingsPercent(prices[0].priceThb, type === 'ai' ? prices[0].credits : prices[0].storageGb, p.priceThb, type === 'ai' ? p.credits : p.storageGb); return <label key={p.kind} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors hover:bg-muted/30 ${selected === p.kind ? 'border-primary bg-muted/40 ring-1 ring-primary' : ''}`}><input type="radio" name="addon" className="h-4 w-4 shrink-0 accent-[hsl(var(--primary))]" checked={selected === p.kind} onChange={() => setSelected(p.kind)} /><span className="flex-1 font-medium">{type === 'ai' ? `${p.credits.toLocaleString()} เครดิต` : `+${p.storageGb} GB`} {saving > 0 && <span className="whitespace-nowrap rounded bg-warning/20 px-2 py-1 text-xs">ประหยัด {saving}%</span>}</span><span className="text-right font-semibold tabular-nums">{p.priceThb.toLocaleString()} บาท<span className="block text-xs font-normal text-muted-foreground">{type === 'ai' ? `${unit(p).toFixed(2)} บาท/เครดิต` : `${p.days} วัน`}</span></span></label>; })}</fieldset>
    <p className="border-b py-4 text-sm text-muted-foreground">{type === 'ai' ? 'แชทหรือสรุปงานใช้ 1 เครดิต · อ่านเอกสารสแกนใช้ 1 เครดิตต่อ 2 หน้า' : 'นับรวมไฟล์เอกสารและหลักฐานทั้งหมด · พื้นที่ใช้งานได้ทันทีหลังชำระเงิน'}</p>
    <fieldset className="mt-4"><legend className="mb-2 text-sm font-medium">วิธีชำระเงิน</legend><div className="flex rounded-lg bg-muted p-1">{(['card', 'promptpay'] as const).map((method) => <button key={method} type="button" title={method === 'card' ? 'ชำระด้วยบัตรเครดิต' : 'ชำระด้วยพร้อมเพย์'} onClick={() => setPayment(method)} aria-pressed={payment === method} className={`min-h-11 flex-1 whitespace-nowrap rounded-md px-3 text-sm ${payment === method ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground'}`}>{method === 'card' ? 'บัตรเครดิต' : 'พร้อมเพย์'}</button>)}</div></fieldset>
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    <div className="mt-6 flex justify-end gap-2"><Button title="ยกเลิกการเติม" variant="outline" onClick={onClose}>ยกเลิก</Button><Button title="ไปชำระเงิน" disabled={!choice || busy} onClick={checkout} className="whitespace-nowrap">{busy ? 'กำลังไปหน้าชำระเงิน…' : `ชำระ ${choice?.priceThb.toLocaleString()} บาท`}</Button></div>
  </Modal>;
}
