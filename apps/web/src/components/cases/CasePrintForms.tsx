'use client';

import { useEffect, useRef, useState } from 'react';
import { api, type CaseDetail, type CourtItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { buildCasePrintHtml, casePrintDefaults, CASE_PRINT_LABELS, type CasePrintKind } from '@/lib/case-print-forms';
import { Button } from '@/components/ui/button';

const COMMON = [['blackNumber', 'หมายเลขคดีดำ'], ['redNumber', 'หมายเลขคดีแดง'], ['court', 'ศาล'], ['plaintiff', 'โจทก์'], ['defendant', 'จำเลย'], ['jointDefendant', 'จำเลยร่วม'], ['subject', 'เรื่อง / ข้อหาหรือฐานความผิด'], ['amount', 'ทุนทรัพย์ (บาท)']];
const COVER = [['firmName', 'ชื่อสำนักงานภาษาไทย'], ['firmEnglish', 'ชื่อสำนักงานภาษาอังกฤษ'], ['ownRef', 'เลขอ้างอิงสำนักงาน'], ['policyNumber', 'เลขกรมธรรม์'], ['lawyerSide', 'ทนายฝ่าย'], ['filedDate', 'วันฟ้อง'], ['answerDate', 'วันให้การ'], ['counterclaimDate', 'วันฟ้องแย้ง'], ['mediationDate', 'ไกล่เกลี่ย / ให้การ / สืบพยาน'], ['settlementDate', 'นัดชี้สองสถาน / สืบโจทก์']];
const LATER = [['closingDate', 'วันแถลงปิดคดี'], ['judgmentDate', 'วันตัดสิน'], ['appealDate', 'วันอุทธรณ์'], ['appealAnswerDate', 'วันแก้อุทธรณ์'], ['appealJudgmentDate', 'วันฟังคำพิพากษาศาลอุทธรณ์'], ['supremeDate', 'วันฎีกา'], ['supremeAnswerDate', 'วันแก้ฎีกา'], ['supremeJudgmentDate', 'วันฟังคำพิพากษาศาลฎีกา']];
const COMPLAINT = [['complaintDate', 'วันที่คำฟ้อง (พ.ศ.)'], ['caseClass', 'ความแพ่ง / อาญา'], ['plaintiffIdentity', 'โจทก์: เชื้อชาติ สัญชาติ อาชีพ อายุ เลขประจำตัว'], ['plaintiffAddress', 'ที่อยู่โจทก์'], ['plaintiffContact', 'โทรศัพท์ โทรสาร อีเมลโจทก์'], ['contactAddress', 'สถานที่ติดต่อ'], ['contactDetails', 'โทรศัพท์ โทรสาร อีเมลสำหรับติดต่อ'], ['defendantIdentity', 'จำเลย: เชื้อชาติ สัญชาติ อาชีพ อายุ เลขประจำตัว'], ['defendantAddress', 'ที่อยู่จำเลย'], ['defendantContact', 'โทรศัพท์ โทรสาร อีเมลจำเลย'], ['lawyerName', 'ชื่อทนายใต้ช่องลงลายมือชื่อ']];

export function CasePrintForms({ legalCase }: { legalCase: CaseDetail }) {
  const { user, token } = useAuth();
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const preview = useRef<HTMLIFrameElement>(null);
  const previewBox = useRef<HTMLDivElement>(null);
  const prepared = useRef('');
  const [scale, setScale] = useState(1);
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<CasePrintKind>('cover');
  const [values, setValues] = useState(() => casePrintDefaults(legalCase, user?.firmName ?? ''));
  const [images, setImages] = useState({ cover: '', complaint: '' });
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const html = buildCasePrintHtml(kind, values, images[kind]);

  useEffect(() => {
    if (open) dialog.current?.showModal();
    else dialog.current?.close();
  }, [open]);

  useEffect(() => {
    const box = previewBox.current;
    if (!open || !box) return;
    const observer = new ResizeObserver(() => setScale(Math.min(1, box.clientWidth / 794)));
    observer.observe(box);
    return () => observer.disconnect();
  }, [open]);

  const update = (key: string, value: string) => {
    setReady(false);
    setValues(previous => ({ ...previous, [key]: value }));
  };
  const fields = (items: string[][]) => <div className="grid gap-3 sm:grid-cols-2">{items.map(([key, label]) => <label key={key} className="block text-sm">{label}{key === 'court' ? <select className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={values.court} onChange={e => update(key, e.target.value)}><option value="">เลือกศาล</option>{values.court && !courts.some(c => c.name === values.court) && <option value={values.court}>{values.court}</option>}{courts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}</select> : <input className="mt-1 min-h-10 w-full rounded-md border border-input bg-background px-3 py-2" value={values[key] ?? ''} maxLength={500} onChange={e => update(key, e.target.value)} />}</label>)}</div>;

  return <>
    <Button variant="outline" className="min-h-11" disabled={loading} onClick={async () => {
      setLoading(true); setLoadError('');
      let current = legalCase;
      if (token) {
        const [caseResult, courtResult] = await Promise.allSettled([api.getCase(token, legalCase.id), api.getCourts(token)]);
        if (caseResult.status === 'fulfilled') current = caseResult.value;
        if (courtResult.status === 'fulfilled') setCourts(courtResult.value);
        if (caseResult.status === 'rejected' || courtResult.status === 'rejected') setLoadError('โหลดข้อมูลล่าสุดหรือรายชื่อศาลไม่สำเร็จ แสดงข้อมูลที่มีอยู่ กรุณาปิดแล้วเปิดใหม่เพื่อลองอีกครั้ง');
      }
      const defaults = casePrintDefaults(current, user?.firmName ?? '');
      const signature = JSON.stringify(defaults);
      if (prepared.current !== signature) { setValues(defaults); prepared.current = signature; }
      setReady(false); setOpen(true); setLoading(false);
    }}>{loading ? 'กำลังเติมข้อมูลคดี…' : 'ส่งออกคำฟ้อง / ปกสำนวน'}</Button>
    <dialog ref={dialog} aria-labelledby="case-print-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)} className="m-auto max-h-[95dvh] w-[min(1200px,96vw)] max-w-none overflow-y-auto rounded-xl border border-border bg-card p-0 text-foreground backdrop:bg-black/50">
      {open && <>
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 border-b bg-card p-4">
          <div><h2 id="case-print-title" className="font-semibold">จัดทำคำฟ้องและปกสำนวน</h2><p className="text-xs text-muted-foreground">ตรวจแก้ → ดูตัวอย่าง A4 → พิมพ์และเลือกบันทึกเป็น PDF</p></div>
          <div className="flex gap-2"><Button disabled={!ready} onClick={() => { preview.current?.contentWindow?.focus(); preview.current?.contentWindow?.print(); }}>พิมพ์ / บันทึก PDF</Button><Button variant="outline" onClick={() => setOpen(false)}>ปิด</Button></div>
        </header>
        <div className="space-y-3 p-4">
          <div role="group" aria-label="ชนิดเอกสาร" className="flex flex-wrap gap-2">{(['cover', 'complaint'] as const).map(type => <Button key={type} variant={kind === type ? 'default' : 'outline'} aria-pressed={kind === type} onClick={() => { if (kind !== type) { setReady(false); setKind(type); } }}>{CASE_PRINT_LABELS[type]}</Button>)}</div>
          <p className="text-sm text-muted-foreground">เติมข้อมูลจากคดีและคู่ความให้อัตโนมัติแล้ว ช่องที่ไม่มีข้อมูลจะเว้นว่าง ข้อมูลที่แก้ใช้จัดพิมพ์ครั้งนี้เท่านั้น ไม่เปลี่ยนข้อมูลคดี และจะหายเมื่อโหลดหน้าใหม่ วันที่กรอกเป็น พ.ศ. ได้โดยตรง</p>
          {loadError && <p role="alert" className="text-sm text-destructive">{loadError}</p>}
          <p className="text-sm text-muted-foreground">ตั้งค่าพิมพ์: A4 แนวตั้ง ขนาด 100% ปิดหัวและท้ายกระดาษ แบบจัดหน้าอ้างอิงภาพตัวอย่าง ยังไม่ใช่ไฟล์แบบฟอร์มศาลต้นฉบับ</p>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(280px,1fr)_minmax(0,1.3fr)]">
            <div className="space-y-5">
              <section className="space-y-3"><h3 className="font-medium">ข้อมูลคดีและคู่ความ</h3>{fields(COMMON)}</section>
              <section className="space-y-3"><h3 className="font-medium">{CASE_PRINT_LABELS[kind]}</h3>{fields(kind === 'cover' ? COVER : COMPLAINT)}</section>
              {kind === 'complaint' ? <label className="block text-sm">ข้อความเริ่มต้นคำฟ้องในหน้าแรก<textarea rows={5} maxLength={4000} value={values.firstParagraph} onChange={e => update('firstParagraph', e.target.value)} className="mt-1 w-full rounded-md border border-input bg-background p-3" /><span className="text-xs text-muted-foreground">ใช้ข้อความที่ทนายจัดทำ ระบบไม่แต่งข้อเท็จจริงหรือใส่ลายเซ็นให้</span></label> : <>
                <details><summary className="cursor-pointer font-medium">นัดพิจารณา 1–12</summary><div className="mt-3">{fields(Array.from({ length: 12 }, (_, i) => [`hearing${i + 1}`, `นัดพิจารณา ${i + 1}`]))}</div></details>
                <details><summary className="cursor-pointer font-medium">วันตัดสิน อุทธรณ์ และฎีกา</summary><div className="mt-3">{fields(LATER)}</div></details>
              </>}
              <label className="block text-sm">{kind === 'cover' ? 'โลโก้สำนักงาน' : 'ภาพตราครุฑจากแบบฟอร์มต้นฉบับ'} (PNG / JPEG ไม่เกิน 2 MB)<input type="file" accept="image/png,image/jpeg" className="mt-2 block w-full text-sm" onChange={async e => {
                const file = e.target.files?.[0];
                const targetKind = kind;
                e.target.value = '';
                if (!file) return;
                if (!['image/png', 'image/jpeg'].includes(file.type) || file.size > 2 * 1024 * 1024) { setError('เลือก PNG หรือ JPEG ขนาดไม่เกิน 2 MB'); return; }
                try {
                  const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
                  setReady(false); setImages(previous => ({ ...previous, [targetKind]: data }));
                } catch { setError('อ่านภาพไม่สำเร็จ กรุณาเลือกไฟล์อีกครั้ง'); }
              }} /><span className="mt-1 block text-xs text-muted-foreground">ภาพใช้ในเครื่องสำหรับจัดพิมพ์เท่านั้น ไม่ได้อัปโหลด รูปถ่ายตัวอย่างไม่ถูกนำมาใส่เป็นพื้นหลัง</span></label>
              {images[kind] && <Button variant="outline" onClick={() => { setReady(false); setImages(previous => ({ ...previous, [kind]: '' })); }}>นำภาพออก</Button>}
            </div>
            <section className="min-w-0 space-y-2"><h3 className="font-medium">ตัวอย่างก่อนส่งออก</h3><div ref={previewBox} className="overflow-hidden rounded-md border bg-white" style={{ height: 1123 * scale }}><iframe key={kind} ref={preview} title={`ตัวอย่าง ${CASE_PRINT_LABELS[kind]}`} srcDoc={html} sandbox="allow-same-origin allow-modals" className="h-[1123px] w-[794px] max-w-none origin-top-left border-0" style={{ transform: `scale(${scale})` }} onLoad={async () => {
              const doc = preview.current?.contentDocument;
              if (!doc) return;
              await doc.fonts.ready;
              if (preview.current?.contentDocument !== doc) return;
              const sheet = doc.querySelector('.sheet');
              const fits = !!sheet && sheet.getBoundingClientRect().height <= 1124 && sheet.scrollWidth <= 795;
              setReady(fits);
              setError(fits ? '' : 'ข้อความเกินหน้า A4 กรุณาย่อข้อความในหน้าแรกก่อนส่งออก เพื่อไม่ให้เอกสารถูกตัด');
            }} /></div></section>
          </div>
        </div>
      </>}
    </dialog>
  </>;
}
