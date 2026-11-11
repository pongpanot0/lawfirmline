'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseListItem, type DrivePickerItem } from '@/lib/api';
import { defaultFolderCaseId } from '@/lib/case-email';
import { DriveFolderPicker } from '@/components/drive/DriveFolderPicker';
import { FolderMatchTable, type FolderMatchRow } from '@/components/settings/FolderMatchTable';
import { DriveCaseImportTable } from '@/components/settings/DriveCaseImportTable';

type Suggestions = Awaited<ReturnType<typeof api.getDriveFolderSuggestions>>;

// "89. …" — numbered like a case folder (same rule as the import pre-tick).
const CASE_FOLDER = /^\d+\./;

/**
 * OneDrive/SharePoint tab of "จับคู่โฟลเดอร์": choose the parent folder that holds one folder per case,
 * review suggested cases (same matcher and table as Outlook), confirm — nothing is linked before "ยืนยัน".
 */
export function DriveFolderMatchingTab() {
  const { token } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [parent, setParent] = useState<DrivePickerItem | null>(null);
  const [items, setItems] = useState<Suggestions>([]);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (token) api.getCases(token).then(setCases).catch(() => setCases([]));
  }, [token]);

  const load = useCallback(
    async (folder: DrivePickerItem) => {
      if (!token) return;
      setLoading(true);
      try {
        // What's inside decides, not the name: "11111. บาร์ริสเตอร์" is numbered yet holds the case
        // folders. Only a numbered folder with no case folders inside is a single case — then show
        // just that folder, from its parent's listing.
        const children = await api.getDriveFolderSuggestions(token, folder.driveId, folder.id);
        const holdsCases = children.some((r) => CASE_FOLDER.test(r.folder.name.trim()));
        if (!holdsCases && CASE_FOLDER.test(folder.name.trim()) && folder.parentId) {
          const siblings = await api.getDriveFolderSuggestions(token, folder.driveId, folder.parentId);
          setItems(siblings.filter((r) => r.folder.id === folder.id));
        } else {
          setItems(children);
        }
      } catch (e) {
        setMessage(e instanceof ApiError ? e.message : 'โหลดโฟลเดอร์ไม่สำเร็จ ลองโหลดหน้าใหม่');
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  const closePicker = useCallback(() => setPickerOpen(false), []);

  const choose = async (folder: DrivePickerItem) => {
    setPickerOpen(false);
    setParent(folder);
    setMessage('');
    await load(folder);
  };

  const rows = useMemo<FolderMatchRow[]>(
    () =>
      items.map((r) => ({
        id: r.folder.id,
        name: r.folder.name,
        suggestions: r.suggestions,
        link: r.link && { id: r.link.id, ownRef: r.link.ownRef, title: r.link.title },
        defaultCaseId: defaultFolderCaseId(r),
      })),
    [items],
  );

  const importItems = useMemo(
    () => items.flatMap((r) => (!r.link && r.parsed ? [{ folder: r.folder, parsed: r.parsed, suggestions: r.suggestions }] : [])),
    [items],
  );

  const confirm = async (picks: { id: string; caseId: string }[]) => {
    if (!token || !parent || picks.length === 0) return;
    setSaving(true);
    setMessage('');
    const failed: string[] = [];
    for (const pick of picks) {
      const folder = items.find((r) => r.folder.id === pick.id)?.folder;
      if (!folder) continue;
      try {
        await api.linkCaseDriveFolder(token, pick.caseId, folder.driveId, folder.id);
      } catch (e) {
        failed.push(`${folder.name}: ${e instanceof ApiError ? e.message : 'ผูกไม่สำเร็จ'}`);
      }
    }
    setMessage(
      failed.length
        ? `ผูกแล้ว ${picks.length - failed.length} โฟลเดอร์ — ไม่สำเร็จ: ${failed.join(' · ')}`
        : `ผูกแล้ว ${picks.length} โฟลเดอร์`,
    );
    await load(parent);
    setSaving(false);
  };

  const unlink = async (linkId: string) => {
    const caseId = items.find((r) => r.link?.id === linkId)?.link?.caseId;
    if (!token || !parent || !caseId || !window.confirm('ยกเลิกการผูกโฟลเดอร์นี้? ไฟล์ใน OneDrive ยังอยู่ครบ')) return;
    setMessage('');
    try {
      await api.unlinkCaseDriveFolder(token, caseId);
      await load(parent);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'ยกเลิกการผูกไม่สำเร็จ ลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPickerOpen(true)} className="min-h-11 rounded-lg border bg-card px-3 py-1.5 text-sm font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {parent ? 'เปลี่ยนโฟลเดอร์หลัก' : 'เลือกโฟลเดอร์หลักที่เก็บโฟลเดอร์คดี'}
        </button>
        {parent && <span className="text-sm text-muted-foreground">{parent.name}</span>}
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {loading && <div role="status" aria-label="กำลังจับคู่" className="h-40 animate-pulse rounded-xl bg-muted" />}
      {!loading && parent && (
        <DriveCaseImportTable driveId={parent.driveId} items={importItems} onDone={() => load(parent)} />
      )}
      {!loading && parent && (
        <FolderMatchTable rows={rows} cases={cases} saving={saving} onConfirm={confirm} onUnlink={unlink} />
      )}
      <DriveFolderPicker
        open={pickerOpen}
        title="เลือกโฟลเดอร์หลัก (ที่มีโฟลเดอร์ย่อยแยกตามคดี) หรือโฟลเดอร์คดีเดียว"
        onClose={closePicker}
        onPick={choose}
      />
    </div>
  );
}
