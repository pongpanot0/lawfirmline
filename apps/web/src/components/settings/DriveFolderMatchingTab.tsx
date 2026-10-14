'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseListItem, type DrivePickerItem } from '@/lib/api';
import { defaultFolderCaseId } from '@/lib/case-email';
import { DriveFolderPicker } from '@/components/drive/DriveFolderPicker';
import { FolderMatchTable, type FolderMatchRow } from '@/components/settings/FolderMatchTable';

type Suggestions = Awaited<ReturnType<typeof api.getDriveFolderSuggestions>>;

/**
 * OneDrive/SharePoint tab of "จับคู่ folder": choose the parent folder that holds one folder per case,
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
        setItems(await api.getDriveFolderSuggestions(token, folder.driveId, folder.id));
      } catch (e) {
        setMessage(e instanceof ApiError ? e.message : 'โหลด folder ไม่สำเร็จ');
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
        ? `ผูกแล้ว ${picks.length - failed.length} folder — ไม่สำเร็จ: ${failed.join(' · ')}`
        : `ผูกแล้ว ${picks.length} folder`,
    );
    await load(parent);
    setSaving(false);
  };

  const unlink = async (linkId: string) => {
    const caseId = items.find((r) => r.link?.id === linkId)?.link?.caseId;
    if (!token || !parent || !caseId || !window.confirm('ยกเลิกการผูก folder นี้? ไฟล์ใน OneDrive จะไม่ถูกลบ')) return;
    setMessage('');
    try {
      await api.unlinkCaseDriveFolder(token, caseId);
      await load(parent);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : 'ยกเลิกการผูกไม่สำเร็จ');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPickerOpen(true)} className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent">
          {parent ? 'เปลี่ยน folder หลัก' : 'เลือก folder หลักที่เก็บ folder คดี'}
        </button>
        {parent && <span className="text-sm text-muted-foreground">{parent.name}</span>}
      </div>
      {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
      {loading && <p className="text-sm text-muted-foreground">กำลังจับคู่…</p>}
      {!loading && parent && (
        <FolderMatchTable rows={rows} cases={cases} saving={saving} onConfirm={confirm} onUnlink={unlink} />
      )}
      <DriveFolderPicker
        open={pickerOpen}
        title="เลือก folder หลัก (ที่มี folder ย่อยแยกตามคดี)"
        onClose={closePicker}
        onPick={choose}
      />
    </div>
  );
}
