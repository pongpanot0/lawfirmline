'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { usePortalAuth } from '@/lib/portal-auth';
import {
  portalApi,
  PortalApiError,
  PortalLineStatus,
  PortalNotificationPreference,
} from '@/lib/portal-api';
import { PortalShell } from '@/components/layout/PortalShell';
import { Bell, Check, Clock, Copy, ExternalLink, Lock, Mail, MessageCircle } from 'lucide-react';

export default function PortalSettingsPage() {
  const router = useRouter();
  const codeRef = useRef<HTMLSpanElement>(null);
  const { contact, token, loading } = usePortalAuth();

  const [lineStatus, setLineStatus] = useState<PortalLineStatus | null>(null);
  const [lineNotificationsEnabled, setLineNotificationsEnabled] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [updatingPreference, setUpdatingPreference] = useState(false);
  const [openedLine, setOpenedLine] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!loading && !contact) router.replace('/portal/login');
  }, [loading, contact, router]);

  const loadData = useCallback(async () => {
    if (!token) return;
    setLoadingData(true);
    setLoadError(null);
    try {
      const [status, preferences] = await Promise.all([
        portalApi.getLineStatus(token),
        portalApi.getNotificationPreferences(token),
      ]);
      setLineStatus(status);
      const linePref = preferences.find((p: PortalNotificationPreference) => p.channel === 'LINE');
      setLineNotificationsEnabled(linePref ? linePref.isEnabled : true);
    } catch (err) {
      setLoadError(err instanceof PortalApiError ? err.message : 'ไม่สามารถโหลดข้อมูลได้');
    } finally {
      setLoadingData(false);
    }
  }, [token]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!lineStatus?.pendingLinkCode || lineStatus.connected || !token) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    const poll = window.setInterval(() => {
      portalApi.getLineStatus(token).then(setLineStatus).catch(() => {});
    }, 5000);
    return () => { window.clearInterval(timer); window.clearInterval(poll); };
  }, [lineStatus?.pendingLinkCode, lineStatus?.connected, token]);

  const handleCreateLinkCode = async () => {
    if (!token) return;
    setCreatingCode(true);
    setActionError(null);
    try {
      const result = await portalApi.createLineLinkCode(token);
      setNow(Date.now());
      setLineStatus((prev) =>
        prev
          ? {
              ...prev,
              pendingLinkCode: result.code,
              pendingLinkExpiresAt: result.expiresAt,
              officialAccountUrl: result.officialAccountUrl,
            }
          : prev,
      );
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : 'ไม่สามารถสร้างรหัสเชื่อมต่อได้');
    } finally {
      setCreatingCode(false);
    }
  };

  const handleDisconnect = async () => {
    if (!token) return;
    if (!window.confirm('ยกเลิกการเชื่อมต่อบัญชี LINE กับพอร์ทัลนี้? คุณจะไม่ได้รับแจ้งเตือนทาง LINE จนกว่าจะเชื่อมต่อใหม่')) return;
    setDisconnecting(true);
    setActionError(null);
    try {
      await portalApi.disconnectLine(token);
      await loadData();
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : 'ไม่สามารถยกเลิกการเชื่อมต่อได้');
    } finally {
      setDisconnecting(false);
    }
  };

  const handleToggleNotifications = async () => {
    if (!token) return;
    const next = !lineNotificationsEnabled;
    setUpdatingPreference(true);
    setActionError(null);
    try {
      const result = await portalApi.updateNotificationPreference(token, {
        channel: 'LINE',
        isEnabled: next,
      });
      setLineNotificationsEnabled(result.isEnabled);
    } catch (err) {
      setActionError(err instanceof PortalApiError ? err.message : 'ไม่สามารถอัปเดตการตั้งค่าได้');
    } finally {
      setUpdatingPreference(false);
    }
  };

  if (loading || !contact) return null;

  const secondsLeft = lineStatus?.pendingLinkExpiresAt ? Math.max(0, Math.ceil((new Date(lineStatus.pendingLinkExpiresAt).getTime() - now) / 1000)) : 0;
  const hasCode = !!lineStatus?.pendingLinkCode && (!lineStatus.pendingLinkExpiresAt || secondsLeft > 0);
  const step = lineStatus?.connected ? 3 : hasCode || openedLine ? 2 : 1;

  return (
    <PortalShell>
      <PageHeader title="ตั้งค่าการแจ้งเตือน" description="ช่องทางที่ใช้รับแจ้งเตือนนัดศาล เอกสารใหม่ และข้อความจากทนายความ" />

      <div className="flex max-w-2xl flex-col gap-5">
        <Card className="border-l-4 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5 shadow-sm sm:p-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-700"><Bell className="h-4 w-4" aria-hidden />แนะนำ</span>
          <h2 className="mt-2 font-display text-2xl font-semibold">รับแจ้งเตือนทาง LINE</h2>
          <p className="mt-2 text-muted-foreground">เชื่อมครั้งเดียว แล้วจะได้แจ้งเตือนนัดศาลในแชท LINE ของสำนักงาน</p>
          {loadingData ? <Skeleton className="mt-5 h-32 w-full" /> : loadError ? <LoadFailed message={loadError} onRetry={loadData} /> : lineStatus && <>
            <ol className="mt-6 space-y-5">
              {[1, 2, 3].map((number) => <li key={number} className="flex gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 font-semibold ${number < step || (number === 3 && lineStatus.connected) ? 'border-primary bg-primary text-primary-foreground' : number === step ? 'border-[var(--color-brass)] text-amber-700' : 'border-transparent bg-muted text-muted-foreground'}`}>
                  {number < step || (number === 3 && lineStatus.connected) ? <Check className="h-5 w-5" aria-label="เสร็จแล้ว" /> : number}
                </span>
                <div className="min-w-0 flex-1 pt-1">
                  <p className="font-semibold">{number === 1 ? (lineStatus.officialAccountUrl ? 'เปิด LINE ของสำนักงาน' : 'ค้นหาบัญชี LINE ของสำนักงาน') : number === 2 ? 'ส่งรหัสนี้ในแชท' : 'เชื่อมสำเร็จ'}</p>
                  {number === 1 && <p className="text-sm text-muted-foreground">เพิ่มบัญชี LINE ของสำนักงานเป็นเพื่อน</p>}
                  {number === 2 && hasCode && <div className="mt-3 rounded-lg border bg-card p-4 shadow-sm">
                    <div className="flex flex-wrap items-center justify-between gap-3"><span ref={codeRef} className="select-all break-all text-2xl font-semibold tracking-widest">{lineStatus.pendingLinkCode}</span><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(lineStatus.pendingLinkCode!); } catch { const range = document.createRange(); if (codeRef.current) { range.selectNodeContents(codeRef.current); const selection = window.getSelection(); selection?.removeAllRanges(); selection?.addRange(range); } } }}><Copy className="mr-2 h-4 w-4" aria-hidden />คัดลอกรหัส</Button></div>
                    <p className="mt-2 text-xs text-muted-foreground">หากคัดลอกไม่ได้ ให้เลือกข้อความเพื่อคัดลอก</p>
                    {lineStatus.pendingLinkExpiresAt && <p className="mt-3 flex items-center gap-2 border-t pt-3 text-sm text-muted-foreground"><Clock className="h-4 w-4" aria-hidden />รหัสใช้ได้อีก {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, '0')} นาที</p>}
                  </div>}
                  {number === 3 && <p className="text-sm text-muted-foreground">{lineStatus.connected ? 'เชื่อมต่อแล้ว' : 'หน้านี้จะขึ้นเครื่องหมายถูกเอง'}</p>}
                </div>
              </li>)}
            </ol>
            {lineStatus.connected ? <Button variant="ghost" className="mt-5 w-full" onClick={handleDisconnect} disabled={disconnecting}>{disconnecting ? 'กำลังยกเลิกการเชื่อมต่อ...' : 'ยกเลิกการเชื่อมต่อ'}</Button> : (step === 1 || hasCode) && lineStatus.officialAccountUrl ? <>
              <a href={lineStatus.officialAccountUrl!} target="_blank" rel="noreferrer" onClick={() => setOpenedLine(true)} className="mt-6 flex min-h-11 w-full items-center justify-center gap-2 rounded-md bg-primary px-4 text-primary-foreground">เปิด LINE ของสำนักงาน <ExternalLink className="h-4 w-4" aria-hidden /></a>
              <p className="mt-2 text-center text-xs text-muted-foreground">กดเพื่อเปิดแชท LINE ของสำนักงานในแอป LINE</p>
            </> : !hasCode ? <><Button className="mt-6 w-full" onClick={handleCreateLinkCode} disabled={creatingCode}>{creatingCode ? 'กำลังสร้างรหัส...' : 'สร้างรหัสเชื่อมต่อ'}</Button><p className="mt-2 text-center text-xs text-muted-foreground">กดเพื่อสร้างรหัสสำหรับส่งในแชท LINE</p></> : <p className="mt-5 text-center text-sm text-muted-foreground">ส่งรหัสนี้ในแชท LINE ของสำนักงาน</p>}
          </>}
        </Card>

        <Card className="p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold">ช่องทางการแจ้งเตือน</h2>
          <div className="flex min-h-11 items-center gap-3 border-b py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background"><Mail className="h-5 w-5" aria-hidden /></span>
            <div className="min-w-0 flex-1"><p className="font-semibold">อีเมล</p><p className="break-words text-sm text-muted-foreground">ส่งไปที่ {contact.email} · เปิดไว้เสมอ</p></div>
            <span aria-label="แจ้งเตือนทางอีเมล เปิดไว้เสมอ" className="flex h-10 w-16 shrink-0 items-center justify-end rounded-full bg-primary p-1"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-card"><Lock className="h-4 w-4" aria-hidden /></span></span>
          </div>
          <label htmlFor="portal-line-notify" className="flex min-h-11 items-center gap-3 py-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border bg-background"><MessageCircle className="h-5 w-5 text-muted-foreground" aria-hidden /></span>
            <span className="min-w-0 flex-1"><span className="block font-semibold">LINE</span><span className="block text-sm text-muted-foreground">{lineStatus?.connected ? 'กดเพื่อเปิดหรือปิดการแจ้งเตือนทาง LINE' : 'เชื่อม LINE ด้านบนก่อน จึงเปิดได้'}</span></span>
            <input id="portal-line-notify" type="checkbox" checked={!!lineStatus?.connected && lineNotificationsEnabled} onChange={handleToggleNotifications} disabled={updatingPreference || !lineStatus?.connected} className="peer sr-only" />
            <span className="flex h-10 w-16 shrink-0 items-center rounded-full bg-muted p-1 peer-checked:justify-end peer-checked:bg-primary peer-focus-visible:ring-2 peer-focus-visible:ring-ring"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-card shadow-sm">{!lineStatus?.connected && <Lock className="h-4 w-4 text-muted-foreground" aria-hidden />}</span></span>
          </label>
        </Card>

        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </div>
    </PortalShell>
  );
}
