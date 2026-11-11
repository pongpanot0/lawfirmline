'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Mail, UserPlus, Clock, Trash2, UserRound } from 'lucide-react';
import { FirmRole, canInviteFirmRole, hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';
import { InlineEmptyState, Skeleton, TableEmptyRow, Modal } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { SelectField, TextField } from '@/components/ui/form-fields';
import { LicenseBadge, MemberLicenses } from '@/components/team/MemberLicenses';
import { NoAccess } from '@/components/ui/NoAccess';

type TeamMember = Awaited<ReturnType<typeof api.getTeamMembers>>[number];
type PendingInvite = Awaited<ReturnType<typeof api.listInvitations>>[number];

const ROLE_OPTIONS: Array<{
  value: FirmRole;
  label: string;
  hintKey: 'roleAssistantHint' | 'roleLawyerHint' | 'roleSeniorLawyerHint' | 'roleOfficeManagerHint' | 'roleOwnerHint' | 'roleExternalHint';
}> = [
  { value: FirmRole.ASSISTANT, label: 'ผู้ช่วย', hintKey: 'roleAssistantHint' },
  { value: FirmRole.LAWYER, label: 'ทนายความ', hintKey: 'roleLawyerHint' },
  { value: FirmRole.SENIOR_LAWYER, label: 'ทนายอาวุโส', hintKey: 'roleSeniorLawyerHint' },
  { value: FirmRole.OFFICE_MANAGER, label: 'ผู้จัดการสำนักงาน', hintKey: 'roleOfficeManagerHint' },
  { value: FirmRole.OWNER, label: 'เจ้าของสำนักงาน', hintKey: 'roleOwnerHint' },
  { value: FirmRole.EXTERNAL, label: 'ผู้รับงานภายนอก', hintKey: 'roleExternalHint' },
];

function toNum(v: string): number | null {
  return v.trim() === '' ? null : Number(v);
}

function WorkSettingsRow({ member, token }: { member: TeamMember; token: string }) {
  const [target, setTarget] = useState(member.monthlyBillableTargetHours?.toString() ?? '');
  const [rate, setRate] = useState(member.defaultHourlyRate?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  async function save() {
    setSaving(true);
    setMsg('');
    try {
      await api.updateMemberWorkSettings(token, member.id, {
        monthlyBillableTargetHours: toNum(target),
        defaultHourlyRate: toNum(rate),
      });
      setMsg('บันทึกแล้ว');
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  }

  const name = `${member.firstName} ${member.lastName}`;
  return (
    <TableRow>
      <TableCell className="font-medium">{name}</TableCell>
      <TableCell>
        <Input type="number" min={0} max={400} step="any" inputMode="decimal" className="w-28" aria-label={`เป้าชั่วโมง/เดือน ${name}`}
          value={target} onChange={(e) => setTarget(e.target.value)} />
      </TableCell>
      <TableCell>
        <Input type="number" min={0} step="any" inputMode="decimal" className="w-32" aria-label={`อัตรา/ชม. ${name}`}
          value={rate} onChange={(e) => setRate(e.target.value)} />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" disabled={saving} onClick={save}>บันทึก</Button>
          {msg && <span role="status" className="text-xs text-muted-foreground">{msg}</span>}
        </div>
      </TableCell>
    </TableRow>
  );
}

function MobileWorkSettings({ member, token }: { member: TeamMember; token: string }) {
  return <table className="w-full"><tbody className="[&_tr]:flex [&_tr]:flex-col [&_td]:block [&_td]:w-full [&_input]:w-full"><WorkSettingsRow member={member} token={token} /></tbody></table>;
}

export default function TeamPage() {
  const { token, user } = useAuth();
  const { locale } = useLocale();
  const d = useDashboardT();
  const loc = dateLocale(locale);
  const canInvite = hasFirmCapability(user?.firmRole, 'inviteMembers');
  const canManageMembers = hasFirmCapability(user?.firmRole, 'manageMembers');
  const canRunOperations = hasFirmCapability(user?.firmRole, 'runOperations');
  const inviteRoleOptions = ROLE_OPTIONS.filter((o) => canInviteFirmRole(user?.firmRole ?? '', o.value));

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FirmRole>(FirmRole.ASSISTANT);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [changingRoleId, setChangingRoleId] = useState<string | null>(null);
  const [roleMember, setRoleMember] = useState<TeamMember | null>(null);
  const [chosenRole, setChosenRole] = useState<FirmRole>(FirmRole.ASSISTANT);
  const [inviteOpen, setInviteOpen] = useState(false);

  const loadTeam = useCallback(async () => {
    if (!token || !canInvite) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    try {
      const [m, inv] = await Promise.all([
        api.getTeamMembers(token),
        api.listInvitations(token),
      ]);
      setMembers(m);
      setInvitations(inv);
    } catch (err) {
      setLoadError(d.common.loadFailed);
    } finally {
      setLoading(false);
    }
  }, [token, canInvite, d.common.loadFailed]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  if (!canInvite) {
    return <div><PageHeader title={d.team.title} /><NoAccess /></div>;
  }

  const firmRoleLabel = (role: string) => ROLE_OPTIONS.find((option) => option.value === role)?.label ?? 'ผู้ช่วย';

  const firmRoleBadgeVariant = (role: string) => {
    switch (role) {
      case FirmRole.OWNER:
        return 'default' as const;
      case FirmRole.SENIOR_LAWYER:
      case FirmRole.OFFICE_MANAGER:
        return 'success' as const;
      case FirmRole.LAWYER:
        return 'secondary' as const;
      default:
        return 'muted' as const;
    }
  };

  const canRemoveMember = (member: TeamMember) => {
    if (!canManageMembers || member.id === user?.id) return false;
    if (member.firmRole === FirmRole.OWNER) {
      const ownerCount = members.filter((m) => m.firmRole === FirmRole.OWNER).length;
      if (ownerCount <= 1) return false;
    }
    return true;
  };

  const handleRemoveMember = async (member: TeamMember) => {
    if (!token || !canRemoveMember(member)) return;
    const name = `${member.firstName} ${member.lastName}`;
    if (!window.confirm(fmt(d.team.confirmRemove, { name }))) return;

    setRemovingId(member.id);
    try {
      await api.removeTeamMember(token, member.id);
      await loadTeam();
    } catch (err) {
      alert(err instanceof Error ? err.message : d.team.removeFailed);
    } finally {
      setRemovingId(null);
    }
  };

  const canChangeRole = (member: TeamMember) => {
    if (!canManageMembers || member.id === user?.id) return false;
    if (member.firmRole === FirmRole.OWNER) {
      const ownerCount = members.filter((m) => m.firmRole === FirmRole.OWNER).length;
      if (ownerCount <= 1) return false;
    }
    return true;
  };

  const handleRoleChange = async (member: TeamMember, role: FirmRole) => {
    if (!token || role === member.firmRole) return;
    const label = ROLE_OPTIONS.find((o) => o.value === role);
    if (!window.confirm(`เปลี่ยนบทบาทของ ${member.firstName} ${member.lastName} เป็น "${label ? label.label : role}"?\nสิทธิ์ที่เห็นและทำได้จะเปลี่ยนทันที`)) return;
    setChangingRoleId(member.id);
    try {
      await api.updateMemberRole(token, member.id, role);
      await loadTeam();
    } catch (err) {
      alert(err instanceof Error ? err.message : d.team.roleChangeFailed);
    } finally {
      setChangingRoleId(null);
    }
  };

  const handleCancelInvite = async (inv: PendingInvite) => {
    if (!token) return;
    if (!window.confirm(fmt(d.team.confirmCancelInvite, { email: inv.email }))) return;

    setCancellingId(inv.id);
    try {
      await api.cancelInvitation(token, inv.id);
      await loadTeam();
    } catch (err) {
      alert(err instanceof Error ? err.message : d.team.cancelFailed);
    } finally {
      setCancellingId(null);
    }
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setInviting(true);
    setInviteError('');
    setInviteUrl('');
    try {
      const result = await api.inviteUser(token, inviteEmail, inviteRole);
      const url = `${window.location.origin}${result.inviteUrl}`;
      setInviteUrl(url);
      setInviteEmail('');
      await loadTeam();
    } catch (err) {
      setInviteError(err instanceof Error ? err.message : d.team.inviteFailed);
    } finally {
      setInviting(false);
    }
  };

  const copyInviteUrl = async () => {
    await navigator.clipboard.writeText(inviteUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <PageHeader title={d.team.title} description={d.team.description} actions={<Button type="button" title="ส่งคำเชิญทางอีเมลหรือคัดลอกลิงก์" onClick={() => setInviteOpen(true)}><UserPlus className="mr-2 h-4 w-4" />เชิญสมาชิก</Button>} />

      <Modal open={inviteOpen} onClose={() => setInviteOpen(false)} ariaLabel="เชิญสมาชิก">

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4 text-muted-foreground" aria-hidden />
            {d.team.inviteMember}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{d.team.inviteHint}</p>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
              <TextField
                label={d.team.email}
                type="email"
                autoComplete="email"
                required
                placeholder={d.team.emailPlaceholder}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="h-11"
                containerClassName="flex-1"
                error={inviteError || undefined}
              />
              {/* Picking a role is picking what someone sees; say it before the invite goes out. */}
              <SelectField
                label={d.team.role}
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as FirmRole)}
                className="h-11"
                containerClassName="sm:w-64"
                hint={d.team[ROLE_OPTIONS.find((o) => o.value === inviteRole)!.hintKey]}
              >
                {inviteRoleOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </SelectField>
              <Button type="submit" disabled={inviting} className="sm:mt-7">
                {inviting ? d.team.sending : d.team.sendInvite}
              </Button>
            </div>
          </form>
          {inviteUrl && (
            <div className="mt-4 rounded-lg bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">{d.team.shareLink}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate text-xs">{inviteUrl}</code>
                <Button type="button" variant="outline" size="sm" aria-label={d.team.shareLink} onClick={copyInviteUrl}>
                  {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      </Modal>
      <Modal open={!!roleMember} onClose={() => setRoleMember(null)} ariaLabel="เปลี่ยนบทบาท">
        <h2 className="text-lg font-semibold">เปลี่ยนบทบาท</h2>
        <div className="mt-4 space-y-3">{ROLE_OPTIONS.map((opt) => <label key={opt.value} className="flex gap-3 rounded-lg border p-3"><input type="radio" name="role" checked={chosenRole === opt.value} onChange={() => setChosenRole(opt.value)} /><span><span className="block font-medium">{opt.label}</span><span className="text-sm text-muted-foreground">{d.team[opt.hintKey]}</span></span></label>)}</div>
        <div className="mt-4 flex gap-2"><Button type="button" variant="outline" onClick={() => setRoleMember(null)}>ยกเลิก</Button><Button type="button" title="ตรวจสอบและยืนยันการเปลี่ยนบทบาท" onClick={() => { if (roleMember) void handleRoleChange(roleMember, chosenRole); setRoleMember(null); }}>เปลี่ยนบทบาท</Button></div>
      </Modal>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{d.team.members} ({members.length})</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div role="status" aria-label={d.common.loading} className="space-y-3 p-4">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : loadError ? (
            <div className="p-4"><LoadFailed message={loadError} onRetry={loadTeam} /></div>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {members.length === 0 ? (
                  <InlineEmptyState title="ยังไม่มีสมาชิกทีม" description="เชิญสมาชิกคนแรกด้วยอีเมลด้านบน" />
                ) : (
                  members.map((m) => (
                    <div key={m.id} className="grid grid-cols-[2.25rem_minmax(0,1fr)] items-start gap-3 rounded-lg border p-3">
                      <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 font-medium">{m.firstName} {m.lastName} <LicenseBadge expiresAt={m.lawyerLicenseExpiresAt} /></p>
                        <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                          <Mail className="h-3.5 w-3.5 shrink-0" aria-hidden />
                          {m.email}
                        </p>
                      </div>
                      <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-2 text-sm"><UserRound className="h-4 w-4" />{firmRoleLabel(m.firmRole)}</span>
                      {canChangeRole(m) && (
                        <Button type="button" variant="outline" size="sm" title="เลือกบทบาทและตรวจสอบสิทธิ์" disabled={changingRoleId === m.id} onClick={() => { setRoleMember(m); setChosenRole(m.firmRole as FirmRole); }}>เปลี่ยนบทบาท</Button>
                      )}
                      {canRemoveMember(m) && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={removingId === m.id}
                          onClick={() => handleRemoveMember(m)}
                          aria-label={d.team.removeMember}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{d.team.member}</TableHead>
                    <TableHead>{d.team.role}</TableHead>
                    <TableHead>ใบอนุญาตทนายความ</TableHead>
                    <TableHead>เป้าชั่วโมง/เดือน</TableHead>
                    <TableHead className="w-[100px]">{d.team.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.length === 0 ? (
                    <TableEmptyRow colSpan={5} title="ยังไม่มีสมาชิกทีม" description="เชิญสมาชิกคนแรกด้วยอีเมลด้านบน" />
                  ) : members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                          <span><span className="block font-medium">{m.firstName} {m.lastName}</span><span className="text-sm text-muted-foreground">{m.email}</span></span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className="inline-flex items-center gap-2"><UserRound className="h-4 w-4" />{firmRoleLabel(m.firmRole)}</span>
                        {canChangeRole(m) && (
                          <Button type="button" variant="outline" size="sm" title="เลือกบทบาทและตรวจสอบสิทธิ์" disabled={changingRoleId === m.id} onClick={() => { setRoleMember(m); setChosenRole(m.firmRole as FirmRole); }}>เปลี่ยนบทบาท</Button>
                        )}
                      </TableCell>
                      <TableCell><LicenseBadge expiresAt={m.lawyerLicenseExpiresAt} />{!m.lawyerLicenseNo && <span className="text-muted-foreground">ยังไม่กรอก</span>}</TableCell>
                      <TableCell>{m.monthlyBillableTargetHours == null ? "ยังไม่ตั้งเป้า" : `${m.monthlyBillableTargetHours} ชม.`}</TableCell>
                      <TableCell>
                        {canRemoveMember(m) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                            disabled={removingId === m.id}
                            onClick={() => handleRemoveMember(m)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden />
                            <span className="sr-only">{d.team.removeMember}</span>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </>
          )}
        </CardContent>
      </Card>

      {token && members.length > 0 && (
        <details><summary className="disclosure cursor-pointer rounded-lg border bg-card p-4 font-medium">ใบอนุญาตทนายความ</summary><MemberLicenses members={members} token={token} canEdit={canRunOperations} onSaved={() => void loadTeam()} /></details>
      )}

      {canRunOperations && token && members.length > 0 && (
        <details><summary className="disclosure cursor-pointer rounded-lg border bg-card p-4 font-medium">เป้าและอัตราของสมาชิก</summary><Card>
          <CardHeader>
            <CardTitle className="text-base">เป้าและอัตราของสมาชิก</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-3 text-sm text-muted-foreground">เว้นว่างไว้ถ้าไม่ตั้งเป้า — แดชบอร์ดจะไม่แสดงอัตราการใช้เวลาของคนนั้น</p>
            <Table className="hidden md:table">
              <TableHeader>
                <TableRow>
                  <TableHead>{d.team.member}</TableHead>
                  <TableHead>เป้าชั่วโมง/เดือน</TableHead>
                  <TableHead>อัตรา/ชม. (บาท)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((m) => <WorkSettingsRow key={m.id} member={m} token={token} />)}
              </TableBody>
            </Table>
            <div className="space-y-3 md:hidden">{members.map((m) => <MobileWorkSettings key={m.id} member={m} token={token} />)}</div>
          </CardContent>
        </Card></details>
      )}

      <details className="rounded-xl border bg-card"><summary className="disclosure cursor-pointer p-4 font-medium">{d.team.pendingInvites} ({invitations.length})</summary>
      <Card>
        <CardContent>
          {loading ? (
            <div role="status" aria-label={d.common.loading} className="space-y-3">
              {[0, 1].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : loadError ? (
            <LoadFailed message={loadError} onRetry={loadTeam} />
          ) : invitations.length === 0 ? (
            <InlineEmptyState title={d.team.noPending} />
          ) : (
            <ul className="space-y-3">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 break-all font-medium">{inv.email}</span>
                    <Badge variant="muted">{firmRoleLabel(inv.role)}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3.5 w-3.5" aria-hidden />
                      {fmt(d.team.expires, {
                        date: new Date(inv.expiresAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }),
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={cancellingId === inv.id}
                      onClick={() => handleCancelInvite(inv)}
                    >
                      {d.team.cancelInvite}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card></details>
    </div>
  );
}
