'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { hasFirmCapability } from '@lawfirm/shared';
import { api, type PaperFileAction, type PaperFileDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { paperFileMovementInput } from '@/lib/paper-file';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SelectField, TextareaField, TextField } from '@/components/ui/form-fields';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Skeleton } from '@/components/ui/misc';
import { SideDrawer } from '@/components/ui/SideDrawer';

const actionLabels: Record<PaperFileAction, string> = {
  CHECK_OUT: 'เบิกสำนวน', CHECK_IN: 'คืนสำนวน', MOVE: 'ย้ายที่เก็บ',
};

export function PaperFileCard({ caseId, largeActions = false }: { caseId: string; largeActions?: boolean }) {
  const { token, user } = useAuth();
  // shortcut: member lookup needs inviteMembers, expand the picker when the API permits case members.
  const canPickHolder = hasFirmCapability(user?.firmRole, 'inviteMembers');
  const [data, setData] = useState<PaperFileDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [action, setAction] = useState<PaperFileAction | null>(null);
  const [holderUserId, setHolderUserId] = useState('');
  const [location, setLocation] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState(false);
  const [members, setMembers] = useState<Awaited<ReturnType<typeof api.getTeamMembers>>>([]);
  const [membersError, setMembersError] = useState('');
  const [membersRevision, setMembersRevision] = useState(0);
  const close = useCallback(() => { if (!saving) setAction(null); }, [saving]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    void api.getPaperFile(token, caseId).then((result) => {
      if (!cancelled) setData(result);
    }).catch((err) => {
      if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดสำนวนไม่สำเร็จ');
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token, caseId, revision]);

  useEffect(() => {
    if (!token || !canPickHolder || action !== 'CHECK_OUT') return;
    let cancelled = false;
    setMembersError('');
    void api.getTeamMembers(token).then((result) => {
      if (!cancelled) setMembers(result);
    }).catch(() => {
      if (!cancelled) setMembersError('โหลดรายชื่อไม่สำเร็จ ยังเบิกให้ตัวเองได้');
    });
    return () => { cancelled = true; };
  }, [token, canPickHolder, action, membersRevision]);

  function open(next: PaperFileAction) {
    setHolderUserId('');
    setLocation(data?.paperFileLocation ?? '');
    setNote('');
    setSaveError('');
    setSaved(false);
    setAction(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!token || !action || saving) return;
    setSaveError('');
    setSaving(true);
    try {
      const input = paperFileMovementInput(action, { holderUserId, location, note });
      const state = await api.recordPaperFileMovement(token, caseId, input);
      setData((current) => current ? { ...current, ...state } : null);
      setAction(null);
      setSaved(true);
      setRevision((value) => value + 1);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  }

  const held = Boolean(data?.paperFileHolderId);
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0">
        <CardTitle>สำนวนกระดาษ</CardTitle>
        {data && <Link href={`/cases/${caseId}/paper-label`} className={buttonVariants({ variant: 'outline', size: 'sm' })}>พิมพ์ฉลาก</Link>}
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <LoadFailed message={error} onRetry={() => setRevision((value) => value + 1)} />}
        {loading && !data && <div role="status" aria-label="กำลังโหลดสำนวน"><Skeleton className="h-20 w-full" /></div>}
        {data && <>
          <p className="break-words text-xs text-muted-foreground">{data.folderId}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div><dt className="text-muted-foreground">ผู้ถือสำนวน</dt><dd className="break-words font-medium">{data.paperFileHolder ? `${data.paperFileHolder.firstName} ${data.paperFileHolder.lastName}` : 'ไม่มีผู้ถือ'}</dd></div>
            <div><dt className="text-muted-foreground">ที่เก็บ</dt><dd className="break-words font-medium">{data.paperFileLocation || 'ยังไม่ระบุ'}</dd></div>
          </dl>
          <div className={largeActions ? 'grid grid-cols-2 gap-3' : 'flex flex-wrap gap-2'}>
            <Button className={largeActions ? 'min-h-16 text-lg' : undefined} disabled={loading || held} onClick={() => open('CHECK_OUT')}>เบิกสำนวน</Button>
            <Button className={largeActions ? 'min-h-16 text-lg' : undefined} variant="outline" disabled={loading || !held} onClick={() => open('CHECK_IN')}>คืนสำนวน</Button>
            <Button className={largeActions ? 'col-span-2' : undefined} variant="outline" disabled={loading || held} onClick={() => open('MOVE')}>ย้ายที่เก็บ</Button>
          </div>
          {held && <p className="text-xs text-muted-foreground">คืนสำนวนก่อนย้ายที่เก็บ</p>}
          {saved && <p role="status" className="text-sm text-success">บันทึกแล้ว</p>}
          <div>
            <h4 className="mb-2 text-sm font-medium">ประวัติ 10 รายการล่าสุด</h4>
            {data.history.length === 0 ? <p className="text-sm text-muted-foreground">ยังไม่มีการเบิกคืน</p> : (
              <ol className="divide-y text-sm">
                {data.history.slice(0, 10).map((item) => (
                  <li key={item.id} className="space-y-1 py-3">
                    <p className="break-words font-medium">{actionLabels[item.action]}{item.holder ? ` · ${item.holder.firstName} ${item.holder.lastName}` : ''}{item.location ? ` · ${item.location}` : ''}</p>
                    {item.note && <p className="whitespace-pre-wrap break-words">{item.note}</p>}
                    <p className="text-xs text-muted-foreground">{item.createdBy.firstName} {item.createdBy.lastName} · <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' })}</time></p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </>}
        <SideDrawer open={action !== null} title={action ? actionLabels[action] : ''} onClose={close}>
          <form onSubmit={submit} className="space-y-4">
            {action === 'CHECK_OUT' ? <>
              {canPickHolder ? <SelectField label="ผู้ถือสำนวน" value={holderUserId} onChange={(e) => setHolderUserId(e.target.value)} disabled={saving}>
                <option value="">ฉัน ({user?.firstName} {user?.lastName})</option>
                {members.filter((member) => member.id !== user?.id).map((member) => <option key={member.id} value={member.id}>{member.firstName} {member.lastName}</option>)}
              </SelectField> : <p className="text-sm">ผู้ถือสำนวน: {user?.firstName} {user?.lastName} (ฉัน)</p>}
              {membersError && <div><p role="alert" className="text-sm text-destructive">{membersError}</p><Button type="button" variant="link" onClick={() => setMembersRevision((value) => value + 1)}>ลองใหม่</Button></div>}
            </> : <TextField label="ที่เก็บสำนวน" placeholder="เช่น ตู้ A ชั้น 2" required maxLength={500} value={location} onChange={(e) => setLocation(e.target.value)} disabled={saving} />}
            <TextareaField label="หมายเหตุ (ถ้ามี)" maxLength={2000} rows={3} value={note} onChange={(e) => setNote(e.target.value)} disabled={saving} />
            {saveError && <p role="alert" className="text-sm text-destructive">{saveError}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={close} disabled={saving}>ยกเลิก</Button>
              <Button type="submit" disabled={saving}>{saving ? 'กำลังบันทึก…' : action ? actionLabels[action] : 'บันทึก'}</Button>
            </div>
          </form>
        </SideDrawer>
      </CardContent>
    </Card>
  );
}
