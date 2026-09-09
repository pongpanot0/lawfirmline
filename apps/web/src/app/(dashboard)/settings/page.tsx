'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Bell, Key, Building2, Sparkles, Copy, ExternalLink, Mail } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api, ApiError, LineIntegrationStatus, LinePersonalStatus, MailboxConnectionItem, NotificationPreferences } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { formatDate, formatDateTime } from '@/lib/utils';

export default function SettingsPage() {
  const d = useDashboardT();
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [lineStatus, setLineStatus] = useState<LineIntegrationStatus | null>(null);
  const [linePersonal, setLinePersonal] = useState<LinePersonalStatus | null>(null);
  const [lineTesting, setLineTesting] = useState(false);
  const [lineTestResult, setLineTestResult] = useState<string | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [disconnectLoading, setDisconnectLoading] = useState(false);
  const [linkCode, setLinkCode] = useState<string | null>(null);
  const [linkExpiresAt, setLinkExpiresAt] = useState<string | null>(null);
  const [oaUrl, setOaUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [prefsSaving, setPrefsSaving] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const searchParams = useSearchParams();
  const [mailboxConnections, setMailboxConnections] = useState<MailboxConnectionItem[]>([]);
  const [outlookConnecting, setOutlookConnecting] = useState(false);
  const [outlookActionId, setOutlookActionId] = useState<string | null>(null);
  const [outlookNotice, setOutlookNotice] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadOutlookConnections = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    api
      .getOutlookConnections(token)
      .then(setMailboxConnections)
      .catch(() => setMailboxConnections([]));
  }, []);

  useEffect(() => {
    loadOutlookConnections();
  }, [loadOutlookConnections]);

  useEffect(() => {
    const outlookResult = searchParams.get('outlook');
    if (outlookResult === 'connected') {
      setOutlookNotice({ type: 'success', text: 'เชื่อมต่อ Outlook สำเร็จ' });
      loadOutlookConnections();
    } else if (outlookResult === 'error') {
      setOutlookNotice({ type: 'error', text: searchParams.get('message') || 'เชื่อมต่อ Outlook ไม่สำเร็จ' });
    }
  }, [searchParams, loadOutlookConnections]);

  const handleConnectOutlook = async () => {
    const token = getStoredToken();
    if (!token) return;
    setOutlookConnecting(true);
    setOutlookNotice(null);
    try {
      const { url } = await api.getOutlookConnectUrl(token);
      window.location.href = url;
    } catch (e) {
      setOutlookNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'เริ่มการเชื่อมต่อไม่สำเร็จ' });
      setOutlookConnecting(false);
    }
  };

  const handleDisconnectOutlook = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setOutlookActionId(id);
    try {
      await api.disconnectOutlook(token, id);
      await loadOutlookConnections();
    } catch (e) {
      setOutlookNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ยกเลิกการเชื่อมต่อไม่สำเร็จ' });
    } finally {
      setOutlookActionId(null);
    }
  };

  const handleSyncOutlookNow = async (id: string) => {
    const token = getStoredToken();
    if (!token) return;
    setOutlookActionId(id);
    try {
      const result = await api.syncOutlookNow(token, id);
      setOutlookNotice({ type: 'success', text: `ซิงก์แล้ว — พบอีเมลใหม่ ${result.messagesSynced} ฉบับ` });
      await loadOutlookConnections();
    } catch (e) {
      setOutlookNotice({ type: 'error', text: e instanceof ApiError ? e.message : 'ซิงก์ไม่สำเร็จ' });
    } finally {
      setOutlookActionId(null);
    }
  };

  const OUTLOOK_STATUS_LABEL: Record<string, string> = {
    ACTIVE: 'เชื่อมต่ออยู่',
    EXPIRED: 'หมดอายุ — ต้องเชื่อมต่อใหม่',
    REVOKED: 'ยกเลิกการเชื่อมต่อแล้ว',
    ERROR: 'มีปัญหา',
  };

  const loadLineData = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    const [status, personal] = await Promise.all([
      api.getLineStatus(token).catch(() => null),
      api.getLinePersonalStatus(token).catch(() => null),
    ]);
    setLineStatus(status);
    setLinePersonal(personal);
    if (personal?.pendingLinkCode) {
      setLinkCode(personal.pendingLinkCode);
      setLinkExpiresAt(personal.pendingLinkExpiresAt);
    }
    if (personal?.officialAccountUrl) {
      setOaUrl(personal.officialAccountUrl);
    }
  }, []);

  useEffect(() => {
    loadLineData();
  }, [loadLineData]);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    api.getMyPreferences(token).then(setPrefs).catch(() => setPrefs(null));
  }, []);

  const handleDigestToggle = async () => {
    const token = getStoredToken();
    if (!token || !prefs) return;
    setPrefsSaving(true);
    setPrefsError('');
    try {
      setPrefs(await api.updateMyPreferences(token, { dailyDigestEnabled: !prefs.dailyDigestEnabled }));
    } catch {
      setPrefsError(d.digest.saveFailed);
    } finally {
      setPrefsSaving(false);
    }
  };

  const handleLineTest = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLineTesting(true);
    setLineTestResult(null);
    try {
      const res = await api.testLineIntegration(token);
      setLineTestResult(
        res.ok
          ? `ส่งข้อความทดสอบสำเร็จ (${res.mode === 'push' ? 'ส่งเฉพาะบุคคล' : 'ส่งเป็นวงกว้าง'})`
          : 'ส่งไม่สำเร็จ — ตรวจสอบ Channel ID/Secret และ webhook ใน LINE Console',
      );
    } catch {
      setLineTestResult('ส่งไม่สำเร็จ — ต้องเป็น Admin');
    } finally {
      setLineTesting(false);
    }
  };

  const handleCreateLinkCode = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLinkLoading(true);
    try {
      const res = await api.createLineLinkCode(token);
      setLinkCode(res.code);
      setLinkExpiresAt(res.expiresAt);
      if (res.officialAccountUrl) setOaUrl(res.officialAccountUrl);
      await loadLineData();
    } finally {
      setLinkLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const token = getStoredToken();
    if (!token) return;
    setDisconnectLoading(true);
    try {
      await api.disconnectLine(token);
      setLinkCode(null);
      setLinkExpiresAt(null);
      await loadLineData();
    } finally {
      setDisconnectLoading(false);
    }
  };

  const handleCopyCode = async () => {
    if (!linkCode) return;
    await navigator.clipboard.writeText(linkCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const lineLabel = lineStatus?.configured
    ? fmt(d.settings.lineConnected, { channelId: lineStatus.channelId ?? '', mode: lineStatus.deliveryMode ?? '' })
    : d.settings.lineNotConfigured;

  const personalLabel = linePersonal?.connected
    ? `เชื่อมต่อแล้ว${linePersonal.connectedAt ? ` · ${formatDate(linePersonal.connectedAt)}` : ''}`
    : 'ยังไม่เชื่อมต่อ';

  return (
    <div>
      <PageHeader title={d.settings.title} description={d.settings.description} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>{d.settings.profile}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">{d.settings.firstName}</label>
                <Input defaultValue={user?.firstName} className="mt-1" disabled />
              </div>
              <div>
                <label className="text-sm font-medium">{d.settings.lastName}</label>
                <Input defaultValue={user?.lastName} className="mt-1" disabled />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">{d.settings.email}</label>
              <Input defaultValue={user?.email} className="mt-1" disabled />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{d.settings.appearance}</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <p className="text-sm font-medium">{d.settings.theme}</p>
                  <p className="text-xs text-muted-foreground">{theme === 'dark' ? d.settings.darkMode : d.settings.lightModeDefault}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                {theme === 'dark' ? d.settings.switchToLight : d.settings.switchToDark}
              </Button>
            </div>
          </CardContent>
        </Card>

        {prefs && (
          <Card>
            <CardHeader><CardTitle>{d.digest.title}</CardTitle></CardHeader>
            <CardContent>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{d.digest.enabled}</p>
                    <p className="text-xs text-muted-foreground">{d.digest.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {prefs.digestChannel === 'line'
                        ? d.digest.viaLine
                        : fmt(d.digest.viaEmail, { email: prefs.digestEmail })}
                    </p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant={prefs.dailyDigestEnabled ? 'secondary' : 'outline'}
                  disabled={prefsSaving}
                  onClick={handleDigestToggle}
                >
                  {prefs.dailyDigestEnabled ? d.deadlineRules.active : d.deadlineRules.inactive}
                </Button>
              </div>
              {prefsError && <p className="mt-3 text-sm text-destructive">{prefsError}</p>}
            </CardContent>
          </Card>
        )}

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{d.settings.integrations}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">{d.settings.lineMessagingApi}</p>
                    <p className="text-xs text-muted-foreground">การตั้งค่าระบบแจ้งเตือน (Admin)</p>
                  </div>
                </div>
                <span className={`text-xs ${lineStatus?.configured ? 'text-success' : 'text-muted-foreground'}`}>
                  {lineLabel}
                </span>
              </div>
              {lineStatus?.configured && user?.firmRole === 'OWNER' && (
                <div className="mt-3 flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={handleLineTest} disabled={lineTesting}>
                    {lineTesting ? d.settings.sending : d.settings.sendTestMessage}
                  </Button>
                  {lineTestResult && (
                    <p className="text-xs text-muted-foreground">{lineTestResult}</p>
                  )}
                </div>
              )}

              <div className="mt-4 rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">เชื่อมต่อ LINE ส่วนตัว</p>
                    <p className="text-xs text-muted-foreground">
                      รับแจ้งเตือนนัดหมายล่วงหน้า 3 วัน, 1 วัน และ 1 ชั่วโมงก่อนถึงวันนัด
                    </p>
                  </div>
                  <span className={`shrink-0 text-xs ${linePersonal?.connected ? 'text-success' : 'text-muted-foreground'}`}>
                    {personalLabel}
                  </span>
                </div>

                {linePersonal?.connected ? (
                  <div className="mt-3">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleDisconnect}
                      disabled={disconnectLoading}
                    >
                      {disconnectLoading ? 'กำลังยกเลิก...' : 'ยกเลิกการเชื่อมต่อ'}
                    </Button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-3">
                    {!lineStatus?.configured && (
                      <p className="text-xs text-amber-600 dark:text-amber-400">
                        ระบบ LINE ยังไม่ได้ตั้งค่า — ติดต่อ Admin เพื่อเปิดใช้งานก่อนเชื่อมต่อ
                      </p>
                    )}

                    {linkCode ? (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">
                          1. เพิ่มเพื่อน Official Account{oaUrl ? '' : ' ของ Samnuan'}
                          {oaUrl && (
                            <a
                              href={oaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="ml-1 inline-flex items-center gap-0.5 text-primary underline"
                            >
                              ที่นี่
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          2. ส่งรหัสด้านล่างในแชท LINE
                        </p>
                        <div className="flex items-center gap-2">
                          <code className="rounded bg-background px-3 py-1.5 text-sm font-mono tracking-wider">
                            {linkCode}
                          </code>
                          <Button size="sm" variant="ghost" onClick={handleCopyCode}>
                            <Copy className="h-4 w-4" />
                            {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                          </Button>
                        </div>
                        {linkExpiresAt && (
                          <p className="text-xs text-muted-foreground">
                            รหัสหมดอายุ {new Date(linkExpiresAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        )}
                        <Button size="sm" variant="outline" onClick={handleCreateLinkCode} disabled={linkLoading}>
                          สร้างรหัสใหม่
                        </Button>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        onClick={handleCreateLinkCode}
                        disabled={linkLoading || !lineStatus?.configured}
                      >
                        {linkLoading ? 'กำลังสร้างรหัส...' : 'เชื่อมต่อ LINE'}
                      </Button>
                    )}
                  </div>
                )}
              </div>

              <Separator className="mt-4" />
            </div>

            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">Outlook / Microsoft 365</p>
                    <p className="text-xs text-muted-foreground">
                      เชื่อมกล่องอีเมลของตัวเองหรือกล่องกลาง (เช่น intake@) เพื่อรับอีเมลลูกค้าเข้าคิวรับเรื่องอัตโนมัติ
                    </p>
                  </div>
                </div>
              </div>

              {outlookNotice && (
                <p className={`mt-3 rounded-lg p-2 text-xs ${outlookNotice.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-destructive/10 text-destructive'}`}>
                  {outlookNotice.text}
                </p>
              )}

              <div className="mt-3 space-y-2">
                {mailboxConnections.map((connection) => (
                  <div key={connection.id} className="flex items-center justify-between gap-3 rounded-lg border bg-muted/30 p-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{connection.mailboxAddress}</p>
                      <p className="text-xs text-muted-foreground">
                        {OUTLOOK_STATUS_LABEL[connection.status] ?? connection.status}
                        {connection.lastSyncedAt && ` · ซิงก์ล่าสุด ${formatDateTime(connection.lastSyncedAt)}`}
                      </p>
                      {connection.lastError && connection.status !== 'ACTIVE' && (
                        <p className="mt-0.5 text-xs text-destructive">{connection.lastError}</p>
                      )}
                    </div>
                    {connection.status !== 'REVOKED' && (
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={outlookActionId === connection.id}
                          onClick={() => handleSyncOutlookNow(connection.id)}
                        >
                          ซิงก์ตอนนี้
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={outlookActionId === connection.id}
                          onClick={() => handleDisconnectOutlook(connection.id)}
                        >
                          ยกเลิกการเชื่อมต่อ
                        </Button>
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button size="sm" className="mt-3" onClick={handleConnectOutlook} disabled={outlookConnecting}>
                {outlookConnecting ? 'กำลังเปิด Microsoft...' : 'เชื่อม Outlook เพิ่ม'}
              </Button>

              <Separator className="mt-4" />
            </div>

            {[
              { icon: Building2, name: d.settings.googleMapsName, desc: d.settings.googleMapsDesc, status: d.settings.optional },
              { icon: Sparkles, name: d.settings.openAiName, desc: d.settings.openAiDesc, status: d.settings.demoMode },
              { icon: Key, name: d.settings.apiKeysName, desc: d.settings.apiKeysDesc, status: d.settings.adminOnly },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.name}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{item.name}</p>
                        <p className="text-xs text-muted-foreground">{item.desc}</p>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">{item.status}</span>
                  </div>
                  <Separator className="mt-4" />
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
