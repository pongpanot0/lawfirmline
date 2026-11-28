'use client';

import { Fragment, useEffect, useRef, useState, type ChangeEvent, type ReactNode } from 'react';
import { ArrowRight, ChevronDown, Copy, Info } from 'lucide-react';
import {
  COURT_FEE_RULE_VERSION,
  ENFORCEMENT_FEE_RULE_VERSION,
  CourtLevel,
  estimateCourtFee,
  estimateEnforcementFee,
  type CourtFeeCaseKind,
  type EnforcementEvent,
} from '@lawfirm/shared';

const caseGroups: { label: string; kinds: [CourtFeeCaseKind, string][]; needsAmount: boolean }[] = [
  {
    label: 'มีทุนทรัพย์',
    needsAmount: true,
    kinds: [
      ['GENERAL', 'คำฟ้องคดีแพ่งทั่วไป'],
      ['MORTGAGE', 'บังคับจำนองหรือเอาทรัพย์จำนองหลุด'],
      ['ARBITRATION_DOMESTIC', 'คำชี้ขาดอนุญาโตตุลาการในประเทศ'],
      ['ARBITRATION_FOREIGN', 'คำชี้ขาดอนุญาโตตุลาการต่างประเทศ'],
      ['SMALL_CLAIM', 'คดีมโนสาเร่'],
      ['MIXED', 'มีคำขอทั้งเป็นเงินและไม่เป็นเงิน'],
      ['ADMIN', 'ศาลปกครอง คำขอให้ชดใช้เงิน'],
    ],
  },
  {
    label: 'อัตราคงที่',
    needsAmount: false,
    kinds: [
      ['NON_MONETARY', 'คำขอที่ประเมินเป็นเงินไม่ได้'],
      ['BANKRUPTCY', 'ฟ้องให้ล้มละลาย'],
    ],
  },
  {
    label: 'ได้รับยกเว้น',
    needsAmount: false,
    kinds: [
      ['CONSUMER', 'คดีผู้บริโภค (ผู้บริโภคเป็นผู้ฟ้อง)'],
      ['LABOUR', 'คดีแรงงาน'],
    ],
  },
];

const courtLevels: [CourtLevel, string][] = [
  [CourtLevel.TRIAL, 'ชั้นต้น'],
  [CourtLevel.APPEAL, 'อุทธรณ์'],
  [CourtLevel.SUPREME, 'ฎีกา'],
];

const events = {
  SALE: { label: 'ขายทอดตลาดหรือจำหน่ายทรัพย์', base: 'เงินที่ขายได้', hint: 'เงินที่ขายได้' },
  PAYOUT: { label: 'จ่ายเงินที่ยึดหรืออายัดให้เจ้าหนี้', base: 'เงินที่ยึดหรืออายัด', hint: 'เงินที่ยึดหรืออายัด' },
  BID: { label: 'ประมูลระหว่างคู่ความ', base: 'ราคาประมูลสูงสุด', hint: 'ราคาสูงสุด' },
  NO_SALE: { label: 'ยึดหรืออายัดแล้วไม่มีการขาย', base: '', hint: '' },
} satisfies Record<EnforcementEvent, { label: string; base: string; hint: string }>;
const enforcementEvents = (Object.keys(events) as EnforcementEvent[]).map((event) => ({
  event,
  ...events[event],
  rate: estimateEnforcementFee({ event }).rate,
}));

const tabs = [
  { id: 'court', label: 'ค่าขึ้นศาล', hint: 'ตามประเภทคดี' },
  { id: 'enforcement', label: 'ค่าบังคับคดี', hint: 'ตามเหตุการณ์' },
] as const;

const examples = [
  { kind: 'GENERAL', amount: 1_000_000, label: 'คดีแพ่ง', method: '2% ของ 1,000,000' },
  { kind: 'GENERAL', amount: 20_000_000, label: 'คดีแพ่ง', method: '2% ได้ 400,000 แต่เพดานส่วนแรก 200,000' },
  { kind: 'GENERAL', amount: 60_000_000, label: 'คดีแพ่ง', method: '200,000 + 0.1% ของ 10,000,000 (ส่วนที่เกิน 50 ล้านบาท)' },
  { kind: 'SMALL_CLAIM', amount: 80_000, label: 'คดีมโนสาเร่', method: '2% ได้ 1,600 แต่ชั้นต้นเก็บไม่เกิน 1,000' },
] satisfies { kind: CourtFeeCaseKind; amount: number; label: string; method: string }[];

