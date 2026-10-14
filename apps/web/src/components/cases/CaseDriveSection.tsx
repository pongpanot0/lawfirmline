'use client';

import { useCallback, useEffect, useState } from 'react';
import { ExternalLink, FileDown, Folder, Link2, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, CaseDriveListing, DriveItemView, DrivePickerItem } from '@/lib/api';
import { driveDateTime, formatFileSize, openInNewTab } from '@/lib/drive-view';
import { DriveFolderPicker } from '@/components/drive/DriveFolderPicker';

/** ส่วน "OneDrive" ในแท็บเอกสารคดี — ไฟล์สดจาก folder ที่ผูกไว้ (ไม่เก็บสำเนา จนกว่าจะกดนำเข้า). */
export function CaseDriveSection({ caseId, onImported }: { caseId: string; onImported: () => void }) {
  const { token } = useAuth();
  const [listing, setListing] = useState<CaseDriveListing | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const closePicker = useCallback(() => setPickerOpen(false), []);

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
    <div className="mb-6 rounded-xl border bg-card p-6 shadow-soft">
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
            <button type="button" onClick={load} className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs hover:bg-accent">
              <RefreshCw className="h-3.5 w-3.5" />
              รีเฟรช
            </button>
          )}
          {hasFiles && (
            <button
              type="button"
              onClick={importAll}
              disabled={busyId === '*'}
              className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs hover:bg-accent disabled:opacity-50"
            >
              <FileDown className="h-3.5 w-3.5" />
              {busyId === '*' ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์ทั้ง folder'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
          >
            <Link2 className="h-3.5 w-3.5" />
            {listing?.link ? 'เปลี่ยน folder' : 'ผูก folder OneDrive'}
          </button>
          {listing?.link && (
            <button type="button" onClick={unlink} className="rounded-lg border px-2.5 py-1 text-xs hover:bg-accent">
              ยกเลิกการผูก
            </button>
          )}
        </div>
      </div>

      {error && <p className="mb-2 text-sm text-destructive">{error}</p>}
      {notice && <p className="mb-2 text-sm text-emerald-700 dark:text-emerald-300">{notice}</p>}
      {loading && <p className="text-sm text-muted-foreground">กำลังโหลดจาก OneDrive…</p>}

      {!loading && listing?.state === 'NO_LINK' && (
        <p className="text-sm text-muted-foreground">
          ยังไม่ได้ผูก folder — กด &quot;ผูก folder OneDrive&quot; เพื่อแสดงไฟล์คดีจาก OneDrive/SharePoint ที่นี่
        </p>
      )}

      {!loading && listing && (listing.state === 'DISCONNECTED' || listing.state === 'ERROR') && (
        <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
          {listing.message}
        </p>
      )}

      {!loading && listing?.state === 'OK' && (
        <div className="space-y-2">
          {listing.items.length === 0 && <p className="text-sm text-muted-foreground">folder นี้ยังไม่มีไฟล์</p>}
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
                  className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  {item.isFolder ? 'เปิดใน OneDrive' : 'เปิดใน Office ออนไลน์'}
                </button>
                {!item.isFolder && (
                  <button
                    type="button"
                    onClick={() => importItem(item)}
                    disabled={busyId === item.id}
                    className="inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  >
                    <FileDown className="h-3.5 w-3.5" />
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
    </div>
  );
}
