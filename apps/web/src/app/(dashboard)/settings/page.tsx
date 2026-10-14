'use client';

import { useCallback, useEffect, useState } from 'react';
import { Moon, Sun, Bell, Key, Building2, Sparkles, Copy, ExternalLink, Shield, Tags, Timer, CalendarOff, Scale, History, Mail, ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useAuth, getStoredToken } from '@/lib/auth';
import { useTheme } from '@/lib/theme';
import { api, ApiError, LineIntegrationStatus, LinePersonalStatus, NotificationPreferences } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { MfaToggle } from '@/components/settings/MfaToggle';
import { SessionsPanel } from '@/components/settings/SessionsPanel';
import { CaseNumberPrefixCard } from '@/components/settings/CaseNumberPrefixCard';
import { MicrosoftAccountsSection } from '@/components/settings/MicrosoftAccountsSection';
import { hasFirmCapability, type FirmCapability } from '@lawfirm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { formatDate } from '@/lib/utils';

/** Office-wide master data; each link is capability-gated, so it sits under Settings instead of the sidebar. */
const OFFICE_LINKS: Array<{ href: string; icon: typeof Shield; labelKey: 'reimbursements' | 'caseTypes' | 'deadlineRules' | 'holidays' | 'courts' | 'auditLog' | 'emailTemplates' | 'microsoftStatus'; capability: FirmCapability }> = [
  { href: '/admin/reimbursements', icon: Shield, labelKey: 'reimbursements', capability: 'approveExpenses' },
  { href: '/admin/case-types', icon: Tags, labelKey: 'caseTypes', capability: 'manageFirmContent' },
  { href: '/admin/deadline-rules', icon: Timer, labelKey: 'deadlineRules', capability: 'manageFirmContent' },
  // Platform-admin pages: they stay with the firm owner.
  { href: '/admin/holidays', icon: CalendarOff, labelKey: 'holidays', capability: 'manageSubscription' },
  { href: '/admin/courts', icon: Scale, labelKey: 'courts', capability: 'manageSubscription' },
  { href: '/settings/email-templates', icon: Mail, labelKey: 'emailTemplates', capability: 'manageFirmContent' },
  { href: '/settings/microsoft-status', icon: Mail, labelKey: 'microsoftStatus', capability: 'runOperations' },
  { href: '/admin/audit-log', icon: History, labelKey: 'auditLog', capability: 'viewFirmReports' },
];

export default function SettingsPage() {
  const d = useDashboardT();
  const { user } = useAuth();
  const officeLinks = OFFICE_LINKS.filter((l) => hasFirmCapability(user?.firmRole, l.capability));
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
  const [signature, setSignature] = useState('');
  const [sigState, setSigState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
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
    api.getMyPreferences(token).then((p) => { setPrefs(p); setSignature(p.emailSignature ?? ''); }).catch(() => setPrefs(null));
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

  const saveSignature = async () => {
    const token = getStoredToken();
    if (!token) return;
    setSigState('saving');
    try {
      const p = await api.updateMyPreferences(token, { emailSignature: signature });
      setSignature(p.emailSignature ?? '');
      setSigState('saved');
    } catch {
      setSigState('error');
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
      {hasFirmCapability(user?.firmRole, 'manageFirmContent') && <div className="flex flex-wrap gap-3"><Link href="/getting-started" className="inline-flex min-h-11 items-center rounded-lg border bg-card px-4 text-sm text-primary">เริ่มใช้และนำเข้าข้อมูล / Office setup</Link><Link href="/playbooks" className="inline-flex min-h-11 items-center rounded-lg border bg-card px-4 text-sm text-primary">Playbooks</Link></div>}

      <div className="grid gap-6 lg:grid-cols-2">
        {officeLinks.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>{d.settings.office}</CardTitle>
              <p className="text-sm text-muted-foreground">{d.settings.officeDescription}</p>
            </CardHeader>
            <CardContent>
              <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {officeLinks.map(({ href, icon: Icon, labelKey }) => (
                  <li key={href}>
                    <Link
                      href={href}
                      className="flex items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                    >
                      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="flex-1">{d.nav[labelKey]}</span>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </Link>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
        {hasFirmCapability(user?.firmRole, 'manageSubscription') && <CaseNumberPrefixCard />}

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
            <div>
              <label className="text-sm font-medium" htmlFor="email-signature">ลายเซ็นอีเมล</label>
              <p className="text-xs text-muted-foreground">ใส่ท้ายอีเมลที่ส่งจากคดี (เลือกไม่แนบได้ทุกครั้ง)</p>
              <Textarea
                id="email-signature"
                rows={5}
                maxLength={2000}
                className="mt-1"
                placeholder={'สมชาย ใจดี\nทนายความ\nสำนักงานกฎหมาย ตัวอย่าง จำกัด\nโทร 02-123-4567'}
                value={signature}
                onChange={(e) => { setSignature(e.target.value); setSigState('idle'); }}
              />
              {signature.trim() && (
                <p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">-- {'\n'}{signature.trim()}</p>
              )}
              <div className="mt-2 flex items-center gap-3">
                <Button size="sm" onClick={() => void saveSignature()} disabled={sigState === 'saving'}>
                  {sigState === 'saving' ? 'กำลังบันทึก…' : 'บันทึก'}
                </Button>
                {sigState === 'saved' && <span className="text-sm text-green-600">บันทึกแล้ว</span>}
                {sigState === 'error' && <span className="text-sm text-destructive">บันทึกไม่สำเร็จ ลองอีกครั้ง</span>}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>{d.settings.security}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <MfaToggle />
            <SessionsPanel />
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
              {lineStatus?.configured && hasFirmCapability(user?.firmRole, 'manageSubscription') && (
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
              <MicrosoftAccountsSection>
                <Link href="/settings/outlook-folders" className="mt-3 inline-flex text-sm text-primary hover:underline">
                  จับคู่ folder Outlook / OneDrive กับคดี
                </Link>
              </MicrosoftAccountsSection>

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
