'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileDown, Folder, FolderPlus, Link2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseDriveListing, DriveItemView, DrivePickerItem } from '@/lib/api';
import { driveDateTime, formatFileSize, openInNewTab } from '@/lib/drive-view';
import { DriveFolderPicker } from '@/components/drive/DriveFolderPicker';
import { Button } from '@/components/ui/button';
import { InlineEmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

/** ส่วน "OneDrive" ในแท็บเอกสารคดี — ไฟล์สดจาก folder ที่ผูกไว้ (ไม่เก็บสำเนา จนกว่าจะกดนำเข้า). */
export function CaseDriveSection({ caseId, onImported, newFolderName }: { caseId: string; onImported: () => void; newFolderName?: string }) {
  const { token } = useAuth();
  const [listing, setListing] = useState<CaseDriveListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  // "สร้าง folder ใหม่": the lawyer picks where, then confirms the name — nothing is created before "สร้างและผูก".
  const [createPickerOpen, setCreatePickerOpen] = useState(false);
  const [newParent, setNewParent] = useState<DrivePickerItem | null>(null);
  const [newName, setNewName] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const closePicker = useCallback(() => setPickerOpen(false), []);
  const closeCreatePicker = useCallback(() => setCreatePickerOpen(false), []);

  const load = () => {
    if (!token) return;
    setLoading(true);
    setError('');
    api
      .getCaseDrive(token, caseId)
      .then(setListing)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'โหลดรายการ OneDrive ไม่สำเร็จ'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, caseId]);

  const openItem = async (item: DriveItemView) => {
    if (!token) return;
    setError('');
    try {
      await openInNewTab(async () => (await api.openCaseDriveItem(token, caseId, item.id)).webUrl);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'เปิดไฟล์ไม่สำเร็จ');
    }
  };

  const importItem = async (item: DriveItemView) => {
    if (!token) return;
    setBusyId(item.id);
    setError('');
    setNotice('');
    try {
      await api.importCaseDriveItem(token, caseId, item.id);
      setNotice(`นำเข้า "${item.name}" เป็นเอกสารคดีแล้ว`);
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const importAll = async () => {
    if (!token || !window.confirm('นำเข้าไฟล์ทั้งหมดใน folder นี้เป็นเอกสารคดี?')) return;
    setBusyId('*');
    setError('');
    setNotice('');
    try {
      const result = await api.importCaseDriveFolder(token, caseId);
      setNotice(
        `นำเข้าแล้ว ${result.imported} ไฟล์` +
          (result.skipped.length ? ` — ข้าม ${result.skipped.length} ไฟล์ที่ใหญ่เกิน 100 MB: ${result.skipped.join(', ')}` : ''),
      );
      onImported();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const linkFolder = async (folder: DrivePickerItem) => {
    if (!token) return;
    await api.linkCaseDriveFolder(token, caseId, folder.driveId, folder.id);
    setPickerOpen(false);
    load();
  };

  const chooseNewParent = (folder: DrivePickerItem) => {
    setCreatePickerOpen(false);
    setNewParent(folder);
    setNewName(newFolderName ?? '');
  };

  const createFolder = async () => {
    if (!token || !newParent || !newName.trim()) return;
    setCreating(true);
    setError('');
    try {
      await api.createCaseDriveFolder(token, caseId, newParent.driveId, newParent.id, newName.trim());
      setNewParent(null);
      setNotice(`สร้าง folder "${newName.trim()}" ใน ${newParent.name} และผูกกับคดีแล้ว`);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้าง folder ไม่สำเร็จ');
    } finally {
      setCreating(false);
    }
  };

  const unlink = async () => {
    if (!token || !window.confirm('ยกเลิกการผูก folder นี้กับคดี? (ไฟล์ใน OneDrive ไม่ถูกลบ)')) return;
    try {
      await api.unlinkCaseDriveFolder(token, caseId);
      load();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'ยกเลิกการผูกไม่สำเร็จ');
    }
  };

  const hasFiles = listing?.state === 'OK' && listing.items.some((item) => !item.isFolder);

  return (
    <div className="mb-6 rounded-xl border bg-card p-6">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground">OneDrive</h2>
          {listing?.link && (
            <p className="break-all text-xs text-muted-foreground">
              {listing.link.displayPath}
              {listing.link.linkedBy ? ` · ผูกโดย ${listing.link.linkedBy}` : ''}
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {listing?.link && (
            <button type="button" onClick={load} className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 hover:bg-accent">
              <RefreshCw aria-hidden="true" className="h-3.5 w-3.5" />
              รีเฟรช
            </button>
          )}
          {hasFiles && (
            <button
              type="button"
              onClick={importAll}
              disabled={busyId === '*'}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 hover:bg-accent disabled:opacity-50"
            >
              <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
              {busyId === '*' ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์ทั้ง folder'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 font-medium hover:bg-accent"
          >
            <Link2 aria-hidden="true" className="h-3.5 w-3.5" />
            {listing?.link ? 'เปลี่ยน folder' : 'ผูก folder OneDrive'}
          </button>
          {listing?.state === 'NO_LINK' && (
            <button
              type="button"
              onClick={() => setCreatePickerOpen(true)}
              className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 font-medium hover:bg-accent"
            >
              <FolderPlus aria-hidden="true" className="h-3.5 w-3.5" />
              สร้าง folder ใหม่
            </button>
          )}
          {listing?.link && (
            <button type="button" onClick={unlink} className="inline-flex min-h-11 items-center rounded-lg border border-destructive/40 px-2.5 py-1 text-xs text-destructive hover:bg-destructive/5 sm:min-h-8">
              ยกเลิกการผูก
            </button>
          )}
        </div>
      </div>

      {error && !loading && !listing ? (
        <LoadFailed message={error} onRetry={load} />
      ) : error ? (
        <p role="alert" className="mb-2 text-sm text-destructive">{error}</p>
      ) : null}
      {notice && <p role="status" className="mb-2 text-sm text-success">{notice}</p>}
      {newParent && (
        <div className="mb-3 space-y-2 rounded-lg border bg-muted/30 p-3">
          <label className="block text-sm">
            ชื่อ folder ใหม่ใน <strong>{newParent.name}</strong>
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={200}
              className="mt-1 min-h-10 w-full rounded-md border bg-background px-2 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <div className="flex gap-2">
            <Button size="sm" disabled={creating || !newName.trim()} onClick={createFolder}>
              {creating ? 'กำลังสร้าง…' : 'สร้างและผูก'}
            </Button>
            <Button size="sm" variant="outline" disabled={creating} onClick={() => setNewParent(null)}>
              ยกเลิก
            </Button>
          </div>
        </div>
      )}
      {loading && (
        <div role="status" aria-label="กำลังโหลดจาก OneDrive" className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      )}

      {!loading && listing?.state === 'NO_LINK' && (
        <InlineEmptyState title="ยังไม่ได้ผูก folder OneDrive ของคดี" />
      )}

      {!loading && listing && (listing.state === 'DISCONNECTED' || listing.state === 'ERROR') && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-foreground">
          <span>{listing.message}</span>
          <Button type="button" size="sm" variant="outline" onClick={load}>ลองใหม่</Button>
        </div>
      )}

      {!loading && listing?.state === 'OK' && (
        <div className="space-y-2">
          {listing.items.length === 0 && <InlineEmptyState title="folder นี้ยังไม่มีไฟล์" />}
          {listing.items.map((item) => (
            <div
              key={item.id}
              className="flex flex-col gap-2 rounded-lg border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 break-all font-medium">
                  {item.isFolder && <Folder className="h-4 w-4 shrink-0 text-muted-foreground" />}
                  {item.name}
                </p>
                <p className="text-xs text-muted-foreground">
                  {[formatFileSize(item.size), item.lastModifiedBy, driveDateTime(item.lastModifiedDateTime)].filter(Boolean).join(' · ')}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => openItem(item)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 font-medium hover:bg-accent"
                >
                  <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
                  {item.isFolder ? 'เปิดใน OneDrive' : 'เปิดใน Office ออนไลน์'}
                </button>
                {!item.isFolder && (
                  <button
                    type="button"
                    onClick={() => importItem(item)}
                    disabled={busyId === item.id}
                    className="inline-flex min-h-11 items-center gap-1 rounded-lg border px-2.5 py-1 text-xs sm:min-h-8 font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <FileDown aria-hidden="true" className="h-3.5 w-3.5" />
                    {busyId === item.id ? 'กำลังนำเข้า…' : 'นำเข้าเป็นเอกสารคดี'}
                  </button>
                )}
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            ถ้า Microsoft แจ้งว่าไม่มีสิทธิ์เปิดไฟล์ ให้ขอผู้ผูก folder แชร์ให้ใน OneDrive หรือกด &quot;นำเข้าเป็นเอกสารคดี&quot;
          </p>
        </div>
      )}

      <DriveFolderPicker open={pickerOpen} title="เลือก folder OneDrive ของคดี" onClose={closePicker} onPick={linkFolder} />
      <DriveFolderPicker open={createPickerOpen} title="เลือกที่เก็บ folder ใหม่" onClose={closeCreatePicker} onPick={chooseNewParent} />
    </div>
  );
}
