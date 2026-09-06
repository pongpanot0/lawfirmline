'use client';

import { useCallback, useEffect, useState } from 'react';
import { Copy, Check, Mail, UserPlus, Clock, Trash2 } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useDashboardT, useLocale } from '@/components/landing/LocaleProvider';
import { dateLocale, fmt } from '@/lib/i18n/dashboard';

type TeamMember = Awaited<ReturnType<typeof api.getTeamMembers>>[number];
type PendingInvite = Awaited<ReturnType<typeof api.listInvitations>>[number];

export default function TeamPage() {
  const { token, user } = useAuth();
  const { locale } = useLocale();
  const d = useDashboardT();
  const loc = dateLocale(locale);
  const isOwner = user?.firmRole === FirmRole.OWNER;

  const [members, setMembers] = useState<TeamMember[]>([]);
  const [invitations, setInvitations] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<FirmRole>(FirmRole.ASSISTANT);
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState('');
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadTeam = useCallback(async () => {
    if (!token || !isOwner) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [m, inv] = await Promise.all([
        api.getTeamMembers(token),
        api.listInvitations(token),
      ]);
      setMembers(m);
      setInvitations(inv);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [token, isOwner]);

  useEffect(() => {
    loadTeam();
  }, [loadTeam]);

  if (!isOwner) {
    return <p className="text-destructive">{d.team.accessDenied}</p>;
  }

  const firmRoleLabel = (role: string) =>
    role === FirmRole.OWNER ? d.team.roleOwner : d.team.roleAssistant;

  const canRemoveMember = (member: TeamMember) => {
    if (member.id === user?.id) return false;
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
      <PageHeader title={d.team.title} description={d.team.description} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserPlus className="h-4 w-4" />
            {d.team.inviteMember}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">{d.team.inviteHint}</p>
          <form onSubmit={handleInvite} className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                type="email"
                required
                placeholder={d.team.emailPlaceholder}
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1"
              />
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as FirmRole)}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value={FirmRole.ASSISTANT}>{d.team.roleAssistant}</option>
              </select>
              <Button type="submit" disabled={inviting}>
                {inviting ? d.team.sending : d.team.sendInvite}
              </Button>
            </div>
          </form>
          {inviteError && <p className="mt-2 text-sm text-destructive">{inviteError}</p>}
          {inviteUrl && (
            <div className="mt-4 rounded-lg bg-muted p-3">
              <p className="text-xs font-medium text-muted-foreground">{d.team.shareLink}</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate text-xs">{inviteUrl}</code>
                <Button type="button" variant="outline" size="sm" onClick={copyInviteUrl}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{d.team.members}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-6 text-muted-foreground">{d.common.loading}</p>
          ) : (
            <>
              <div className="space-y-3 p-4 md:hidden">
                {members.map((m) => (
                  <div key={m.id} className="flex items-center gap-3 rounded-lg border p-3">
                    <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{m.firstName} {m.lastName}</p>
                      <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        {m.email}
                      </p>
                    </div>
                    <Badge variant={m.firmRole === FirmRole.OWNER ? 'default' : 'muted'}>
                      {firmRoleLabel(m.firmRole)}
                    </Badge>
                    {canRemoveMember(m) && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={removingId === m.id}
                        onClick={() => handleRemoveMember(m)}
                        aria-label={d.team.removeMember}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
              <Table className="hidden md:table">
                <TableHeader>
                  <TableRow>
                    <TableHead>{d.team.member}</TableHead>
                    <TableHead>{d.team.email}</TableHead>
                    <TableHead>{d.team.role}</TableHead>
                    <TableHead>{d.team.joined}</TableHead>
                    <TableHead className="w-[100px]">{d.team.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar fallback={`${m.firstName[0]}${m.lastName[0]}`} />
                          <span className="font-medium">{m.firstName} {m.lastName}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{m.email}</TableCell>
                      <TableCell>
                        <Badge variant={m.firmRole === FirmRole.OWNER ? 'default' : 'muted'}>
                          {firmRoleLabel(m.firmRole)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {new Date(m.joinedAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' })}
                      </TableCell>
                      <TableCell>
                        {canRemoveMember(m) && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={removingId === m.id}
                            onClick={() => handleRemoveMember(m)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{d.team.pendingInvites}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">{d.common.loading}</p>
          ) : invitations.length === 0 ? (
            <p className="text-sm text-muted-foreground">{d.team.noPending}</p>
          ) : (
            <ul className="space-y-3">
              {invitations.map((inv) => (
                <li
                  key={inv.id}
                  className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{inv.email}</span>
                    <Badge variant="muted">{firmRoleLabel(inv.role)}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {fmt(d.team.expires, {
                        date: new Date(inv.expiresAt).toLocaleDateString(loc, { day: 'numeric', month: 'short', year: 'numeric' }),
                      })}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
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
      </Card>
    </div>
  );
}