const courtLabel = 'ค่าขึ้นศาลโดยประมาณ';
const enforcementLabel = 'ค่าธรรมเนียมบังคับคดีโดยประมาณ';
const courtSource = `อ้างอิง ${COURT_FEE_RULE_VERSION.replace('· ตรวจ ', '· ตรวจอัตราล่าสุด ')}`;
const enforcementSource = `อ้างอิง ${ENFORCEMENT_FEE_RULE_VERSION}`;
const enforcementNote =
  'อัตราใหม่ตาม ป.วิ.พ. ฉบับที่ 33 มีผล 10 ก.ย. 2568 ยังไม่รวมค่าประกาศ ค่าใช้สอย และเงินทดรองที่เจ้าพนักงานเรียกเก็บ';

const baht = (amount: number) => amount.toLocaleString('th-TH');
const toAmount = (digits: string) => digits === '' ? undefined : Number(digits);
const formatAmount = (digits: string) => digits === '' ? '' : baht(Number(digits));
const control = 'mt-1 block min-h-11 w-full rounded-lg border border-mk-rule bg-mk-paper px-3 py-2';
const fieldLabel = 'block whitespace-nowrap text-sm leading-[1.6] font-semibold';
const fieldHelp = 'mt-1 text-xs leading-[1.6] text-mk-ink-2';
const panel = 'grid items-start gap-4 p-4 md:grid-cols-2 md:gap-8 md:p-6';
const hint = 'mt-1 block whitespace-nowrap text-xs leading-[1.5] text-mk-ink-2';
const resultNote = 'mt-3 flex items-start gap-2 text-[13px] text-mk-ink-2';
const noteIcon = 'mt-[3px] size-[18px] shrink-0';
const button = 'inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 py-2 text-sm leading-[1.6] font-semibold';
const totalCell = 'whitespace-nowrap font-semibold tabular-nums md:text-end';
const exampleHint = 'ใส่ตัวเลขนี้ในเครื่องคิดด้านบน';

function AmountField({ id, label, digits, onChange, help }: {
  id: string;
  label: string;
  digits: string;
  onChange: (digits: string) => void;
  help?: string;
}) {
  function changeAmount(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const digitsAfterCaret = input.value.slice(input.selectionStart ?? input.value.length).replace(/\D/g, '').length;
    const nextDigits = input.value.replace(/\D/g, '').slice(0, 15);
    const formatted = formatAmount(nextDigits);
    if (input.value !== formatted) {
      input.value = formatted;
      let caret = formatted.length;
      let remaining = digitsAfterCaret;
      while (caret > 0 && remaining > 0) {
        caret -= 1;
        if (formatted[caret] !== ',') remaining -= 1;
      }
      input.setSelectionRange(caret, caret);
    }
    onChange(nextDigits);
  }

  return (
    <div>
      <label htmlFor={id} className={fieldLabel}>{label}</label>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={help ? `${id}-hint` : undefined}
        className={`${control} text-lg leading-[1.6] tabular-nums`}
        value={formatAmount(digits)}
        onChange={changeAmount}
      />
      {help && <p id={`${id}-hint`} className={fieldHelp}>{help}</p>}
    </div>
  );
}

function Result({ label, fee, source, children }: {
  label: string;
  fee: number;
  source: string;
  children?: ReactNode;
}) {
  const formattedFee = baht(fee);
  return (
    <div className="min-w-0 rounded-lg bg-mk-sunk p-4 md:p-6">
      <div role="status" aria-atomic="true">
        <p className="text-sm leading-[1.6] font-medium text-mk-ink-2">{label}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className={`font-display leading-[1.16] font-semibold text-mk-brass tabular-nums [overflow-wrap:anywhere] ${
            formattedFee.length > 10 ? 'text-[clamp(1.5rem,4vw,2.5rem)]' : 'text-[clamp(2.25rem,5vw,3.5rem)]'
          }`}>{formattedFee}</span>
          <span className="text-sm leading-[1.6]">บาท</span>
        </p>
      </div>
      {children}
      <p className="mt-3 border-t border-mk-rule pt-3 text-xs leading-[1.6] text-mk-ink-2">{source}</p>
    </div>
  );
}

