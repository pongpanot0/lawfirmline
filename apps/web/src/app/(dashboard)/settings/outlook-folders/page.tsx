'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseListItem, type OutlookFolderRow } from '@/lib/api';
import { defaultFolderCaseId } from '@/lib/case-email';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageLoading } from '@/components/ui/misc';
import { DriveFolderMatchingTab } from '@/components/settings/DriveFolderMatchingTab';
import { FolderMatchTable, type FolderMatchRow } from '@/components/settings/FolderMatchTable';

type Notice = { type: 'success' | 'error'; text: string } | null;

/** ตั้งค่า → Microsoft 365 → จับคู่ folder: nothing links until "ยืนยัน". */
export default function OutlookFolderMatchPage() {
  const { token } = useAuth();
  const [folders, setFolders] = useState<OutlookFolderRow[] | null>(null);
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loadError, setLoadError] = useState('');
  const [notice, setNotice] = useState<Notice>(null);
  const [saving, setSaving] = useState(false);
  const [matchTab, setMatchTab] = useState<'outlook' | 'drive'>('outlook');

  const load = useCallback(async () => {
    if (!token) return;
    setLoadError('');
    try {
      const [folderRows, caseList] = await Promise.all([
        api.getOutlookFolders(token),
        api.getCases(token).catch(() => [] as CaseListItem[]),
      ]);
      setFolders(folderRows);
      setCases(caseList);
    } catch (e) {
      setLoadError(e instanceof ApiError ? e.message : 'ดึงรายชื่อ folder จาก Outlook ไม่สำเร็จ');
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const rows = useMemo<FolderMatchRow[] | null>(
    () =>
      folders?.map((f) => ({
        id: f.folderId,
        name: f.displayPath,
        suggestions: f.suggestions,
        link: f.link && { id: f.link.id, ownRef: f.link.ownRef, title: f.link.title },
        defaultCaseId: defaultFolderCaseId(f),
      })) ?? null,
    [folders],
  );

  const confirm = async (items: { id: string; caseId: string }[]) => {
    if (!token || items.length === 0) return;
    setSaving(true);
    setNotice(null);
    try {
      const result = await api.linkOutlookFolders(
        token,
        items.map((i) => ({ folderId: i.id, caseId: i.caseId })),
      );
      setNotice({ type: 'success', text: `ผูกแล้ว ${result.linked.length} folder — ระบบกำลังดึงอีเมลย้อนหลังเข้าแต่ละคดี` });
      await load();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ผูก folder ไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (linkId: string) => {
    if (!token || saving || !window.confirm('ยกเลิกการผูก folder นี้? อีเมลที่ดึงเข้าคดีแล้วจะยังอยู่ในคดี')) return;
    setSaving(true);
    setNotice(null);
    try {
      await api.unlinkOutlookFolder(token, linkId);
      await load();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ยกเลิกการผูกไม่สำเร็จ' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> กลับไปหน้าตั้งค่า
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-tight">จับคู่ folder กับคดี</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          ระบบแนะนำคดีจากเลขอ้างอิง เลขคดีดำ/แดง และชื่อลูกความในชื่อ folder (Outlook หรือ OneDrive / SharePoint) — ไม่มีการผูกจนกว่าคุณจะกด &quot;ยืนยัน&quot;.
          อีเมลใน folder ที่ผูกจะเข้าแท็บอีเมลของคดี และทุกคนที่มีสิทธิ์ในคดีจะเห็น
        </p>
      </div>

      <div className="flex gap-1.5">
        {(
          [
            ['outlook', 'Outlook'],
            ['drive', 'OneDrive / SharePoint'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setMatchTab(value)}
            className={`min-h-9 rounded-lg px-3 py-1 text-xs ${
              matchTab === value ? 'bg-primary text-primary-foreground' : 'border bg-card text-muted-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {matchTab === 'drive' && <DriveFolderMatchingTab />}

      {matchTab === 'outlook' && loadError && (
        <div role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          <p>{loadError}</p>
          <div className="mt-2 flex items-center gap-3">
            <Button size="sm" variant="outline" onClick={load}>
              ลองใหม่
            </Button>
            <Link href="/settings" className="underline">
              ไปหน้าตั้งค่า
            </Link>
          </div>
        </div>
      )}
      {matchTab === 'outlook' && notice && (
        <p
          role="status"
          className={`rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-destructive/10 text-destructive'}`}
        >
          {notice.text}
        </p>
      )}

      {matchTab === 'outlook' && !rows && !loadError && <PageLoading title="กำลังดึงรายชื่อ folder จาก Outlook" lines={4} />}

      {matchTab === 'outlook' && rows && (
        <Card>
          <CardContent className="p-4">
            <FolderMatchTable rows={rows} cases={cases} saving={saving} onConfirm={confirm} onUnlink={unlink} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
