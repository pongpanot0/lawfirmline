'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun, Bell, Key, Building2, Sparkles } from 'lucide-react';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api, LineIntegrationStatus } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/misc';

export default function SettingsPage() {
  const { user } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [lineStatus, setLineStatus] = useState<LineIntegrationStatus | null>(null);
  const [lineTesting, setLineTesting] = useState(false);
  const [lineTestResult, setLineTestResult] = useState<string | null>(null);

  useEffect(() => {
    const token = getStoredToken();
    if (!token) return;
    api.getLineStatus(token).then(setLineStatus).catch(() => setLineStatus(null));
  }, []);

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

  const lineLabel = lineStatus?.configured
    ? `Connected · Channel ${lineStatus.channelId} · ${lineStatus.deliveryMode}`
    : 'Not configured';

  return (
    <div>
      <PageHeader title="Settings" description="Manage your account and firm preferences" />

      <div className="grid gap-6 lg:max-w-2xl">
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

        <Card>
          <CardHeader><CardTitle>Integrations</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Bell className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">LINE Messaging API</p>
                    <p className="text-xs text-muted-foreground">Court date alerts & reminders</p>
                  </div>
                </div>
                <span className={`text-xs ${lineStatus?.configured ? 'text-success' : 'text-muted-foreground'}`}>
                  {lineLabel}
                </span>
              </div>
              {lineStatus?.configured && user?.role === 'ADMIN' && (
                <div className="mt-3 flex items-center gap-3">
                  <Button size="sm" variant="outline" onClick={handleLineTest} disabled={lineTesting}>
                    {lineTesting ? 'Sending...' : 'Send test message'}
                  </Button>
                  {lineTestResult && (
                    <p className="text-xs text-muted-foreground">{lineTestResult}</p>
                  )}
                </div>
              )}
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
