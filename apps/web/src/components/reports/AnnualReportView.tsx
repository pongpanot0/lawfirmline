import Link from 'next/link';
import { AnnualReportSnapshot, reportAudienceLabel } from '@/lib/annual-report';
import { caseStageLabel } from '@/lib/stage-labels';

const number = (value: number) => new Intl.NumberFormat('th-TH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value);
const date = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' }) : '—';
const statusLabel: Record<string, string> = {
  OPEN: 'เปิดอยู่', DRAFTING: 'กำลังร่าง', COURT_DATE: 'มีนัดศาล',
  IN_PROGRESS: 'กำลังดำเนินการ', PENDING: 'รอดำเนินการ',
  CLOSED: 'ปิดคดี', ARCHIVED: 'เก็บเข้าคลัง',
};
const outcomeLabel: Record<string, string> = {
  WON: 'ชนะคดี', LOST: 'แพ้คดี', SETTLED: 'ตกลงกัน',
  MEDIATED: 'ไกล่เกลี่ยสำเร็จ', WITHDRAWN: 'ถอนคดี', IN_PROGRESS: 'ยังไม่ระบุผล',
};

export function AnnualReportView({
  report,
  portal = false,
}: {
  report: AnnualReportSnapshot;
  portal?: boolean;
}) {
  return (
    <article className="space-y-6 bg-card text-foreground print:space-y-4">
      <header className="border-b pb-4">
        <p className="text-sm text-muted-foreground">รายงานคดีประจำปี · {reportAudienceLabel(report.audience)}</p>
        <h1 className="text-2xl font-bold">{report.clientName}</h1>
        <p className="text-sm">ปี {report.year + 543} · 1 มกราคม – 31 ธันวาคม</p>
      </header>

      <section aria-label="สรุปรายปี" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {[
          ['คดีในรายงาน', report.totals.cases],
          ['เปิดใหม่ในปี', report.totals.opened],
          ['ปิดในปี', report.totals.closedInYear],
          ['ปิดแล้วสิ้นปี', report.totals.closedAtYearEnd],
          ['ดำเนินอยู่สิ้นปี', report.totals.ongoing],
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="text-xl font-bold">{value}</p>
          </div>
        ))}
      </section>

      <section aria-label="ยอดเงิน" className="grid gap-3 sm:grid-cols-3">
        <Amount label="ยอดเรียกร้องของคดีในรายงาน" value={report.totals.claimedAmount} />
        <Amount label="ยอดใบแจ้งหนี้ที่ออกในปี" value={report.totals.invoicedAmount} />
        <Amount label="ยอดรับชำระในปี" value={report.totals.receivedAmount} />
      </section>
      <p className="text-xs text-muted-foreground">
        ยอดเรียกร้องรวมจาก {report.totals.claimedCaseCount} คดีที่บันทึกยอด เป็นมูลค่าของคดี ไม่ใช่ยอดชนะคดีหรือยอดรับเงินจริง
        ยอดใบแจ้งหนี้และยอดรับชำระนับตามวันที่ของแต่ละรายการ
      </p>

      <section aria-label="รายการคดี" className="space-y-4">
        <h2 className="text-lg font-bold">รายการคดี</h2>
        {report.cases.map((item, index) => (
          <div key={item.id} className="break-inside-avoid rounded-lg border p-4">
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="font-semibold">{index + 1}. {item.title}</h3>
              {portal && item.canOpenCase && (
                <Link href={`/portal/cases/${item.id}`} className="text-sm text-primary print:hidden">
                  เปิดหน้าคดี
                </Link>
              )}
            </div>
            <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <Field label="ชื่อลูกความ / ผู้เอาประกัน" value={item.clientName} />
              <Field label="เลขคดีสำนักงาน" value={item.ownRef} />
              <Field label="Customer Ref" value={item.customerRef} />
              <Field label="Policy Ref / เลขกรมธรรม์" value={item.policyRef ?? (item.policyRelevant ? 'รอตรวจ' : 'ไม่เกี่ยวข้อง')} />
              <Field label="หมายเลขคดีดำ" value={item.blackCaseNumber ?? 'ยังไม่มีเลข'} />
              <Field label="หมายเลขคดีแดง" value={item.redCaseNumber ?? 'ยังไม่มีเลข'} />
              <Field label="ประเภทคดี" value={item.caseType} />
              <Field label="ผู้รับผิดชอบ" value={item.leadLawyer} />
              <Field label="วันเปิด" value={date(item.openedAt)} />
              <Field label="ขั้นตอนตามข้อมูลขณะจัดทำ" value={caseStageLabel(item.stageAtPublication)} />
              <Field label="สถานะสิ้นปี" value={statusLabel[item.statusAtYearEnd] ?? item.statusAtYearEnd} />
              <Field label="วันปิด" value={date(item.closedAt)} />
              <Field label="ผลคดี" value={item.outcome ? outcomeLabel[item.outcome] ?? item.outcome : null} />
              <Field label="ยอดเรียกร้อง" value={item.claimedAmount == null ? null : number(item.claimedAmount)} />
            </dl>
            {item.closedAt && (
              <div className="mt-3 border-t pt-3 text-sm">
                <p className="font-semibold">รายละเอียดปิดคดี</p>
                <p className="mt-1 whitespace-pre-wrap">{item.closingSummary || 'รอตรวจข้อมูล'}</p>
              </div>
            )}
          </div>
        ))}
      </section>
    </article>
  );
}

function Amount({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{number(value)}</p>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="break-words">{value?.trim() || '—'}</dd>
    </div>
  );
}
