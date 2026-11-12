'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { Bell, Building2, UserRound, UserCheck, Link2, Copy, Clock, ExternalLink, MessageCircle, RefreshCw, Send, Smartphone, Shield, Tags, Timer, CalendarOff, Scale, History, Mail, ChevronRight, FolderSync, Rocket, Zap } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth, getStoredToken } from '@/lib/auth';
import { api, ApiError, LineIntegrationStatus, LinePersonalStatus, NotificationPreferences } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { MfaToggle } from '@/components/settings/MfaToggle';
import { SessionsPanel } from '@/components/settings/SessionsPanel';
import { CaseNumberPrefixCard } from '@/components/settings/CaseNumberPrefixCard';
import { AiConnectionsSection } from '@/components/settings/AiConnectionsSection';
import { AiFirmSettings } from '@/components/settings/AiFirmSettings';
import { MicrosoftAccountsSection } from '@/components/settings/MicrosoftAccountsSection';
import { hasFirmCapability, type FirmCapability } from '@lawfirm/shared';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TextField, TextareaField } from '@/components/ui/form-fields';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { formatDate } from '@/lib/utils';
import type { LawyerLicense } from '@/lib/api';
import { LicenseForm } from '@/components/team/LicenseForm';

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

type SettingsView = 'profile' | 'notifications' | 'security' | 'integrations' | 'office';

export default function SettingsPage() {
  return <Suspense><SettingsContent /></Suspense>;
}

