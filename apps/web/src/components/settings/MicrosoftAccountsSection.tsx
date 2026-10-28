'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ConnectionCaseLinkSummary, MailboxConnectionItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';

type Notice = { type: 'success' | 'error'; text: string } | null;
type SyncBody = { syncInboxToIntake?: boolean; syncCalendar?: boolean };

const OUTLOOK_STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'เชื่อมต่ออยู่',
  EXPIRED: 'หมดอายุ — ต้องเชื่อมต่อใหม่',
  REVOKED: 'ยกเลิกการเชื่อมต่อแล้ว',
  ERROR: 'มีปัญหา',
};

export function MicrosoftAccountsSection({ children }: { children?: React.ReactNode }) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [disconnectCheck, setDisconnectCheck] = useState<{ id: string; summary: ConnectionCaseLinkSummary } | null>(null);
  const [importingCaseId, setImportingCaseId] = useState<string | null>(null);
  const [connections, setConnections] = useState<MailboxConnectionItem[]>([]);
  const [connecting, setConnecting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  const loadConnections = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    api
      .getOutlookConnections(token)
      .then(setConnections)
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    loadConnections();
  }, [loadConnections]);

  useEffect(() => {
    const outlookResult = searchParams.get('outlook');
    if (outlookResult === 'connected') {
      setNotice({ type: 'success', text: 'เชื่อมต่อ Outlook สำเร็จ' });
      loadConnections();
    } else if (outlookResult === 'error') {
      setNotice({ type: 'error', text: searchParams.get('message') || 'เชื่อมต่อ Outlook ไม่สำเร็จ' });
    }
  }, [searchParams, loadConnections]);

  const handleConnect = async () => {
    const token = getStoredToken();
    if (!token) return;
    setConnecting(true);
    setNotice(null);
    try {
      const { url } = await api.getOutlookConnectUrl(token);
      window.location.href = url;
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'เริ่มการเชื่อมต่อไม่สำเร็จ' });
      setConnecting(false);
    }
  };

  const disconnectNow = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(id);
    try {
      await api.disconnectOutlook(token, id);
      setDisconnectCheck(null);
      await loadConnections();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  };

  /** Warn first when cases still depend on this mailbox (live OneDrive lists, folder sync, Office copies). */
  const handleDisconnect = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(id);
    try {
      const summary = await api.getOutlookConnectionCaseLinks(token, id);
      if (summary.caseLinks > 0 || summary.officeDocuments > 0) {
        setDisconnectCheck({ id, summary });
        return;
      }
    } catch {
      // Summary is advisory; fall through to the plain confirmation.
    } finally {
      setBusyId(null);
    }
    if (window.confirm('ยกเลิกการเชื่อมต่อบัญชี Microsoft นี้?')) await disconnectNow(id);
  };

  const importFolderBeforeDisconnect = async (caseId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setImportingCaseId(caseId);
    try {
      const result = await api.importCaseDriveFolder(token, caseId);
      setNotice({ type: 'success', text: `นำเข้าแล้ว ${result.imported} ไฟล์` });
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ' });
    } finally {
      setImportingCaseId(null);
    }
  };

  const handleSyncNow = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(id);
    try {
      const result = await api.syncOutlookNow(token, id);
      setNotice({ type: 'success', text: `ซิงก์แล้ว — พบอีเมลใหม่ ${result.messagesSynced} ฉบับ` });
      await loadConnections();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ซิงก์ไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  };

  const toggle = async (c: MailboxConnectionItem, body: SyncBody) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(c.id);
    try {
      const updated = await api.updateOutlookConnection(token, c.id, body);
      setConnections((list) => list.map((x) => (x.id === c.id ? { ...x, ...updated } : x)));
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ' });
    } finally {
      setBusyId(null);
    }
  };

  // Plain render function (not a component) so rows keep their DOM across parent re-renders.
  const renderRow = (c: MailboxConnectionItem) => (
    <div key={c.id} className="mt-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.mailboxAddress}</p>
          <p className="text-xs text-muted-foreground">
            {OUTLOOK_STATUS_LABEL[c.status] ?? c.status}
            {c.lastSyncedAt && ` · ซิงก์ล่าสุด ${formatDateTime(c.lastSyncedAt)}`}
          </p>
          {c.lastError && (
            <p className={`mt-0.5 text-xs ${c.status === 'ACTIVE' ? 'text-warning' : 'text-destructive'}`}>
              {c.lastError}
            </p>
          )}
        </div>
        {c.status !== 'REVOKED' && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {c.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleSyncNow(c.id)}>
                ซิงก์ตอนนี้
              </Button>
            )}
            <Button size="sm" variant="outline" className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busyId === c.id} onClick={() => handleDisconnect(c.id)}>
              ยกเลิกการเชื่อมต่อ
            </Button>
          </div>
        )}
      </div>
      {c.status === 'ACTIVE' && (
        <div className="mt-2 space-y-1">
          <label className="flex min-h-11 items-center gap-2 text-xs sm:min-h-8">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={c.syncCalendar}
              disabled={busyId === c.id}
              onChange={(e) => toggle(c, { syncCalendar: e.target.checked })}
            />
            ซิงก์นัดในระบบไปปฏิทิน Outlook
          </label>
          <label className="flex min-h-11 items-center gap-2 text-xs sm:min-h-8">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={c.syncInboxToIntake}
              disabled={busyId === c.id}
              onChange={(e) => {
                if (
                  e.target.checked &&
                  !window.confirm('อีเมลใหม่ใน Inbox ของบัญชีนี้จะเข้าคิว "รับเรื่องทางอีเมล" เห็นเฉพาะคุณ จนกว่าจะผูกกับคดีหรือส่งเป็นเรื่องรับใหม่ ยืนยันไหม?')
                )
                  return;
                toggle(c, { syncInboxToIntake: e.target.checked });
              }}
            />
            ดึง Inbox เข้าคิวรับเรื่องทางอีเมล
          </label>
        </div>
      )}
    </div>
  );


  return (
    <section>
      <div className="flex items-center gap-3">
        <Mail className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        <div>
          <p className="text-sm font-medium">Microsoft 365 (Outlook, ปฏิทิน, OneDrive)</p>
          <p className="text-xs text-muted-foreground">
            เชื่อมบัญชี Microsoft ของคุณเอง ระบบเห็นเฉพาะสิ่งที่บัญชีนั้นเห็นอยู่แล้ว
          </p>
        </div>
      </div>
      {hasFirmCapability(user?.firmRole, 'runOperations') && (
        <Link href="/settings/microsoft-status" className="mt-2 inline-flex min-h-11 items-center text-xs text-primary underline sm:min-h-0">
          ดูสถานะ Microsoft 365 ของทั้งสำนักงาน
        </Link>
      )}

      {notice && (
        <p role={notice.type === 'success' ? 'status' : 'alert'} className={`mt-3 rounded-lg p-2 text-xs ${notice.type === 'success' ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>
          {notice.text}
        </p>
      )}

      {disconnectCheck && (
        <div className="mt-3 rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-foreground">
          {disconnectCheck.summary.caseCount > 0 && (
            <p className="font-semibold">
              บัญชีนี้ผูก folder กับ {disconnectCheck.summary.caseCount} คดี — เมื่อตัดการเชื่อมต่อ รายการไฟล์และการซิงก์อีเมลของคดีเหล่านั้นจะหยุด
            </p>
          )}
          {disconnectCheck.summary.officeDocuments > 0 && (
            <p className="mt-1">
              มีเอกสาร {disconnectCheck.summary.officeDocuments} ไฟล์ที่เปิดแก้ใน Office ออนไลน์ด้วยบัญชีนี้ — กด &quot;ดึงเวอร์ชันล่าสุดกลับ&quot; ในคดีก่อน
            </p>
          )}
          {disconnectCheck.summary.driveFolders.length > 0 && (
            <ul className="mt-2 space-y-1.5">
              {disconnectCheck.summary.driveFolders.map((folder) => (
                <li key={folder.linkId} className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 break-all">
                    {folder.ownRef} {folder.caseTitle} — {folder.displayPath}
                  </span>
                  <button
                    type="button"
                    onClick={() => importFolderBeforeDisconnect(folder.caseId)}
                    disabled={importingCaseId === folder.caseId}
                    className="min-h-11 rounded-lg border border-input bg-card px-2.5 py-1 text-xs font-medium hover:bg-muted disabled:opacity-50 sm:min-h-8"
                  >
                    {importingCaseId === folder.caseId ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์ทั้ง folder'}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => setDisconnectCheck(null)}>
              ยกเลิก
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
              onClick={() => disconnectNow(disconnectCheck.id)}
              disabled={busyId === disconnectCheck.id}
            >
              ตัดการเชื่อมต่อ {connections.find((x) => x.id === disconnectCheck.id)?.mailboxAddress ?? ''}
            </Button>
          </div>
        </div>
      )}

      <p className="mt-3 text-xs font-medium text-muted-foreground">บัญชีของฉัน</p>
      {connections.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่ได้เชื่อมบัญชี</p>}
      {connections.map(renderRow)}

      <Button size="sm" variant={connections.some((c) => c.status === 'ACTIVE') ? 'outline' : 'default'} className="mt-3" onClick={handleConnect} disabled={connecting}>
        {connecting ? 'กำลังเปิด Microsoft...' : connections.some((c) => c.status === 'ACTIVE') ? 'เชื่อมบัญชีอื่นเพิ่ม' : 'เชื่อม Microsoft 365'}
      </Button>
      {children}
    </section>
  );
}
