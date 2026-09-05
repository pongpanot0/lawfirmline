'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { usePortalAuth } from '@/lib/portal-auth';
import {
  portalApi,
  PortalApiError,
  PortalLineStatus,
  PortalNotificationPreference,
} from '@/lib/portal-api';

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
    <div className="min-h-screen w-full bg-background p-6">
      <div className="mx-auto w-full max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold">ตั้งค่าการแจ้งเตือน</h1>

        <Card>
          <CardHeader>
            <CardTitle>เชื่อมต่อ LINE</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <p className="text-muted-foreground">กำลังโหลด...</p>
            ) : loadError ? (
              <p className="text-destructive">{loadError}</p>
            ) : !lineStatus ? (
              <p className="text-muted-foreground">ไม่มีข้อมูล</p>
            ) : (
              <div className="space-y-3">
                <p>
                  สถานะ:{' '}
                  <span className={lineStatus.connected ? 'font-medium text-green-600' : 'font-medium text-muted-foreground'}>
                    {lineStatus.connected ? 'เชื่อมต่อแล้ว' : 'ยังไม่ได้เชื่อมต่อ'}
                  </span>
                </p>

                {lineStatus.connected ? (
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                  >
                    {disconnecting ? 'กำลังยกเลิกการเชื่อมต่อ...' : 'ยกเลิกการเชื่อมต่อ'}
                  </Button>
                ) : lineStatus.pendingLinkCode ? (
                  <div className="rounded border bg-accent/30 p-4">
                    <p className="text-sm text-muted-foreground">
                      ส่งรหัสนี้ในแชท LINE ของสำนักงานเพื่อเชื่อมต่อบัญชีของท่าน
                    </p>
                    <p className="mt-2 text-2xl font-bold tracking-wide">{lineStatus.pendingLinkCode}</p>
                    {lineStatus.pendingLinkExpiresAt && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        รหัสหมดอายุ: {new Date(lineStatus.pendingLinkExpiresAt).toLocaleString('th-TH')}
                      </p>
                    )}
                    <Button
                      className="mt-3"
                      variant="outline"
                      onClick={handleCreateLinkCode}
                      disabled={creatingCode}
                    >
                      {creatingCode ? 'กำลังสร้างรหัสใหม่...' : 'สร้างรหัสใหม่'}
                    </Button>
                  </div>
                ) : (
                  <Button onClick={handleCreateLinkCode} disabled={creatingCode}>
                    {creatingCode ? 'กำลังสร้างรหัส...' : 'สร้างรหัสเชื่อมต่อ'}
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>การแจ้งเตือนผ่าน LINE</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingData ? (
              <p className="text-muted-foreground">กำลังโหลด...</p>
            ) : loadError ? (
              <p className="text-destructive">{loadError}</p>
            ) : (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={lineNotificationsEnabled}
                  onChange={handleToggleNotifications}
                  disabled={updatingPreference}
                  aria-label="เปิดใช้งานการแจ้งเตือนผ่าน LINE"
                />
                <span>เปิดใช้งานการแจ้งเตือนผ่าน LINE</span>
              </label>
            )}
          </CardContent>
        </Card>

        {actionError && <p className="text-destructive">{actionError}</p>}
      </div>
    </div>
  );
}
