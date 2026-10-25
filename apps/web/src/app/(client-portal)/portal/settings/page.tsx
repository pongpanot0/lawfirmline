'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { formatDateTime } from '@/lib/utils';

export default function PortalSettingsPage() {
  const router = useRouter();
  const { contact, token, loading } = usePortalAuth();

  const [lineStatus, setLineStatus] = useState<PortalLineStatus | null>(null);
  const [lineNotificationsEnabled, setLineNotificationsEnabled] = useState(true);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [creatingCode, setCreatingCode] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);
  const [updatingPreference, setUpdatingPreference] = useState(false);

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

  const handleCreateLinkCode = async () => {
    if (!token) return;
    setCreatingCode(true);
    setActionError(null);
    try {
      const result = await portalApi.createLineLinkCode(token);
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

  return (
    <PortalShell>
      <PageHeader title="ตั้งค่าการแจ้งเตือน" description="ช่องทางที่ใช้รับแจ้งเตือนนัดศาล เอกสารใหม่ และข้อความจากทนายความ" />

      <div className="flex max-w-2xl flex-col gap-5">
        <Card className="p-4 sm:p-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold">เชื่อมต่อ LINE</h2>
            {lineStatus?.connected && <Badge variant="success">เชื่อมต่อแล้ว</Badge>}
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            รับแจ้งเตือนผ่านบัญชี LINE Official ของสำนักงาน
          </p>

          {loadingData ? (
            <Skeleton className="h-11 w-48" />
          ) : loadError ? (
            <LoadFailed message={loadError} onRetry={loadData} />
          ) : !lineStatus ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>
          ) : lineStatus.connected ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-4">
              <p className="text-sm font-medium">
                {lineStatus.connectedAt ? `เชื่อมต่อเมื่อ ${formatDateTime(lineStatus.connectedAt)}` : 'เชื่อมต่อแล้ว'}
              </p>
              <Button
                variant="outline"
                size="sm"
                className="border-destructive/50 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onClick={handleDisconnect}
                disabled={disconnecting}
              >
                {disconnecting ? 'กำลังยกเลิกการเชื่อมต่อ...' : 'ยกเลิกการเชื่อมต่อ LINE'}
              </Button>
            </div>
          ) : lineStatus.pendingLinkCode ? (
            <div className="rounded-lg border border-border p-4">
              <p className="mb-2 text-sm text-muted-foreground">
                ส่งรหัสนี้ในแชท LINE Official ของสำนักงานเพื่อเชื่อมต่อบัญชีของคุณ
              </p>
              <p className="mb-2 text-2xl font-semibold tabular-nums tracking-widest">{lineStatus.pendingLinkCode}</p>
              {lineStatus.pendingLinkExpiresAt && (
                <p className="mb-3 text-sm text-muted-foreground">
                  รหัสหมดอายุ {formatDateTime(lineStatus.pendingLinkExpiresAt)}
                </p>
              )}
              <Button variant="outline" size="sm" onClick={handleCreateLinkCode} disabled={creatingCode}>
                {creatingCode ? 'กำลังสร้างรหัสใหม่...' : 'สร้างรหัสใหม่'}
              </Button>
            </div>
          ) : (
            <Button onClick={handleCreateLinkCode} disabled={creatingCode}>
              {creatingCode ? 'กำลังสร้างรหัส...' : 'สร้างรหัสเชื่อมต่อ'}
            </Button>
          )}
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="mb-2 text-base font-semibold">ช่องทางการแจ้งเตือน</h2>

          <div className="flex min-h-11 items-center justify-between gap-4 border-b border-border py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">แจ้งเตือนทางอีเมล</p>
              <p className="break-words text-sm text-muted-foreground">ส่งไปที่ {contact.email} (เปิดไว้เสมอ)</p>
            </div>
            <Checkbox checked readOnly disabled aria-label="แจ้งเตือนทางอีเมล เปิดไว้เสมอ" className="h-5 w-5" />
          </div>

          <label htmlFor="portal-line-notify" className="flex min-h-11 cursor-pointer items-center justify-between gap-4 py-3">
            <span className="min-w-0">
              <span className="block text-sm font-medium">แจ้งเตือนทาง LINE</span>
              <span className="block text-sm text-muted-foreground">ต้องเชื่อมต่อบัญชี LINE ก่อน</span>
            </span>
            <Checkbox
              id="portal-line-notify"
              checked={lineNotificationsEnabled}
              onChange={handleToggleNotifications}
              disabled={updatingPreference}
              className="h-5 w-5"
            />
          </label>
        </Card>

        {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
      </div>
    </PortalShell>
  );
}