export function CourtFeeTool() {
  const [activeTab, setActiveTab] = useState(0);
  const [kind, setKind] = useState<CourtFeeCaseKind>('GENERAL');
  const [level, setLevel] = useState<CourtLevel>(CourtLevel.TRIAL);
  const [claim, setClaim] = useState('1500000');
  const [event, setEvent] = useState<EnforcementEvent>('SALE');
  const [amount, setAmount] = useState('');
  const [copyStatus, setCopyStatus] = useState<'copied' | 'failed' | null>(null);
  const calculator = useRef<HTMLElement>(null);
  const tabButtons = useRef<(HTMLButtonElement | null)[]>([]);
  const copyRequest = useRef(0);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => {
    copyRequest.current += 1;
    clearTimeout(copyTimer.current);
  }, []);

  const needsClaim = caseGroups.some((group) => group.needsAmount && group.kinds.some(([value]) => value === kind));
  const claimAmount = needsClaim ? toAmount(claim) : undefined;
  const enforcementAmount = event === 'NO_SALE' ? undefined : toAmount(amount);
  const court = estimateCourtFee({ kind, level, claimAmount });
  const enforcement = estimateEnforcementFee({ event, amount: enforcementAmount });
  const eventCopy = events[event];
  const copied = copyStatus === 'copied';
  const copyError = 'คัดลอกไม่ได้ ลองเลือกข้อความเอง';

  function activateTab(index: number) {
    copyRequest.current += 1;
    clearTimeout(copyTimer.current);
    setCopyStatus(null);
    setActiveTab(index);
  }

  async function copyResult() {
    const request = ++copyRequest.current;
    clearTimeout(copyTimer.current);
    setCopyStatus(null);

    const caseLabel = caseGroups.flatMap((group) => group.kinds).find(([value]) => value === kind)?.[1];
    const levelLabel = courtLevels.find(([value]) => value === level)?.[1];
    const summary = activeTab === 0
      ? [
          `${caseLabel} · ${levelLabel}`,
          claimAmount !== undefined && `ทุนทรัพย์ ${baht(claimAmount)} บาท`,
          `${courtLabel} ${baht(court.fee)} บาท`,
          ...court.lines.map((line) => `${line.label} — ${baht(line.amount)} บาท`),
          ...court.notes,
          courtSource,
        ]
      : [
          eventCopy.label,
          enforcementAmount !== undefined && `${eventCopy.base} (บาท) ${baht(enforcementAmount)}`,
          `${enforcementLabel} ${baht(enforcement.fee)} บาท`,
          event === 'NO_SALE' && 'ไม่เรียกเก็บ',
          enforcementAmount !== undefined &&
            `${enforcement.rate * 100}% × ${baht(enforcementAmount)} = ${baht(enforcement.fee)} บาท (ปัดเศษลง)`,
          enforcementNote,
          enforcementSource,
        ];

    try {
      await navigator.clipboard.writeText(summary.filter(Boolean).join('\n'));
      if (request !== copyRequest.current) return;
      setCopyStatus('copied');
      copyTimer.current = setTimeout(() => setCopyStatus(null), 2000);
    } catch {
      if (request === copyRequest.current) setCopyStatus('failed');
    }
  }

  function tryExample(example: (typeof examples)[number]) {
    activateTab(0);
    setKind(example.kind);
    setLevel(CourtLevel.TRIAL);
    setClaim(String(example.amount));
    tabButtons.current[0]?.focus({ preventScroll: true });
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    calculator.current?.scrollIntoView({ behavior: reduceMotion ? 'instant' : 'smooth', block: 'start' });
  }

  return (
    <>
      <section ref={calculator} className="scroll-mt-20 rounded-xl border border-mk-rule bg-mk-surface" aria-label="เครื่องคำนวณค่าธรรมเนียม">
        <div role="tablist" aria-label="เลือกค่าธรรมเนียม" className="grid grid-cols-[112px_120px] gap-2 px-4 pt-3 md:px-6">
          {tabs.map(({ id, label }, index) => (
            <button
              key={id}
              ref={(buttonElement) => { tabButtons.current[index] = buttonElement; }}
              id={`${id}-tab`}
              type="button"
              role="tab"
              aria-controls={`${id}-panel`}
              aria-describedby={`${id}-tab-hint`}
              aria-selected={index === activeTab}
              tabIndex={index === activeTab ? 0 : -1}
              onClick={() => activateTab(index)}
              onKeyDown={(e) => {
                const next = { ArrowLeft: 1 - index, ArrowRight: 1 - index, Home: 0, End: 1 }[e.key];
                if (next === undefined) return;
                e.preventDefault();
                activateTab(next);
                tabButtons.current[next]?.focus();
              }}
              className="min-h-11 cursor-pointer whitespace-nowrap rounded-lg border border-transparent px-4 py-2 font-semibold text-mk-ink-2 hover:bg-mk-sunk aria-selected:bg-mk-ink aria-selected:text-mk-paper"
            >
              {label}
            </button>
          ))}
        </div>
        <div className="grid grid-cols-[112px_120px] gap-2 border-b border-mk-rule px-4 pb-3 text-center md:px-6">
          {tabs.map(({ id, hint: text }) => <span key={id} id={`${id}-tab-hint`} className={hint}>{text}</span>)}
        </div>

        <div id="court-panel" role="tabpanel" aria-labelledby="court-tab" className={activeTab === 0 ? panel : 'hidden'}>
          <div className="grid min-w-0 gap-4">
            <div>
              <label className={fieldLabel} htmlFor="case-kind">ประเภทคดี</label>
              <div className="relative">
                <select id="case-kind" className={`${control} appearance-none truncate pe-9`} value={kind} onChange={(e) => setKind(e.currentTarget.value as CourtFeeCaseKind)}>
                  {caseGroups.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.kinds.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </optgroup>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute end-3 top-1/2 size-[18px] -translate-y-1/2" aria-hidden="true" />
              </div>
            </div>
            <fieldset className="min-w-0">
              <legend className={fieldLabel}>ชั้นศาล</legend>
              <div className="mt-1 grid grid-cols-3 gap-1">
                {courtLevels.map(([value, label]) => (
                  <Fragment key={value}>
                    <input className="sr-only" type="radio" name="court-level" id={`court-level-${value}`} checked={level === value} onChange={() => setLevel(value)} />
                    <label
                      htmlFor={`court-level-${value}`}
                      className={`flex min-h-11 cursor-pointer items-center justify-center whitespace-nowrap rounded-lg border text-sm [input:focus-visible+&]:outline-2 [input:focus-visible+&]:outline-offset-2 [input:focus-visible+&]:outline-mk-brass ${
                        level === value ? 'border-mk-ink bg-mk-ink text-mk-paper' : 'border-mk-rule bg-mk-paper'
                      }`}
                    >
                      {label}
                    </label>
                  </Fragment>
                ))}
              </div>
            </fieldset>
            {needsClaim ? (
              <AmountField id="claim-amount" label="ทุนทรัพย์ (บาท)" digits={claim} onChange={setClaim} help="ใช้ทุนทรัพย์ตามคำฟ้องในชั้นนั้น ไม่ใช่ยอดตามสัญญา" />
            ) : <p className={fieldHelp}>ประเภทนี้ไม่ใช้ทุนทรัพย์</p>}
          </div>
          <Result label={courtLabel} fee={court.fee} source={courtSource}>
            <dl className="mt-4 text-sm leading-[1.6]">
              {court.lines.map(({ label, amount: lineAmount }) => (
                <div key={label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-t border-mk-rule py-2">
                  <dt>{label}</dt>
                  <dd className="text-end whitespace-nowrap tabular-nums">{baht(lineAmount)} บาท</dd>
                </div>
              ))}
            </dl>
            {court.notes.length > 0 && (
              <div className={resultNote}>
                <Info className={noteIcon} aria-hidden="true" />
                <ul aria-label="หมายเหตุ" className="space-y-1">
                  {court.notes.map((note) => <li key={note}>{note}</li>)}
                </ul>
              </div>
            )}
          </Result>
        </div>

        <div id="enforcement-panel" role="tabpanel" aria-labelledby="enforcement-tab" className={activeTab === 1 ? panel : 'hidden'}>
          <div className="grid min-w-0 gap-4">
            <fieldset className="min-w-0">
              <legend className={fieldLabel}>เหตุการณ์</legend>
              <div className="mt-1 grid gap-2">
                {enforcementEvents.map(({ event: value, label, hint: baseHint, rate }) => (
                  <label key={value} className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-mk-rule bg-mk-paper px-3 py-2 text-[13px] has-[:checked]:border-mk-ink has-[:checked]:bg-mk-surface">
                    <input className="shrink-0 accent-mk-ink" type="radio" name="enforcement-event" checked={event === value} onChange={() => setEvent(value)} />
                    <span>{label}</span>
                    <span className="ms-auto text-end text-mk-ink-2">{rate ? `${rate * 100}% ของ${baseHint}` : 'ไม่เรียกเก็บ'}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {event !== 'NO_SALE' && (
              <AmountField id="enforcement-amount" label={`${eventCopy.base} (บาท)`} digits={amount} onChange={setAmount} />
            )}
          </div>
          <Result label={enforcementLabel} fee={enforcement.fee} source={enforcementSource}>
            <div className={resultNote}>
              <Info className={noteIcon} aria-hidden="true" />
              <p>{enforcementNote}</p>
            </div>
          </Result>
        </div>

        <div className="flex flex-wrap items-start gap-x-4 gap-y-3 border-t border-mk-rule px-4 py-4 md:justify-end md:px-6 md:text-center">
          <div>
            <button type="button" onClick={copyResult} aria-describedby="copy-hint" className={`${button} min-w-32 cursor-pointer border-mk-rule bg-mk-surface hover:bg-mk-sunk`}>
              <Copy className="size-[18px] shrink-0" aria-hidden="true" />
              {copied ? 'คัดลอกแล้ว' : 'คัดลอกผล'}
            </button>
            <p id="copy-hint" className={hint}>คัดลอกยอดและวิธีคิดไปวางใน LINE หรืออีเมล</p>
            <p role="status" className={copyStatus === 'failed' ? hint : 'sr-only'}>
              {copied ? 'คัดลอกแล้ว' : copyStatus === 'failed' ? copyError : ''}
            </p>
          </div>
          <div>
            <a href="/register?from=court-fee" aria-describedby="register-hint" className={`${button} btn-primary border-transparent bg-mk-ink text-mk-paper hover:bg-brand-700`}>
              บันทึกเข้าแฟ้มคดีในสำนวน<ArrowRight className="size-[18px] shrink-0" aria-hidden="true" />
            </a>
            <p id="register-hint" className={hint}>เริ่มใช้ฟรี ไม่ต้องใช้บัตรเครดิต</p>
          </div>
        </div>
      </section>

      <aside className="mt-4 flex items-start gap-3 rounded-lg border border-mk-rule bg-mk-sunk px-4 py-3 text-sm leading-[1.6] text-mk-ink-2">
        <Info className={noteIcon} aria-hidden="true" />
        <div>
          <p>ตัวเลขนี้เป็นการประมาณเพื่อเตรียมงบ ยอดจริงดูจากใบเสร็จของศาล คดีที่มีหลายคำขอ หลายฝ่าย หรือขอยกเว้นค่าธรรมเนียม ให้ตรวจกับเจ้าหน้าที่ศาลอีกครั้ง</p>
          <a className="inline-flex min-h-11 items-center text-mk-ink underline underline-offset-[3px]" href="https://fees.coj.go.th/">เทียบกับเครื่องคำนวณของศาลยุติธรรม</a>
        </div>
      </aside>

      <section className="mt-12 md:mt-16" aria-labelledby="examples-title">
        <h2 id="examples-title" className="font-display text-[clamp(1.5rem,3vw,2.25rem)] leading-[1.32] font-semibold">ตัวอย่างการคิดค่าขึ้นศาล</h2>
        <table role="table" aria-labelledby="examples-title" className="mt-4 w-full border-collapse text-sm leading-[1.6] [&_:is(th,td)]:align-middle md:[&_:is(th,td)]:border-b md:[&_:is(th,td)]:border-mk-rule md:[&_:is(th,td)]:px-4 md:[&_:is(th,td)]:py-3">
          <thead role="rowgroup" className="bg-mk-sunk max-md:sr-only">
            <tr role="row">
              <th scope="col" role="columnheader" className="text-start">กรณี</th>
              <th scope="col" role="columnheader" className="text-start">วิธีคิด</th>
              <th scope="col" role="columnheader" className={totalCell}>ค่าขึ้นศาล</th>
              <th scope="col" role="columnheader"><span className="sr-only">ลองคำนวณ</span></th>
            </tr>
          </thead>
          <tbody role="rowgroup" className="max-md:block">
            {examples.map((example) => (
              <tr
                key={example.amount}
                role="row"
                className="max-md:grid max-md:grid-cols-[minmax(0,1fr)_auto] max-md:items-center max-md:gap-x-3 max-md:gap-y-1 max-md:border-t max-md:border-mk-rule max-md:py-3 max-md:last:border-b"
              >
                <th scope="row" role="rowheader" className="text-start font-semibold max-md:col-span-2">{example.label} ทุนทรัพย์ {baht(example.amount)} บาท</th>
                <td role="cell" className="max-md:col-span-2">{example.method}</td>
                <td role="cell" className={totalCell}>{baht(estimateCourtFee({ kind: example.kind, level: CourtLevel.TRIAL, claimAmount: example.amount }).fee)} บาท</td>
                <td role="cell" className="text-end">
                  <button type="button" title={exampleHint} aria-describedby="try-example-hint" onClick={() => tryExample(example)} className="min-h-11 cursor-pointer whitespace-nowrap py-1 font-semibold underline underline-offset-[3px]">
                    ลองคำนวณ
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <span id="try-example-hint" className="sr-only">{exampleHint}</span>
      </section>
    </>
  );
}
