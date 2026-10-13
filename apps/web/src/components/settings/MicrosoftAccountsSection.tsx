'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, MailboxConnectionItem } from '@/lib/api';
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
  const isOwner = user?.firmRole === 'OWNER';
  const searchParams = useSearchParams();
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

  const handleDisconnect = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setBusyId(id);
    try {
      await api.disconnectOutlook(token, id);
      await loadConnections();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' });
    } finally {
      setBusyId(null);
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
  const renderRow = (c: MailboxConnectionItem, canManage: boolean) => (
    <div key={c.id} className="mt-2 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.mailboxAddress}</p>
          {!c.isMine && (
            <p className="text-xs text-muted-foreground">
              เจ้าของ: {c.user ? `${c.user.firstName} ${c.user.lastName}` : '—'}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {OUTLOOK_STATUS_LABEL[c.status] ?? c.status}
            {c.lastSyncedAt && ` · ซิงก์ล่าสุด ${formatDateTime(c.lastSyncedAt)}`}
          </p>
          {c.lastError && c.status !== 'ACTIVE' && <p className="mt-0.5 text-xs text-destructive">{c.lastError}</p>}
        </div>
        {canManage && c.status !== 'REVOKED' && (
          <div className="flex shrink-0 gap-2">
            {c.status === 'ACTIVE' && (
              <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleSyncNow(c.id)}>
                ซิงก์ตอนนี้
              </Button>
            )}
            <Button size="sm" variant="outline" disabled={busyId === c.id} onClick={() => handleDisconnect(c.id)}>
              ยกเลิกการเชื่อมต่อ
            </Button>
          </div>
        )}
      </div>
      {canManage && c.status === 'ACTIVE' && (
        <div className="mt-2 space-y-1">
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={c.syncCalendar}
              disabled={busyId === c.id}
              onChange={(e) => toggle(c, { syncCalendar: e.target.checked })}
            />
            ซิงก์นัดในระบบไปปฏิทิน Outlook
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={c.syncInboxToIntake}
              disabled={busyId === c.id}
              onChange={(e) => {
                if (
                  e.target.checked &&
                  !window.confirm('อีเมลใหม่ใน Inbox ของบัญชีนี้จะเข้าคิว "รับเรื่องทางอีเมล" และเจ้าของ/ผู้จัดการสำนักงานจะเห็นได้ ยืนยันไหม?')
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

  const mine = connections.filter((c) => c.isMine);
  const others = connections.filter((c) => !c.isMine);

  return (
    <section>
      <div className="flex items-center gap-3">
        <Mail className="h-4 w-4 text-muted-foreground" />
        <div>
          <p className="text-sm font-medium">Microsoft 365 (Outlook, ปฏิทิน, OneDrive)</p>
          <p className="text-xs text-muted-foreground">
            เชื่อมบัญชี Microsoft ของคุณเอง ระบบเห็นเฉพาะสิ่งที่บัญชีนั้นเห็นอยู่แล้ว
          </p>
        </div>
      </div>

      {notice && (
        <p className={`mt-3 rounded-lg p-2 text-xs ${notice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
          {notice.text}
        </p>
      )}

      <p className="mt-3 text-xs font-medium text-muted-foreground">บัญชีของฉัน</p>
      {mine.length === 0 && <p className="text-xs text-muted-foreground">ยังไม่ได้เชื่อม</p>}
      {mine.map((c) => renderRow(c, true))}

      {others.length > 0 && (
        <>
          <p className="mt-4 text-xs font-medium text-muted-foreground">บัญชีอื่นในสำนักงาน</p>
          {others.map((c) => renderRow(c, isOwner))}
        </>
      )}

      <Button size="sm" className="mt-3" onClick={handleConnect} disabled={connecting}>
        {connecting ? 'กำลังเปิด Microsoft...' : mine.some((c) => c.status === 'ACTIVE') ? 'เชื่อมบัญชีอื่นเพิ่ม' : 'เชื่อม Microsoft 365'}
      </Button>
      {children}
    </section>
  );
}
