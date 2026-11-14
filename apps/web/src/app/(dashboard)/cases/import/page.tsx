'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { CASE_STAGE_LABELS_TH, COURT_LEVEL_LABELS, CourtLevel, type CaseStage } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type ExcelCaseDraft, type ExcelCaseResult, type ImportClosedOutcome, type UserItem } from '@/lib/api';
import { excelRowProblems, toCreateRow } from '@/lib/excel-case-import';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';

// Same wording as the close-case dialog and the template.
const OUTCOME_OPTIONS: [ImportClosedOutcome, string][] = [
  ['WON', 'ชนะคดี'],
  ['SETTLED', 'ตกลงกันได้'],
  ['MEDIATED', 'ไกล่เกลี่ยสำเร็จ'],
  ['LOST', 'แพ้คดี'],
  ['WITHDRAWN', 'ถอนฟ้อง / ยุติ'],
];
const PARTY_LABELS: Record<string, string> = { PLAINTIFF: 'โจทก์', DEFENDANT: 'จำเลย', PETITIONER: 'ผู้ร้อง', RESPONDENT: 'ผู้คัดค้าน' };
const field = 'min-h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const thaiDate = (iso?: string) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('th-TH', { timeZone: 'UTC' }) : '');
const baht = (n?: number) => (n == null ? '' : `${n.toLocaleString('th-TH')} บาท`);

/** `uploaded` is the row as the file had it, so an edit can clear the problem it fixed. */
type Row = ExcelCaseDraft & { selected: boolean; uploaded: { blackCaseNumber?: string }; createError?: string };

