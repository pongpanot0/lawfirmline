'use client';

import { useState } from 'react';
import { INTAKE_STAGE_ORDER, IntakeStage } from '@lawfirm/shared';
import { AlertTriangle, Check, ChevronRight, Clock } from 'lucide-react';
import { IntakeItem, api } from '@/lib/api';
import { intakeStageLabel, intakeStageOptions } from '@/lib/stage-labels';
import { useLocale } from '@/components/landing/LocaleProvider';
import { Input } from '@/components/ui/input';

/** ค้างในขั้นเดิมนานกว่านี้ถือว่าควรมีคนดู — ตัวเลขนี้เตือน ไม่ได้บังคับอะไร */
const STALE_DAYS = 7;

/**
 * ขั้นตอนของงานรับเรื่อง พร้อมจำนวนวันที่ค้างอยู่ขั้นนี้
 *
 * หน้า intake ตอบคำถามเดียวเป็นหลัก: "เรื่องนี้ค้างอยู่ตรงไหน และนานแค่ไหน"
 * สถานะ (รับ/ไม่รับ/แปลงเป็นคดี) เป็นผลลัพธ์ ไม่ใช่ตำแหน่งในกระบวนการ
 */
export function IntakeStageBar({
  intake,
  token,
  onChanged,
}: {
  intake: IntakeItem;
  token: string;
  onChanged: () => void;
}) {
  const { locale } = useLocale();
  const th = locale === 'th';
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');

  const current = (intake.stage ?? IntakeStage.NEW_INQUIRY) as IntakeStage;
  const currentIndex = INTAKE_STAGE_ORDER.indexOf(current);
  const daysInStage = intake.daysInStage;
  const stale = typeof daysInStage === 'number' && daysInStage >= STALE_DAYS && current !== IntakeStage.CLOSED;

  async function move(stage: string) {
    if (stage === current) return;
    setBusy(true);
    setError('');
    try {
      await api.updateIntakeStage(token, intake.id, stage, note.trim() || undefined);
      setNote('');
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : th ? 'ย้ายขั้นตอนไม่สำเร็จ' : 'Could not move stage');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{th ? 'ขั้นตอนงานรับเรื่อง' : 'Intake stage'}</h3>
        {typeof daysInStage === 'number' && (
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
              stale ? 'bg-destructive/10 text-destructive' : 'bg-muted text-muted-foreground'
            }`}
          >
            {stale ? <AlertTriangle className="h-3.5 w-3.5" aria-hidden /> : <Clock className="h-3.5 w-3.5" aria-hidden />}
            {th ? `ค้างขั้นนี้ ${daysInStage} วัน` : `${daysInStage}d in this stage`}
            {typeof intake.ageDays === 'number' &&
              (th ? ` · อายุเรื่อง ${intake.ageDays} วัน` : ` · ${intake.ageDays}d old`)}
          </span>
        )}
      </div>

      {/* แถบขั้นตอนแบบ pipeline: ขั้นที่ผ่านมีเครื่องหมายถูก ขั้นปัจจุบันเด่น — กดขั้นไหนก็ย้ายได้ ถอยกลับได้ */}
      <div className="mt-3 flex flex-wrap items-center gap-y-1.5">
        {intakeStageOptions(th ? 'th' : 'en').map((option, index) => {
          const isCurrent = option.value === current;
          const passed = index < currentIndex;
          return (
            <span key={option.value} className="flex items-center">
              {index > 0 && <ChevronRight className="mx-0.5 h-3.5 w-3.5 text-muted-foreground/60" aria-hidden />}
              <button
                type="button"
                disabled={busy}
                onClick={() => move(option.value)}
                aria-current={isCurrent ? 'step' : undefined}
                className={`inline-flex min-h-11 items-center rounded-full px-3 py-1 text-xs transition-colors sm:min-h-8 ${
                  isCurrent
                    ? 'bg-primary font-semibold text-primary-foreground'
                    : passed
                      ? 'border border-primary/30 bg-primary/5 font-medium text-primary'
                      : 'border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground'
                }`}
              >
                {passed && <Check className="mr-1 h-3.5 w-3.5" aria-hidden />}
                {option.label}
              </button>
            </span>
          );
        })}
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={th ? 'บันทึกเหตุผลที่ย้ายขั้น (ไม่บังคับ)' : 'Note for the move (optional)'}
          aria-label={th ? 'เหตุผลที่ย้ายขั้น' : 'Note for the move'}
          className="max-w-md"
        />
        <span className="text-xs text-muted-foreground">
          {th ? `ขั้นปัจจุบัน: ${intakeStageLabel(current, 'th')}` : `Now: ${intakeStageLabel(current, 'en')}`}
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-destructive">{error}</p>}
      {busy && <p role="status" className="mt-2 text-xs text-muted-foreground">{th ? 'กำลังย้ายขั้น...' : 'Moving stage...'}</p>}
    </div>
  );
}
