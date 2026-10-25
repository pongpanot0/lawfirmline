'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError, type CaseListItem, type OutlookFolderRow } from '@/lib/api';
import { defaultFolderCaseId } from '@/lib/case-email';
import { Card, CardContent } from '@/components/ui/card';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
      <div>
        <Link href="/settings?view=integrations" className="inline-flex min-h-11 items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden />การเชื่อมต่อ
        </Link>
        <PageHeader
          title="จับคู่ folder กับคดี"
          description="คดีที่แนะนำมาจากเลขอ้างอิง เลขคดีดำ/แดง และชื่อลูกความในชื่อ folder ผูกเมื่อกดยืนยันเท่านั้น อีเมลใน folder ที่ผูกเข้าแท็บอีเมลของคดี"
        />
      </div>

      <Tabs value={matchTab} onValueChange={(v) => setMatchTab(v as 'outlook' | 'drive')}>
        <TabsList>
          <TabsTrigger value="outlook">Outlook</TabsTrigger>
          <TabsTrigger value="drive">OneDrive / SharePoint</TabsTrigger>
        </TabsList>
      </Tabs>

      {matchTab === 'drive' && <DriveFolderMatchingTab />}

      {matchTab === 'outlook' && loadError && (
        <LoadFailed message={loadError} onRetry={load} />
      )}
      {matchTab === 'outlook' && notice && (
        <p
          role={notice.type === 'success' ? 'status' : 'alert'}
          className={`rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}
        >
          {notice.text}
        </p>
      )}

      {matchTab === 'outlook' && !rows && !loadError && <div role="status" aria-label="กำลังดึงรายชื่อ folder จาก Outlook" className="h-64 animate-pulse rounded-xl bg-muted" />}

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
