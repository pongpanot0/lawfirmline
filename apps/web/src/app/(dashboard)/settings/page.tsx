'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Bell, Key, Building2, Sparkles, Copy, ExternalLink } from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api, LineIntegrationStatus, LinePersonalStatus } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/misc';

export default function SettingsPage() {
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

  const handleLineTest = async () => {
    const token = getStoredToken();
    if (!token) return;
    setLineTesting(true);
    setLineTestResult(null);
    try {
      const res = await api.testLineIntegration(token);
      setLineTestResult(
        res.ok
          ? `ส่งข้อความทดสอบสำเร็จ (${res.mode === 'push' ? 'Push' : 'Broadcast'})`
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
    ? `Connected · Channel ${lineStatus.channelId} · ${lineStatus.deliveryMode}`
    : 'Not configured';

  const personalLabel = linePersonal?.connected
    ? `เชื่อมต่อแล้ว${linePersonal.connectedAt ? ` · ${new Date(linePersonal.connectedAt).toLocaleDateString('th-TH')}` : ''}`
    : 'ยังไม่เชื่อมต่อ';

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and firm preferences" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Profile</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="text-sm font-medium">First Name</label>
                <Input defaultValue={user?.firstName} className="mt-1" />
              </div>
              <div>
                <label className="text-sm font-medium">Last Name</label>
                <Input defaultValue={user?.lastName} className="mt-1" />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input defaultValue={user?.email} className="mt-1" disabled />
            </div>
            <Button size="sm">Save Changes</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Appearance</CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === 'dark' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <p className="text-sm font-medium">Theme</p>
                  <p className="text-xs text-muted-foreground">{theme === 'dark' ? 'Dark mode' : 'Light mode (default)'}</p>
                </div>
              </div>
              <Button variant="outline" size="sm" onClick={toggleTheme}>
                Switch to {theme === 'dark' ? 'Light' : 'Dark'}
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LINE Messaging API</p>
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
                    {lineTesting ? 'Sending...' : 'Send test message'}
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
                          1. เพิ่มเพื่อน Official Account{oaUrl ? '' : ' ของ LexFlow'}
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
                            รหัสหมดอายุ {new Date(linkExpiresAt).toLocaleTimeString('th-TH')}
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

            {[
              { icon: Building2, name: 'Google Maps', desc: 'Travel distance calculation', status: 'Optional' },
              { icon: Sparkles, name: 'OpenAI GPT-4o', desc: 'Document analysis', status: 'Demo mode' },
              { icon: Key, name: 'API Keys', desc: 'Manage external service keys', status: 'Admin only' },
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