/** "นำเข้าคดีจาก Excel": template → upload → review each row → create. Nothing is created before the button. */
export default function CaseImportPage() {
  const { token } = useAuth();
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [noKeyRows, setNoKeyRows] = useState(0);
  const [fileName, setFileName] = useState('');
  const [fileSize, setFileSize] = useState(0);
  const [busy, setBusy] = useState<'' | 'template' | 'preview' | 'create'>('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<(ExcelCaseResult & { title: string })[]>([]);

  useEffect(() => {
    if (token) api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
  }, [token]);
  const lawyerName = useMemo(() => new Map(lawyers.map((l) => [l.id, `${l.firstName} ${l.lastName}`])), [lawyers]);

  const problemsOf = (r: Row) => excelRowProblems(r, r.uploaded);
  const selected = rows.filter((r) => r.selected && problemsOf(r).length === 0);

  const update = (rowNumber: number, patch: Partial<Row>) =>
    setRows((list) => list.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));

  const downloadTemplate = async () => {
    if (!token) return;
    setBusy('template');
    setError('');
    try {
      const blob = await api.downloadCaseImportTemplate(token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'แบบฟอร์มนำเข้าคดี.xlsx';
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ดาวน์โหลดแบบฟอร์มไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy('');
    }
  };

  const upload = async (file: File | undefined) => {
    if (!token || !file) return;
    setBusy('preview');
    setError('');
    setResults([]);
    setFileName(file.name);
    setFileSize(file.size);
    try {
      const preview = await api.previewCaseImport(token, file);
      setRows(preview.drafts.map((d) => ({ ...d, selected: excelRowProblems(d).length === 0, uploaded: { blackCaseNumber: d.blackCaseNumber } })));
      setNoKeyRows(preview.noKeyRows);
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : 'อ่านไฟล์ไม่สำเร็จ ตรวจว่าเป็นไฟล์ .xlsx จากแบบฟอร์มแล้วลองใหม่');
    } finally {
      setBusy('');
    }
  };

  const create = async () => {
    if (!token || selected.length === 0) return;
    setBusy('create');
    setError('');
    try {
      const { results: done } = await api.createCasesFromExcel(token, selected.map(toCreateRow));
      const titles = new Map(selected.map((r) => [r.rowNumber, r.title]));
      setResults(done.map((r) => ({ ...r, title: titles.get(r.rowNumber) ?? '' })));
      const createdRows = new Set(done.filter((r) => r.status === 'CREATED').map((r) => r.rowNumber));
      const failure = new Map(done.filter((r) => r.status === 'FAILED').map((r) => [r.rowNumber, r.message ?? 'สร้างคดีไม่สำเร็จ ลองใหม่อีกครั้ง']));
      // Created rows leave the list; failed ones are unticked with their reason shown, so pressing again
      // doesn't just repeat the failure — but they can be re-ticked after a fix or a temporary error.
      setRows((list) =>
        list
          .filter((r) => !createdRows.has(r.rowNumber))
          .map((r) => (failure.has(r.rowNumber) ? { ...r, selected: false, createError: failure.get(r.rowNumber) } : { ...r, createError: undefined })),
      );
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างคดีไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="min-w-0 pb-24">
      <Link href="/cases" className="mb-4 inline-flex min-h-11 items-center text-sm text-muted-foreground hover:text-foreground">← เรื่องและคดี</Link>
      <Link href="/import" className="mb-4 ml-4 inline-flex min-h-11 items-center whitespace-nowrap text-sm text-primary hover:underline">นำเข้าข้อมูลประเภทอื่น →</Link>
      <PageHeader
        title="นำเข้าคดีจาก Excel"
        description="ดาวน์โหลดแบบฟอร์ม กรอกหนึ่งแถวต่อหนึ่งคดี แล้วอัปโหลดกลับมาตรวจก่อนสร้างคดี"
        actions={<Button variant="outline" disabled={busy === 'template'} onClick={downloadTemplate}>{busy === 'template' ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลดแบบฟอร์ม'}</Button>}
      />
      <ol aria-label="ขั้นตอนนำเข้าคดี" className="mb-4 flex flex-wrap gap-2 text-sm">
        {['ดาวน์โหลดแบบฟอร์ม', 'อัปโหลดไฟล์', 'ตรวจและเลือกแถวที่จะสร้าง'].map((label, i) => (
          <li key={label} aria-current={(rows.length > 0 ? 2 : 1) === i ? 'step' : undefined} className={`rounded-full px-3 py-2 ${(rows.length > 0 ? 2 : 1) === i ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground'}`}>
            {i + 1} {label}
          </li>
        ))}
      </ol>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4">
        <div className="min-w-0 text-sm">
          <p className="break-words font-medium">{fileName || 'อัปโหลดไฟล์ที่กรอกแล้ว (.xlsx)'}</p>
          {fileName && <p className="mt-1 text-xs tabular-nums text-muted-foreground">{(fileSize / 1024).toFixed(1)} KB · {rows.length} แถว</p>}
          {!fileName && <p className="mt-1 text-xs text-muted-foreground">แบบฟอร์มมีตัวเลือกประเภทคดี รายชื่อทนายความ และชีตวิธีกรอก</p>}
          {busy === 'preview' && <p role="status" className="mt-1 text-xs text-muted-foreground">กำลังอ่าน {fileName}…</p>}
        </div>
        <label htmlFor="case-import-file" className="inline-flex min-h-11 cursor-pointer items-center whitespace-nowrap rounded-lg border px-4 text-sm font-semibold hover:bg-accent focus-within:ring-2 focus-within:ring-ring">
          {fileName ? 'เปลี่ยนไฟล์' : 'เลือกไฟล์'}
          <input id="case-import-file" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={busy === 'preview'} onChange={(e) => { void upload(e.target.files?.[0]); e.target.value = ''; }} className="sr-only" />
        </label>
      </div>

      {error && <p role="alert" className="mb-4 rounded-lg border border-destructive/40 bg-destructive/5 px-3 py-2 text-sm text-destructive">{error}</p>}

      {results.length > 0 && (
        <ul role="status" className="mb-4 space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          {results.map((r) => (
            <li key={r.rowNumber}>
              {r.status === 'CREATED' && r.caseId ? (
                <>แถว {r.rowNumber}: สร้างแล้ว <Link className="font-medium underline" href={`/cases/${r.caseId}`}>{r.ownRef}</Link> · {r.title}</>
              ) : (
                <span className="text-destructive">แถว {r.rowNumber}: ไม่สำเร็จ · {r.title}: {r.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <section aria-labelledby="excel-review-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-lg border bg-card p-4">
            <div><h2 id="excel-review-heading" className="font-semibold">ตรวจและเลือกแถวที่จะสร้าง</h2><p className="text-xs text-muted-foreground">เปิดรายละเอียดแต่ละแถวเพื่อแก้ไขข้อมูลก่อนสร้าง</p></div>
            <div role="status" className="flex flex-wrap gap-2 text-xs tabular-nums">
              <span className="rounded-full bg-muted px-3 py-1">ทั้งหมด {rows.length}</span>
              <span className="rounded-full bg-primary/10 px-3 py-1">พร้อมสร้าง {rows.filter((r) => problemsOf(r).length === 0).length}</span>
              <span className="rounded-full bg-destructive/10 px-3 py-1 text-destructive">มีปัญหา {rows.filter((r) => problemsOf(r).length > 0).length}</span>
            </div>
            {noKeyRows > 0 && <p className="w-full text-xs text-warning">{noKeyRows} แถวไม่มีเลขอ้างอิงหรือเลขคดีดำ — ระบบตรวจซ้ำให้ไม่ได้</p>}
          </div>

          <div className="max-w-full overflow-x-auto rounded-lg border bg-card">
            <table className="w-full min-w-[800px] text-left text-sm">
              <thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="p-3">เลือก</th><th className="p-3">แถว</th><th className="p-3">เลขอ้างอิง</th><th className="p-3">ชื่อคดี</th><th className="p-3">ลูกความ</th><th className="p-3">วันเปิดคดี</th><th className="p-3">สถานะ</th></tr></thead>
              <tbody>
            {rows.map((r) => {
              const problems = problemsOf(r);
              const blocked = problems.length > 0;
              return (
                <Fragment key={r.rowNumber}>
                  <tr className={`border-t ${blocked ? 'bg-destructive/5' : ''}`}>
                    <td className="p-3"><label className="flex min-h-11 items-center">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={r.selected && !blocked}
                      disabled={blocked}
                      onChange={(e) => update(r.rowNumber, { selected: e.target.checked })}
                    />
                    <span className="sr-only">เลือกแถว {r.rowNumber}</span></label></td>
                    <td className="p-3 tabular-nums">{r.rowNumber}</td><td className="p-3 font-mono">{r.ownRef || '—'}</td>
                    <td className="p-3 font-medium">{r.title || '(ไม่มีชื่อคดี)'}</td><td className="p-3">{r.clientName || '—'}</td>
                    <td className="p-3 whitespace-nowrap">{thaiDate(r.openedAt) || '—'}</td>
                    <td className="p-3">{blocked ? <span className="text-destructive">⚠ {problems.join(' · ')}</span> : '✓ พร้อมสร้าง'}{r.createError && <p className="text-destructive">สร้างไม่สำเร็จ: {r.createError}</p>}</td>
                  </tr>
                  <tr className={blocked ? 'bg-destructive/5' : ''}><td colSpan={7} className="px-3 pb-3"><details><summary className="min-h-11 cursor-pointer py-3 text-xs font-medium text-primary">รายละเอียดและแก้ไขแถว {r.rowNumber}</summary>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs sm:col-span-2">ชื่อคดี
                      <input value={r.title} onChange={(e) => update(r.rowNumber, { title: e.target.value })} className={field} />
                    </label>
                    <label className="text-xs">ทนายหลัก
                      <Select value={r.leadLawyerId} onChange={(e) => update(r.rowNumber, { leadLawyerId: e.target.value })} className={field}>
                        <option value="">— เลือก — {r.leadEmail && !r.leadLawyerId ? `(ในไฟล์: ${r.leadEmail})` : ''}</option>
                        {lawyers.map((l) => <option key={l.id} value={l.id}>{lawyerName.get(l.id)}</option>)}
                      </Select>
                    </label>
                    <label className="text-xs">ชั้นศาล
                      <Select value={r.courtLevel} onChange={(e) => update(r.rowNumber, { courtLevel: e.target.value as CourtLevel })} className={field}>
                        {Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}
                      </Select>
                    </label>
                    <label className="text-xs">เลขคดีดำ
                      <input value={r.blackCaseNumber ?? ''} onChange={(e) => update(r.rowNumber, { blackCaseNumber: e.target.value })} className={field} />
                    </label>
                    <label className="text-xs">เลขคดีแดง
                      <input value={r.redCaseNumber ?? ''} onChange={(e) => update(r.rowNumber, { redCaseNumber: e.target.value })} className={field} />
                    </label>
                    <label className="flex min-h-10 items-center gap-2 text-xs sm:col-span-2">
                      <input type="checkbox" className="h-4 w-4" checked={r.closed} onChange={(e) => update(r.rowNumber, { closed: e.target.checked })} />
                      ปิดคดีแล้ว
                    </label>
                    {r.closed && (
                      <>
                        <label className="text-xs">ผลคดี
                          <Select
                            value={r.outcome ?? ''}
                            onChange={(e) => update(r.rowNumber, { outcome: (e.target.value || undefined) as ImportClosedOutcome | undefined })}
                            className={field}
                          >
                            <option value="">— เลือกผลคดี —</option>
                            {OUTCOME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </Select>
                        </label>
                        <label className="text-xs">สรุปตอนปิด
                          <input
                            value={r.closingSummary ?? ''}
                            onChange={(e) => update(r.rowNumber, { closingSummary: e.target.value })}
                            className={field}
                          />
                        </label>
                      </>
                    )}
                  </div>

                  <dl className="mt-2 grid gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2">
                    {r.clientName && (
                      <div><dt className="inline">ลูกความ: </dt><dd className="inline">{r.clientName} {r.clientMatched ? '(ลูกความในระบบ)' : '(ชื่อใหม่ — ยังไม่สร้างลูกความ)'}{r.partyRole ? ` · ${PARTY_LABELS[r.partyRole]}` : ''}</dd></div>
                    )}
                    {r.opponents.length > 0 && <div><dt className="inline">คู่ความฝ่ายตรงข้าม: </dt><dd className="inline">{r.opponents.join(', ')}</dd></div>}
                    {r.courtName && <div><dt className="inline">ศาล: </dt><dd className="inline">{r.courtName}</dd></div>}
                    {r.ownRef && <div><dt className="inline">เลขอ้างอิงสำนักงาน: </dt><dd className="inline">{r.ownRef}</dd></div>}
                    {r.buddyIds.length > 0 && <div><dt className="inline">ทีม: </dt><dd className="inline">{r.buddyIds.map((id) => lawyerName.get(id) ?? 'สมาชิก').join(', ')}</dd></div>}
                    {!r.closed && r.stage && <div><dt className="inline">ขั้นตอนคดี: </dt><dd className="inline">{CASE_STAGE_LABELS_TH[r.stage as CaseStage]}</dd></div>}
                    {r.openedAt && <div><dt className="inline">วันเปิดคดี: </dt><dd className="inline">{thaiDate(r.openedAt)}</dd></div>}
                    {r.closed && r.closedAt && <div><dt className="inline">วันปิดคดี: </dt><dd className="inline">{thaiDate(r.closedAt)}</dd></div>}
                    {r.limitationDeadline && <div><dt className="inline">วันครบอายุความ: </dt><dd className="inline">{thaiDate(r.limitationDeadline)}</dd></div>}
                    {r.claimedAmount != null && <div><dt className="inline">ทุนทรัพย์: </dt><dd className="inline">{baht(r.claimedAmount)}</dd></div>}
                    {r.estimatedFee != null && <div><dt className="inline">ค่าวิชาชีพประมาณการ: </dt><dd className="inline">{baht(r.estimatedFee)}</dd></div>}
                  </dl>

                  {r.createError && <p className="mt-2 text-xs text-destructive">สร้างไม่สำเร็จ: {r.createError}</p>}
                  {problems.length > 0 && (
                    <ul aria-label={`ปัญหาของแถว ${r.rowNumber}`} className="mt-2 list-disc pl-5 text-xs text-destructive">
                      {problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  )}
                  </details></td></tr>
                </Fragment>
              );
            })}
              </tbody>
            </table>
          </div>

          <div className="sticky bottom-0 z-[45] flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card p-4 shadow-sm">
            <p className="text-sm tabular-nums">เลือก {selected.length} แถว · ข้าม {rows.filter((r) => problemsOf(r).length > 0).length} แถวที่มีปัญหา</p>
            <div className="flex flex-wrap gap-2"><Link href="/cases" className="inline-flex min-h-11 items-center px-4 text-sm hover:underline">ยกเลิก</Link><Button disabled={busy === 'create' || selected.length === 0} onClick={create}>
              {busy === 'create' ? 'กำลังสร้าง…' : `สร้าง ${selected.length} คดี`}
            </Button></div>
          </div>
        </section>
      )}
    </div>
  );
}
