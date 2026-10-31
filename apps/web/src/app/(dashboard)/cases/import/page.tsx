'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { CASE_STAGE_LABELS_TH, COURT_LEVEL_LABELS, CourtLevel, type CaseStage } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type ExcelCaseDraft, type ExcelCaseResult, type ImportClosedOutcome, type UserItem } from '@/lib/api';
import { excelRowProblems, toCreateRow } from '@/lib/excel-case-import';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Button } from '@/components/ui/button';

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

type Row = ExcelCaseDraft & { selected: boolean };

/** "นำเข้าคดีจาก Excel": template → upload → review each row → create. Nothing is created before the button. */
export default function CaseImportPage() {
  const { token } = useAuth();
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [noKeyRows, setNoKeyRows] = useState(0);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState<'' | 'template' | 'preview' | 'create'>('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<(ExcelCaseResult & { title: string })[]>([]);

  useEffect(() => {
    if (token) api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
  }, [token]);
  const lawyerName = useMemo(() => new Map(lawyers.map((l) => [l.id, `${l.firstName} ${l.lastName}`])), [lawyers]);

  const problemsOf = (r: Row) => excelRowProblems(r);
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
      setError(e instanceof ApiError ? e.message : 'ดาวน์โหลด template ไม่สำเร็จ');
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
    try {
      const preview = await api.previewCaseImport(token, file);
      setRows(preview.drafts.map((d) => ({ ...d, selected: excelRowProblems(d).length === 0 })));
      setNoKeyRows(preview.noKeyRows);
    } catch (e) {
      setRows([]);
      setError(e instanceof ApiError ? e.message : 'อ่านไฟล์ไม่สำเร็จ');
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
      setRows((list) => list.filter((r) => !createdRows.has(r.rowNumber)));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างคดีไม่สำเร็จ');
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="นำเข้าคดีจาก Excel"
        description="ดาวน์โหลด template กรอกหนึ่งแถวต่อหนึ่งคดี แล้วอัปโหลดกลับมาตรวจ — ระบบจะยังไม่สร้างคดีจนกว่าจะกดปุ่มสร้าง"
        actions={<Link href="/cases" className="text-sm underline">กลับไปรายการคดี</Link>}
      />

      <ol className="mb-6 grid gap-3 sm:grid-cols-2">
        <li className="rounded-xl border bg-card p-4">
          <p className="mb-2 text-sm font-semibold">1. ดาวน์โหลด template</p>
          <p className="mb-3 text-xs text-muted-foreground">มี dropdown ประเภทคดีและรายชื่อทนายของสำนักงาน พร้อมแผ่น &quot;วิธีกรอก&quot;</p>
          <Button variant="outline" disabled={busy === 'template'} onClick={downloadTemplate}>
            {busy === 'template' ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด template'}
          </Button>
        </li>
        <li className="rounded-xl border bg-card p-4">
          <label htmlFor="case-import-file" className="mb-2 block text-sm font-semibold">2. อัปโหลดไฟล์ที่กรอกแล้ว (.xlsx)</label>
          <input
            id="case-import-file"
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            disabled={busy === 'preview'}
            onChange={(e) => {
              void upload(e.target.files?.[0]);
              e.target.value = '';
            }}
            className="block w-full text-sm file:mr-3 file:min-h-10 file:rounded-md file:border file:bg-background file:px-3 file:text-sm"
          />
          {busy === 'preview' && <p role="status" className="mt-2 text-xs text-muted-foreground">กำลังอ่าน {fileName}…</p>}
        </li>
      </ol>

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
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="excel-review-heading" className="text-sm font-semibold">
              3. ตรวจและเลือกแถวที่จะสร้าง <span className="tabular-nums">({selected.length}/{rows.length})</span>
            </h2>
            {noKeyRows > 0 && (
              <p className="text-xs text-warning">{noKeyRows} แถวไม่มีเลขอ้างอิงหรือเลขคดีดำ — ระบบตรวจซ้ำให้ไม่ได้</p>
            )}
          </div>

          <ul className="space-y-2">
            {rows.map((r) => {
              const problems = problemsOf(r);
              const blocked = problems.length > 0;
              return (
                <li key={r.rowNumber} className={`rounded-lg border p-3 ${r.selected && !blocked ? '' : 'bg-muted/20'}`}>
                  <label className="flex min-h-11 items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={r.selected && !blocked}
                      disabled={blocked}
                      onChange={(e) => update(r.rowNumber, { selected: e.target.checked })}
                    />
                    <span>
                      <span className="text-muted-foreground">แถว {r.rowNumber} · </span>
                      <span className="font-medium">{r.title || '(ไม่มีชื่อคดี)'}</span>
                    </span>
                  </label>

                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <label className="text-xs sm:col-span-2">ชื่อคดี
                      <input value={r.title} onChange={(e) => update(r.rowNumber, { title: e.target.value })} className={field} />
                    </label>
                    <label className="text-xs">ทนายหลัก
                      <select value={r.leadLawyerId} onChange={(e) => update(r.rowNumber, { leadLawyerId: e.target.value })} className={field}>
                        <option value="">— เลือก — {r.leadEmail && !r.leadLawyerId ? `(ในไฟล์: ${r.leadEmail})` : ''}</option>
                        {lawyers.map((l) => <option key={l.id} value={l.id}>{lawyerName.get(l.id)}</option>)}
                      </select>
                    </label>
                    <label className="text-xs">ชั้นศาล
                      <select value={r.courtLevel} onChange={(e) => update(r.rowNumber, { courtLevel: e.target.value as CourtLevel })} className={field}>
                        {Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}
                      </select>
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
                          <select
                            value={r.outcome ?? ''}
                            onChange={(e) => update(r.rowNumber, { outcome: (e.target.value || undefined) as ImportClosedOutcome | undefined })}
                            className={field}
                          >
                            <option value="">— เลือกผลคดี —</option>
                            {OUTCOME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                          </select>
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
                    {r.ownRef && <div><dt className="inline">เลขอ้างอิงภายใน: </dt><dd className="inline">{r.ownRef}</dd></div>}
                    {r.buddyIds.length > 0 && <div><dt className="inline">ทีม: </dt><dd className="inline">{r.buddyIds.map((id) => lawyerName.get(id) ?? 'สมาชิก').join(', ')}</dd></div>}
                    {!r.closed && r.stage && <div><dt className="inline">ขั้นตอนคดี: </dt><dd className="inline">{CASE_STAGE_LABELS_TH[r.stage as CaseStage]}</dd></div>}
                    {r.openedAt && <div><dt className="inline">วันเปิดคดี: </dt><dd className="inline">{thaiDate(r.openedAt)}</dd></div>}
                    {r.closed && r.closedAt && <div><dt className="inline">วันปิดคดี: </dt><dd className="inline">{thaiDate(r.closedAt)}</dd></div>}
                    {r.limitationDeadline && <div><dt className="inline">วันครบอายุความ: </dt><dd className="inline">{thaiDate(r.limitationDeadline)}</dd></div>}
                    {r.claimedAmount != null && <div><dt className="inline">ทุนทรัพย์: </dt><dd className="inline">{baht(r.claimedAmount)}</dd></div>}
                    {r.estimatedFee != null && <div><dt className="inline">ค่าวิชาชีพประมาณการ: </dt><dd className="inline">{baht(r.estimatedFee)}</dd></div>}
                  </dl>

                  {problems.length > 0 && (
                    <ul role="alert" className="mt-2 list-disc pl-5 text-xs text-destructive">
                      {problems.map((p) => <li key={p}>{p}</li>)}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>

          <Button disabled={busy === 'create' || selected.length === 0} onClick={create}>
            {busy === 'create' ? 'กำลังสร้าง…' : `สร้าง ${selected.length} คดี`}
          </Button>
        </section>
      )}
    </div>
  );
}
