'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { COURT_LEVEL_LABELS, CourtLevel } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type ImportCaseResult, type ImportClosedOutcome, type ParsedCaseFolder, type UserItem } from '@/lib/api';
import { draftFromSuggestion, draftProblem, toImportRow, type ImportCaseDraft } from '@/lib/drive-case-import';
import { Button } from '@/components/ui/button';

// Same wording as the close-case dialog.
const OUTCOME_OPTIONS: [ImportClosedOutcome, string][] = [
  ['WON', 'ชนะคดี'],
  ['SETTLED', 'ตกลงกันได้'],
  ['MEDIATED', 'ไกล่เกลี่ยสำเร็จ'],
  ['LOST', 'แพ้คดี'],
  ['WITHDRAWN', 'ถอนฟ้อง / ยุติ'],
];
const field = 'min-h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export interface DriveImportItem {
  folder: { id: string; name: string };
  parsed: ParsedCaseFolder;
  suggestions: unknown[];
}

/**
 * "สร้างคดีใหม่จาก folder": every unlinked folder as an editable draft. Nothing is created until
 * "สร้าง N คดี"; files stay in OneDrive and the folder is linked with the importer's own account.
 */
export function DriveCaseImportTable({ driveId, items, onDone }: { driveId: string; items: DriveImportItem[]; onDone: () => void }) {
  const { token } = useAuth();
  const [drafts, setDrafts] = useState<ImportCaseDraft[]>([]);
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [bulkLead, setBulkLead] = useState('');
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<(ImportCaseResult & { name: string })[]>([]);
  const [error, setError] = useState('');

  // A fresh `items` array means the parent reloaded — restart from the parsed defaults.
  useEffect(() => setDrafts(items.map(draftFromSuggestion)), [items]);
  useEffect(() => {
    if (token) api.getLawyers(token).then(setLawyers).catch(() => setLawyers([]));
  }, [token]);

  const selected = drafts.filter((d) => d.selected);
  const blocked = selected.some((d) => draftProblem(d));
  const lawyerName = useMemo(() => new Map(lawyers.map((l) => [l.id, `${l.firstName} ${l.lastName}`])), [lawyers]);

  const update = (itemId: string, patch: Partial<ImportCaseDraft>) =>
    setDrafts((list) => list.map((d) => (d.itemId === itemId ? { ...d, ...patch } : d)));

  const applyLead = () => {
    if (!bulkLead) return;
    setDrafts((list) => list.map((d) => (d.selected ? { ...d, leadLawyerId: bulkLead } : d)));
  };

  const create = async () => {
    if (!token || selected.length === 0 || blocked) return;
    setSaving(true);
    setError('');
    try {
      const { results: done } = await api.importDriveCases(token, { driveId, rows: selected.map(toImportRow) });
      const names = new Map(selected.map((d) => [d.itemId, d.folderName]));
      setResults(done.map((r) => ({ ...r, name: names.get(r.itemId) ?? r.itemId })));
      onDone();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างคดีไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (items.length === 0 && results.length === 0) return null;

  return (
    <section className="space-y-3 border-t pt-4" aria-labelledby="drive-import-heading">
      <div>
        <h3 id="drive-import-heading" className="text-sm font-semibold">
          สร้างคดีใหม่จาก folder ที่ยังไม่ผูก <span className="tabular-nums">({items.length})</span>
        </h3>
        <p className="text-xs text-muted-foreground">
          ไฟล์ยังอยู่ใน OneDrive ที่เดิม — ระบบผูก folder ด้วยบัญชี Microsoft ของคุณ ควรให้เจ้าของ folder เป็นคนนำเข้า
        </p>
      </div>

      {results.length > 0 && (
        <ul role="status" className="space-y-1 rounded-lg border bg-muted/30 p-3 text-sm">
          {results.map((r) => (
            <li key={r.itemId}>
              {r.status === 'CREATED' && r.caseId ? (
                <>สร้างแล้ว <Link className="font-medium underline" href={`/cases/${r.caseId}`}>{r.ownRef}</Link> · {r.name}</>
              ) : r.status === 'ALREADY_LINKED' ? (
                <>ผูกไว้แล้ว · {r.name}</>
              ) : (
                <span className="text-destructive">ไม่สำเร็จ · {r.name}: {r.message}</span>
              )}
            </li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

      {drafts.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="tabular-nums">เลือก {selected.length} folder</span>
          <select aria-label="ทนายหลักสำหรับที่เลือก" value={bulkLead} onChange={(e) => setBulkLead(e.target.value)} className={`${field} w-auto`}>
            <option value="">— ทนายหลัก —</option>
            {lawyers.map((l) => <option key={l.id} value={l.id}>{lawyerName.get(l.id)}</option>)}
          </select>
          <Button size="sm" variant="outline" disabled={!bulkLead || selected.length === 0} onClick={applyLead}>
            ตั้งทนายหลักให้ที่เลือก
          </Button>
        </div>
      )}

      <ul className="space-y-2">
        {drafts.map((d) => {
          const problem = d.selected ? draftProblem(d) : null;
          const id = `imp-${d.itemId}`;
          return (
            <li key={d.itemId} className={`rounded-lg border p-3 ${d.selected ? '' : 'opacity-70'}`}>
              <label className="flex min-h-11 items-start gap-2 text-sm">
                <input type="checkbox" className="mt-1 h-4 w-4" checked={d.selected} onChange={(e) => update(d.itemId, { selected: e.target.checked })} />
                <span className="break-all font-medium">{d.folderName}</span>
              </label>
              {d.selected && (
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  <label className="text-xs sm:col-span-2">ชื่อคดี
                    <input id={`${id}-title`} value={d.title} onChange={(e) => update(d.itemId, { title: e.target.value })} className={field} />
                  </label>
                  <label className="text-xs">เลขคดีดำ
                    <input value={d.blackCaseNumber ?? ''} onChange={(e) => update(d.itemId, { blackCaseNumber: e.target.value })} className={field} />
                    {d.caseNumberRaw && d.caseNumberRaw !== d.blackCaseNumber && (
                      <span className="text-muted-foreground">ในชื่อ folder: {d.caseNumberRaw}</span>
                    )}
                  </label>
                  <label className="text-xs">ศาล
                    <input value={d.courtName ?? ''} onChange={(e) => update(d.itemId, { courtName: e.target.value })} className={field} />
                  </label>
                  <label className="text-xs">ชั้นศาล
                    <select value={d.courtLevel} onChange={(e) => update(d.itemId, { courtLevel: e.target.value as ImportCaseDraft['courtLevel'] })} className={field}>
                      {Object.values(CourtLevel).map((level) => <option key={level} value={level}>{COURT_LEVEL_LABELS[level]}</option>)}
                    </select>
                  </label>
                  <label className="text-xs">ทนายหลัก
                    <select value={d.leadLawyerId} onChange={(e) => update(d.itemId, { leadLawyerId: e.target.value })} className={field}>
                      <option value="">— เลือก —</option>
                      {lawyers.map((l) => <option key={l.id} value={l.id}>{lawyerName.get(l.id)}</option>)}
                    </select>
                  </label>
                  <fieldset className="text-xs sm:col-span-2">
                    <legend>ทีม {d.teamHint && <span className="text-muted-foreground">(ใน folder: {d.teamHint})</span>}</legend>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {lawyers.filter((l) => l.id !== d.leadLawyerId).map((l) => (
                        <label key={l.id} className="flex min-h-8 items-center gap-1">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={d.buddyIds?.includes(l.id) ?? false}
                            onChange={(e) =>
                              update(d.itemId, {
                                buddyIds: e.target.checked ? [...(d.buddyIds ?? []), l.id] : (d.buddyIds ?? []).filter((x) => x !== l.id),
                              })
                            }
                          />
                          {lawyerName.get(l.id)}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <label className="flex min-h-10 items-center gap-2 text-xs sm:col-span-2">
                    <input type="checkbox" className="h-4 w-4" checked={d.closed} onChange={(e) => update(d.itemId, { closed: e.target.checked })} />
                    ปิดคดีแล้ว
                  </label>
                  {d.closed && (
                    <>
                      <label className="text-xs">ผลคดี
                        <select value={d.outcome ?? ''} onChange={(e) => update(d.itemId, { outcome: (e.target.value || undefined) as ImportClosedOutcome | undefined })} className={field}>
                          <option value="">— เลือกผลคดี —</option>
                          {OUTCOME_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </label>
                      <label className="text-xs">สรุปตอนปิด
                        <input value={d.closingSummary ?? ''} onChange={(e) => update(d.itemId, { closingSummary: e.target.value })} className={field} />
                      </label>
                    </>
                  )}
                  {problem && <p role="alert" className="text-xs text-destructive sm:col-span-2">{problem}</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {drafts.length > 0 && (
        <Button disabled={saving || selected.length === 0 || blocked} onClick={create}>
          {saving ? 'กำลังสร้าง…' : `สร้าง ${selected.length} คดี`}
        </Button>
      )}
    </section>
  );
}
