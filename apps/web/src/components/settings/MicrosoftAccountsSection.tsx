'use client';

import { useCallback, useEffect, useState } from 'react';
import { Mail, Star } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, ConnectionCaseLinkSummary, MailboxConnectionItem } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/utils';
import { confirmDialog } from '@/lib/confirm-dialog';

type Notice = { type: 'success' | 'error'; text: string } | null;
type SyncBody = { syncInboxToIntake?: boolean; syncCalendar?: boolean; showCalendar?: boolean };

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
      setNotice({ type: 'error', text: searchParams.get('message') || 'เชื่อมต่อ Outlook ไม่สำเร็จ ลองใหม่อีกครั้ง' });
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
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'เชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง' });
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
      const previous = connections.find(c => c.id === id);
      const updated = await api.getOutlookConnections(token);
      setConnections(updated);
      const primary = updated.find(c => c.isPrimary);
      if (previous?.isPrimary && primary) setNotice({ type: 'success', text: `ตั้ง ${primary.mailboxAddress} เป็นบัญชีหลักแทนแล้ว เพราะบัญชีเดิมถูกตัดการเชื่อมต่อ` });
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ ลองใหม่อีกครั้ง' });
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
    if (await confirmDialog('ยกเลิกการเชื่อมต่อบัญชี Microsoft นี้?')) await disconnectNow(id);
  };

  const importFolderBeforeDisconnect = async (caseId: string) => {
    const token = getStoredToken();
    if (!token) return;
    setImportingCaseId(caseId);
    try {
      const result = await api.importCaseDriveFolder(token, caseId);
      setNotice({ type: 'success', text: `นำเข้าแล้ว ${result.imported} ไฟล์` });
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'นำเข้าไม่สำเร็จ ลองใหม่อีกครั้ง' });
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
      setNotice({ type: 'success', text: `ดึงอีเมลแล้ว — พบอีเมลใหม่ ${result.messagesSynced} ฉบับ` });
      await loadConnections();
    } catch (e) {
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ดึงอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง' });
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
      setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง' });
    } finally {
      setBusyId(null);
    }
  };

  const setPrimary = async (id: string) => {
    const token = getStoredToken(); if (!token) return;
    setBusyId(id);
    try { setConnections(await api.setOutlookPrimary(token, id)); }
    catch (e) { setNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ตั้งบัญชีหลักไม่สำเร็จ' }); }
    finally { setBusyId(null); }
  };
  const action = (label: string, hint: string, onClick: () => void, disabled: boolean, destructive = false) => <div className="text-center"><Button size="sm" variant="outline" className={destructive ? 'text-destructive' : ''} disabled={disabled} onClick={onClick}>{label}</Button><p className="mt-1 text-xs text-muted-foreground">{hint}</p></div>;
  const switchRow = (c: MailboxConnectionItem, label: string, checked: boolean, onChange: (value: boolean) => void, hint?: string) => <label className="flex min-h-11 items-center justify-between gap-4 border-t py-2 text-sm"><span>{label}{hint && <span className="block text-xs text-muted-foreground">{hint}</span>}</span><span className="relative inline-flex shrink-0 items-center"><input type="checkbox" role="switch" aria-checked={checked} checked={checked} disabled={busyId === c.id || c.status !== 'ACTIVE'} onChange={e => onChange(e.target.checked)} className="peer sr-only" /><span aria-hidden className="h-6 w-11 rounded-full bg-muted-foreground/30 peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-disabled:opacity-50" /><span aria-hidden className="absolute left-1 h-4 w-4 rounded-full bg-card transition-transform peer-checked:translate-x-5" /></span></label>;
  const renderRow = (c: MailboxConnectionItem) => <div key={c.id} className={`mt-3 rounded-lg border bg-card p-4 ${c.isPrimary ? 'border-l-4 border-l-primary' : ''}`}>
    <div className="flex flex-wrap justify-between gap-3"><div><p className="font-medium">{c.mailboxAddress} {c.isPrimary && <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-xs text-primary-foreground"><Star className="h-3 w-3" aria-hidden />บัญชีหลัก</span>}</p>
      <p className="text-xs text-muted-foreground">{OUTLOOK_STATUS_LABEL[c.status] ?? c.status}{c.lastSyncedAt && ` · ดึงอีเมลล่าสุด ${formatDateTime(c.lastSyncedAt)}`}{c.calendarSyncedAt && ` · ดึงนัดล่าสุด ${new Date(c.calendarSyncedAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' })}`}</p>
      {c.lastError && <p className="text-xs text-destructive">{c.lastError}</p>}</div>
      {c.status !== 'REVOKED' && <div className="flex flex-wrap gap-2">
        {!c.isPrimary && c.status === 'ACTIVE' && action('ตั้งเป็นบัญชีหลัก', 'กดเพื่อใช้บัญชีนี้ส่งอีเมลใหม่และรับนัดจากระบบ', () => void setPrimary(c.id), busyId === c.id)}
        {c.status === 'ACTIVE' && action('ดึงอีเมลตอนนี้', 'กดเพื่อดึงอีเมลใหม่ทันที', () => void handleSyncNow(c.id), busyId === c.id)}
        {c.status === 'EXPIRED' && action('เชื่อมใหม่', 'กดเพื่อลงชื่อเข้า Microsoft อีกครั้ง', () => void handleConnect(), connecting)}
        {action('ยกเลิกการเชื่อมต่อ', 'กดเพื่อตัดบัญชีนี้ออก นัดจากบัญชีนี้จะถูกลบออกจากระบบ', () => void handleDisconnect(c.id), busyId === c.id, true)}
      </div>}</div>
    {c.isPrimary && c.status === 'EXPIRED' && <p className="mt-3 rounded bg-warning/10 p-3 text-sm">บัญชีหลัก {c.mailboxAddress} หมดอายุ — ระบบหยุดส่งอีเมลใหม่และส่งนัดเข้า Outlook ไว้ก่อน</p>}
    {c.status !== 'REVOKED' && <div className="mt-3">{switchRow(c, 'แสดงนัดจากบัญชีนี้ในปฏิทินของระบบ', c.showCalendar, value => void toggle(c, { showCalendar: value }), 'คุณเห็นรายละเอียดนัด เพื่อนร่วมงานเห็นแค่ช่วงที่ไม่ว่าง')}
      {c.isPrimary && switchRow(c, 'ส่งนัดในระบบเข้าปฏิทินของบัญชีนี้', c.syncCalendar, value => void toggle(c, { syncCalendar: value }))}
      {c.status === 'ACTIVE' && switchRow(c, 'ดึง Inbox เข้าคิวรับเรื่องทางอีเมล', c.syncInboxToIntake, async value => { if (value && !await confirmDialog('อีเมลใหม่ใน Inbox ของบัญชีนี้จะเข้าคิว "รับเรื่องทางอีเมล" และเห็นเฉพาะคุณจนกว่าจะผูกกับคดีหรือรับเป็นคดีก่อนฟ้อง ยืนยันไหม?')) return; void toggle(c, { syncInboxToIntake: value }); })}</div>}
  </div>;

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
                    {importingCaseId === folder.caseId ? 'กำลังนำเข้า…' : 'นำเข้าไฟล์ทั้งโฟลเดอร์'}
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
      <p className="mt-3 rounded-lg bg-muted p-3 text-xs">บัญชีหลักใช้ส่งอีเมลใหม่ รับนัดจากระบบ และเปิดไฟล์ OneDrive · การตอบกลับส่งจากบัญชีที่อีเมลนั้นเข้ามาเสมอ</p>
      {[...connections].sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)).map(renderRow)}

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <Button size="sm" variant={connections.some((c) => c.status === 'ACTIVE') ? 'outline' : 'default'} onClick={handleConnect} disabled={connecting}>
          {connecting ? 'กำลังเปิด Microsoft...' : connections.some((c) => c.status === 'ACTIVE') ? 'เชื่อมบัญชีอื่นเพิ่ม' : 'เชื่อม Microsoft 365'}
        </Button>
        <p className="text-xs text-muted-foreground">กดเพื่อเพิ่มบัญชี Microsoft อีกบัญชี</p>
        {children}
      </div>
    </section>
  );
}