function SettingsContent() {
  const d = useDashboardT();
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const officeLinks = OFFICE_LINKS.filter((l) => hasFirmCapability(user?.firmRole, l.capability));
  const canSetPrefix = hasFirmCapability(user?.firmRole, 'manageSubscription');
  const canSetupOffice = hasFirmCapability(user?.firmRole, 'manageFirmContent');
  const hasOffice = officeLinks.length > 0 || canSetPrefix || canSetupOffice;
  const views: Array<{ key: SettingsView; label: string }> = [
    { key: 'profile', label: d.settings.profile },
    { key: 'notifications', label: 'การแจ้งเตือน' },
    { key: 'security', label: d.settings.security },
    { key: 'integrations', label: d.settings.integrations },
    ...(hasOffice ? [{ key: 'office' as const, label: d.settings.office }] : []),
  ];
  const requested = searchParams.get('view');
  const view: SettingsView = views.some((v) => v.key === requested) ? (requested as SettingsView) : 'profile';
  const setView = (next: string) => router.replace(next === 'profile' ? '/settings' : `/settings?view=${next}`, { scroll: false });
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
  const [license, setLicense] = useState<LawyerLicense | null>(null);
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
    api.getMyLicense(token).then(setLicense).catch(() => setLicense(null));
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
      setLineTestResult('ส่งไม่สำเร็จ — ต้องเป็นผู้ดูแลสำนักงาน');
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
    if (!confirm('ยกเลิกการเชื่อมต่อ LINE ส่วนตัว? จะไม่ได้รับแจ้งเตือนนัดทาง LINE')) return;
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
    ? fmt(d.settings.lineConnected, { channelId: lineStatus.channelId ?? '' })
    : d.settings.lineNotConfigured;

  const personalLabel = linePersonal?.connected
    ? `เชื่อมต่อแล้ว${linePersonal.connectedAt ? ` · ${formatDate(linePersonal.connectedAt)}` : ''}`
    : 'ยังไม่เชื่อมต่อ';

  // The office's bot (set up by the office admin) — not the signed-in user's own LINE account.
  const lineStatusRow = (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-muted text-muted-foreground">
          <Bell className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{d.settings.lineMessagingApi}</p>
          <p className="text-xs text-muted-foreground">บอท LINE ของสำนักงาน (ตั้งค่าโดยผู้ดูแลสำนักงาน)</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={lineStatus?.configured ? 'success' : 'muted'}>{lineLabel}</Badge>
        {lineStatus?.configured && hasFirmCapability(user?.firmRole, 'manageSubscription') && (
          <Button size="sm" variant="outline" onClick={handleLineTest} disabled={lineTesting} title="กดเพื่อส่งข้อความทดสอบจากบอทของสำนักงาน">
            <Send className="h-4 w-4" aria-hidden />
            {lineTesting ? d.settings.sending : d.settings.sendTestMessage}
          </Button>
        )}
      </div>
      {lineTestResult && <p role="status" className="w-full text-xs text-muted-foreground">{lineTestResult}</p>}
    </div>
  );

  // The signed-in user's own LINE account: the primary row, where the LF link code lives.
  const linePersonalRow = (
    <div className="space-y-4 rounded-lg border bg-muted/40 p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-card">
            <UserCheck className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-base font-semibold">บัญชี LINE ของคุณ</p>
            <p className="text-xs text-muted-foreground">ผูกบัญชีเพื่อรับแจ้งเตือนนัด และถามผู้ช่วย AI ในแชต LINE</p>
          </div>
        </div>
        <Badge variant={linePersonal?.connected ? 'success' : 'muted'}>{personalLabel}</Badge>
      </div>

      {!linePersonal?.connected && !lineStatus?.configured && (
        <p className="text-xs text-warning">บอท LINE ของสำนักงานยังไม่ได้ตั้งค่า ติดต่อผู้ดูแลสำนักงานก่อนเชื่อมต่อ</p>
      )}

      {!linePersonal?.connected && linkCode && (
        <div className="space-y-3 rounded-lg border bg-card p-4">
          <p className="flex items-center gap-1.5 border-b pb-2 text-xs font-semibold">
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            ขั้นตอนการเชื่อมต่อ
          </p>
          <ol className="space-y-3 text-sm">
            <li className="flex items-center gap-2">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">1</span>
              <span>
                เพิ่มเพื่อน Official Account{oaUrl ? '' : ' ของ Samnuan'}
                {oaUrl && (
                  <a href={oaUrl} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 font-medium text-primary underline">
                    ที่นี่
                    <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                  </a>
                )}
              </span>
            </li>
            <li className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">2</span>
                <span>ส่งรหัสด้านล่างในแชต LINE</span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-2 sm:ml-8">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="flex items-center gap-1 rounded-md border bg-card py-1 pl-3 pr-1">
                    <code className="font-mono text-base font-semibold tracking-widest">{linkCode}</code>
                    <Button size="sm" variant="ghost" onClick={handleCopyCode} title="กดเพื่อคัดลอกรหัสไปวางในแชต LINE">
                      <Copy className="h-4 w-4" aria-hidden />
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอก'}
                    </Button>
                  </span>
                  {linkExpiresAt && (
                    <span className="flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      รหัสหมดอายุ {new Date(linkExpiresAt).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={handleCreateLinkCode} disabled={linkLoading} title="กดเพื่อขอรหัสใหม่ เมื่อรหัสเดิมหมดอายุ">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  สร้างรหัสใหม่
                </Button>
              </div>
            </li>
          </ol>
        </div>
      )}

      {!linePersonal?.connected && !linkCode && (
        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleCreateLinkCode} disabled={linkLoading || !lineStatus?.configured} title="กดเพื่อรับรหัสผูกบัญชี LINE">
            {linkLoading ? 'กำลังสร้างรหัส...' : 'เชื่อมต่อ LINE'}
          </Button>
          <p className="text-xs text-muted-foreground">กดเพื่อรับรหัส แล้วส่งรหัสในแชต LINE ของสำนักงาน</p>
        </div>
      )}

      {linePersonal?.connected && (
        <div className="flex justify-end border-t pt-3">
          <Button
            size="sm"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDisconnect}
            disabled={disconnectLoading}
            title="กดเพื่อเลิกผูกบัญชี LINE นี้ จะไม่ได้รับแจ้งเตือนทาง LINE อีก"
          >
            {disconnectLoading ? 'กำลังยกเลิก...' : 'ยกเลิกการเชื่อมต่อ LINE'}
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title={d.settings.title} description="บัญชีของคุณ การแจ้งเตือน ความปลอดภัย และการเชื่อมต่อ" />
      <div className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-l-4 border-l-[var(--color-brass)] bg-[var(--operations-highlight)] p-5">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground">{user?.firstName?.slice(0, 1)}{user?.lastName?.slice(0, 1)}</div>
        <div><p className="font-semibold">{user?.firstName} {user?.lastName}</p><p className="text-sm text-muted-foreground">{user?.email}</p>{hasOffice && <Link href="/team" className="text-sm underline">จัดการทีม</Link>}</div>
      </div>
      <Tabs value={view} onValueChange={setView} className="mb-6">
        <TabsList className="grid grid-cols-2 gap-0 rounded-lg bg-card sm:flex sm:flex-nowrap">
          {views.map((v) => { const Icon = { profile: UserRound, notifications: Bell, security: Shield, integrations: Link2, office: Building2 }[v.key]; return <TabsTrigger className="min-w-0 gap-2 whitespace-normal sm:flex-1" key={v.key} value={v.key}><Icon className="size-4 shrink-0" aria-hidden />{v.label}</TabsTrigger>; })}
        </TabsList>
      </Tabs>

      {view === 'profile' && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField label={d.settings.firstName} defaultValue={user?.firstName} disabled />
              <TextField label={d.settings.lastName} defaultValue={user?.lastName} disabled />
            </div>
            <TextField label={d.settings.email} defaultValue={user?.email} disabled />
            <Separator />
            <TextareaField
              id="email-signature"
              label="ลายเซ็นอีเมล"
              hint="ใส่ท้ายอีเมลที่ส่งจากคดี เลือกไม่แนบได้ทุกครั้ง"
              rows={5}
              maxLength={2000}
              placeholder="เช่น สมชาย ใจดี · ทนายความ"
              value={signature}
              onChange={(e) => { setSignature(e.target.value); setSigState('idle'); }}
            />
            {signature.trim() && (
              <p className="whitespace-pre-wrap rounded-md bg-muted p-2 text-xs text-muted-foreground">-- {'\n'}{signature.trim()}</p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-3 border-t pt-4">
              {sigState === 'saved' && <span role="status" className="text-sm text-success">บันทึกแล้ว</span>}
              {sigState === 'error' && <span role="alert" className="text-sm text-destructive">บันทึกไม่สำเร็จ ลองอีกครั้ง</span>}
              <Button onClick={() => void saveSignature()} disabled={sigState === 'saving'}>
                {sigState === 'saving' ? 'กำลังบันทึก…' : 'บันทึกลายเซ็น'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {view === 'profile' && license && (
        <Card className="mt-4">
          <CardContent className="space-y-3 p-6">
            <div>
              <p className="text-sm font-medium">ใบอนุญาตทนายความ</p>
              <p className="text-xs text-muted-foreground">ระบบเตือนก่อนหมดอายุ 90, 30 และ 7 วัน และใส่เลขที่ใบอนุญาตในเอกสารจากเทมเพลตให้</p>
            </div>
            <LicenseForm idPrefix="my-license" initial={license}
              onSave={async (data) => { const token = getStoredToken(); if (token) await api.updateMyLicense(token, data); }} />
          </CardContent>
        </Card>
      )}

      {view === 'notifications' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">เปลี่ยนแล้วมีผลทันที</p>
          {prefs && (
            <Card>
              <CardContent className="p-6">
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{d.digest.title}</p>
                    <p className="text-xs text-muted-foreground">{d.digest.description}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {prefs.digestChannel === 'line'
                        ? d.digest.viaLine
                        : fmt(d.digest.viaEmail, { email: prefs.digestEmail })}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={prefs.dailyDigestEnabled ? 'success' : 'muted'}>
                      {prefs.dailyDigestEnabled ? d.deadlineRules.active : d.deadlineRules.inactive}
                    </Badge>
                    <Button size="sm" variant="outline" aria-pressed={prefs.dailyDigestEnabled} disabled={prefsSaving} onClick={handleDigestToggle}>
                      {prefs.dailyDigestEnabled ? 'ปิดสรุปงาน' : 'เปิดสรุปงาน'}
                    </Button>
                  </div>
                </div>
                {prefsError && <p role="alert" className="mt-3 text-sm text-destructive">{prefsError}</p>}
              </CardContent>
            </Card>
          )}

        </div>
      )}

      {view === 'security' && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <MfaToggle />
            <SessionsPanel />
          </CardContent>
        </Card>
      )}

      {view === 'integrations' && (
        <div className="space-y-6"><AiConnectionsSection />
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-start gap-3 border-b pb-4">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-success/10 text-success">
                <MessageCircle className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <p className="text-lg font-semibold">LINE</p>
                <p className="text-xs text-muted-foreground">การเชื่อมต่อแชตส่วนตัวและระบบแจ้งเตือนของสำนักงาน</p>
              </div>
            </div>
            {linePersonalRow}
            <Separator />
            {lineStatusRow}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="space-y-4 p-6">
            <MicrosoftAccountsSection>
              <Link href="/settings/outlook-folders" className="inline-flex min-h-11 items-center gap-1.5 text-sm text-primary hover:underline">
                <FolderSync className="h-4 w-4" aria-hidden />
                จับคู่โฟลเดอร์ Outlook / OneDrive กับคดี
              </Link>
            </MicrosoftAccountsSection>
          </CardContent>
        </Card></div>
      )}

      {view === 'office' && (
        <div className="space-y-6">
          {(officeLinks.length > 0 || canSetupOffice) && (
            <Card>
              <CardHeader>
                <CardTitle>{d.settings.office}</CardTitle>
                <p className="text-sm text-muted-foreground">{d.settings.officeDescription}</p>
              </CardHeader>
              <CardContent>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {canSetupOffice && [
                    { href: '/getting-started', icon: Rocket, label: 'เริ่มใช้และนำเข้าข้อมูล' },
                    { href: '/playbooks', icon: Zap, label: 'Playbooks' },
                  ].map(({ href, icon: Icon, label }) => (
                    <li key={href}>
                      <Link href={href} className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="flex-1">{label}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                  {officeLinks.map(({ href, icon: Icon, labelKey }) => (
                    <li key={href}>
                      <Link
                        href={href}
                        className="flex min-h-11 items-center gap-3 rounded-lg border border-border px-3 py-2.5 text-sm font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                        <span className="flex-1">{d.nav[labelKey]}</span>
                        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
          {hasFirmCapability(user?.firmRole, 'manageAiConnections') && <AiFirmSettings />}
          {canSetPrefix && <CaseNumberPrefixCard />}
        </div>
      )}
    </div>
  );
}
