'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { MessageSquare } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
      <h1 className="mb-1 text-2xl font-extrabold tracking-tight">ตั้งค่าการแจ้งเตือน</h1>
      <p className="mb-6 text-[13.5px] text-muted-foreground">จัดการช่องทางที่ใช้รับการแจ้งเตือนความคืบหน้าคดี</p>

      <div className="flex max-w-2xl flex-col gap-5">
        <Card className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[15.5px] font-bold">เชื่อมต่อ LINE</h2>
            {lineStatus?.connected && <Badge variant="success">เชื่อมต่อแล้ว</Badge>}
          </div>
          <p className="mb-4 text-[12.5px] text-muted-foreground">
            บัญชี LINE Official ของสำนักงานจะส่งแจ้งเตือนนัดศาล เอกสารใหม่ และข้อความจากทนายความ
          </p>

          {loadingData ? (
            <p className="text-sm text-muted-foreground">กำลังโหลด...</p>
          ) : loadError ? (
            <p className="text-sm text-destructive">{loadError}</p>
          ) : !lineStatus ? (
            <p className="text-sm text-muted-foreground">ไม่มีข้อมูล</p>
          ) : lineStatus.connected ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-border bg-accent/50 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-success/15 text-success">
                  <MessageSquare className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[13px] font-bold">
                    {lineStatus.connectedAt ? `เชื่อมต่อเมื่อ ${formatDateTime(lineStatus.connectedAt)}` : 'เชื่อมต่อแล้ว'}
                  </p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={handleDisconnect} disabled={disconnecting}>
                {disconnecting ? 'กำลังยกเลิกการเชื่อมต่อ...' : 'ยกเลิกการเชื่อมต่อ'}
              </Button>
            </div>
          ) : lineStatus.pendingLinkCode ? (
            <div className="rounded-lg border border-dashed border-border bg-accent/50 p-4">
              <p className="mb-2 text-[12.5px] text-muted-foreground">
                ส่งรหัสนี้ในแชท LINE Official ของสำนักงานเพื่อเชื่อมต่อบัญชีของท่าน
              </p>
              <p className="mb-2 text-[26px] font-extrabold tracking-widest">{lineStatus.pendingLinkCode}</p>
              {lineStatus.pendingLinkExpiresAt && (
                <p className="mb-3.5 text-[12px] text-muted-foreground">
                  รหัสหมดอายุ: {formatDateTime(lineStatus.pendingLinkExpiresAt)}
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

        <Card className="p-5">
          <h2 className="mb-3 text-[15.5px] font-bold">ช่องทางการแจ้งเตือน</h2>

          <div className="flex items-center justify-between border-b border-border py-3">
            <div>
              <p className="text-[13.5px] font-semibold">แจ้งเตือนทางอีเมล</p>
              <p className="text-[12px] text-muted-foreground">ส่งไปที่ {contact.email}</p>
            </div>
            <Checkbox checked readOnly />
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="text-[13.5px] font-semibold">แจ้งเตือนทาง LINE</p>
              <p className="text-[12px] text-muted-foreground">ต้องเชื่อมต่อบัญชี LINE ก่อนจึงจะเปิดใช้งานได้</p>
            </div>
            <Checkbox
              checked={lineNotificationsEnabled}
              onChange={handleToggleNotifications}
              disabled={updatingPreference}
              aria-label="เปิดใช้งานการแจ้งเตือนผ่าน LINE"
            />
          </div>
        </Card>

        {actionError && <p className="text-sm text-destructive">{actionError}</p>}
      </div>
    </PortalShell>
  );
}
