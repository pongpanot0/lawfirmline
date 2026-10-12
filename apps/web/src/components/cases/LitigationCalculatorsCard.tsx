'use client';

import { useState } from 'react';
import { DEFAULT_INTEREST_RATE, courtFee, interestDays, simpleInterest } from '@lawfirm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { MoneyInput } from '@/components/ui/MoneyInput';
import { formatCurrency } from '@/lib/utils';

const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });

/** ค่าขึ้นศาล (ทุกชั้นศาลใช้ตารางเดียวกันกับทุนทรัพย์ที่พิพาท) และดอกเบี้ยอย่างง่าย — ตัวเลขประกอบการตัดสินใจ ไม่ใช่ใบแจ้งหนี้ของศาล */
export function LitigationCalculatorsCard({ claimedAmount }: { claimedAmount: number | null }) {
  const [disputed, setDisputed] = useState(claimedAmount != null ? String(claimedAmount) : '');
  const [principal, setPrincipal] = useState(claimedAmount != null ? String(claimedAmount) : '');
  const [rate, setRate] = useState(String(DEFAULT_INTEREST_RATE));
  const [from, setFrom] = useState('');
  const [to, setTo] = useState(today());

  const disputedValue = disputed.trim() ? Number(disputed) : null;
  const days = from && to ? interestDays(from, to) : 0;
  const rateValue = Number(rate);
  const interest = from && principal.trim() && rate.trim() && Number.isFinite(rateValue) && rateValue >= 0
    ? simpleInterest(Number(principal), rateValue, days)
    : null;

  return (
    <Card data-testid="litigation-calculators">
      <CardHeader><CardTitle className="text-base">คำนวณค่าขึ้นศาลและดอกเบี้ย</CardTitle></CardHeader>
      <CardContent className="space-y-5 text-sm">
        <section className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-muted-foreground">ทุนทรัพย์ที่พิพาท (ชั้นต้น / อุทธรณ์ / ฎีกา ใช้ตารางเดียวกัน)</span>
            <MoneyInput min={0} value={disputed} onValueChange={setDisputed} />
          </label>
          <p>
            ค่าขึ้นศาล: <span className="font-semibold">{disputedValue != null && !Number.isFinite(disputedValue) ? '—' : formatCurrency(courtFee(disputedValue))}</span>
            {disputedValue == null && <span className="text-muted-foreground"> (คดีไม่มีทุนทรัพย์)</span>}
          </p>
          <p className="text-xs text-muted-foreground">ตาราง 1 ท้าย ป.วิ.พ.: ร้อยละ 2 ไม่เกิน 200,000 บาท (ส่วนไม่เกิน 50 ล้าน) + ร้อยละ 0.1 ของส่วนที่เกิน · ไม่รวมคดีจำนอง/บังคับตามคำชี้ขาด/มโนสาเร่</p>
        </section>
        <section className="grid gap-3 border-t border-border pt-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-muted-foreground">เงินต้น (บาท)</span>
            <MoneyInput min={0} value={principal} onValueChange={setPrincipal} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">อัตราดอกเบี้ย (% ต่อปี)</span>
            <Input type="number" min={0} step="0.01" value={rate} onChange={(e) => setRate(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">นับจากวันที่</span>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="block">
            <span className="mb-1 block text-muted-foreground">ถึงวันที่</span>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <p className="sm:col-span-2">
            ดอกเบี้ย {days} วัน: <span className="font-semibold">{interest == null ? '—' : formatCurrency(interest)}</span>
            <span className="block text-xs text-muted-foreground">ค่าเริ่มต้น 5% ต่อปี ตาม ป.พ.พ. ม.224 (แก้ไข 2564: 3% ตาม ม.7 + 2%) · ดอกเบี้ยอย่างง่าย เงินต้น × อัตรา × วัน / 365</span>
          </p>
        </section>
      </CardContent>
    </Card>
  );
}
