'use client';

import { useEffect, useState } from 'react';
import { api, type BillingProfile } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export function BillingProfileCard({ canEdit }: { canEdit: boolean }) {
  const { token } = useAuth();
  const [profile, setProfile] = useState<BillingProfile | null>(null);
  const [logo, setLogo] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!token) return; let active = true; api.getBillingProfile(token).then(p => { if (active) setProfile(p); }).catch(() => { if (active) setError('โหลดข้อมูลออกเอกสารไม่สำเร็จ ลองใหม่อีกครั้ง'); }); return () => { active = false; }; }, [token]);
  useEffect(() => { if (!token || !profile?.logoKey) { setLogo(''); return; } let url = ''; let active = true; api.getBillingLogo(token, profile.logoKey).then(blob => { if (active) { url = URL.createObjectURL(blob); setLogo(url); } }).catch(() => { if (active) setError('โหลดโลโก้ไม่สำเร็จ ลองใหม่อีกครั้ง'); }); return () => { active = false; if (url) URL.revokeObjectURL(url); }; }, [token, profile?.logoKey]);
  const save = async () => {
    if (!token || !profile) return;
    if (profile.taxId && !/^\d{13}$/.test(profile.taxId)) { setError('กรอกเลขประจำตัวผู้เสียภาษี 13 หลัก'); return; }
    setBusy(true); setError('');
    try { const { logoKey: _logoKey, ...fields } = profile; setProfile(await api.updateBillingProfile(token, { ...fields, legalName: fields.legalName ?? '', taxId: fields.taxId ?? '', taxBranch: fields.taxBranch ?? '00000', billingAddress: fields.billingAddress ?? '' })); } catch (e) { setError(e instanceof Error ? e.message : 'บันทึกข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setBusy(false); }
  };
  const complete = !!(profile?.legalName?.trim() && /^\d{13}$/.test(profile?.taxId ?? '') && profile?.billingAddress?.trim());
  return <Card className="p-5"><CardHeader className="p-0 pb-4"><CardTitle>ข้อมูลออกเอกสาร</CardTitle><p className="text-sm text-muted-foreground">ใช้ในใบเสร็จและใบกำกับภาษี</p></CardHeader><CardContent className="space-y-4 p-0">{!canEdit && <p className="text-sm text-muted-foreground">ให้เจ้าของสำนักงานแก้ไขข้อมูลออกเอกสาร</p>}{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{profile && <>
    <div className="flex h-16 w-16 items-center justify-center rounded border bg-muted/30">{logo ? <img src={logo} alt="โลโก้สำนักงาน" className="h-16 w-16 object-contain" /> : <span className="text-xs text-muted-foreground">โลโก้</span>}</div>
    <label className="block text-sm font-medium">เปลี่ยนโลโก้<input type="file" accept="image/png,image/jpeg,image/svg+xml" disabled={!canEdit || busy} className="mt-1 block w-full text-sm" onChange={async e => { const file = e.target.files?.[0]; if (!file || !token) return; setBusy(true); setError(''); try { const result = await api.uploadBillingLogo(token, file); setProfile(p => p && { ...p, logoKey: result.logoKey }); } catch (err) { setError(err instanceof Error ? err.message : 'อัปโหลดโลโก้ไม่สำเร็จ ลองใหม่อีกครั้ง'); } finally { setBusy(false); e.target.value = ''; } }} /><span className="mt-1 block text-xs text-muted-foreground">เลือก PNG, JPG หรือ SVG ขนาดไม่เกิน 1 MB</span></label>
    <div className="grid gap-4 sm:grid-cols-2">{([['legalName', 'ชื่อจดทะเบียน', 'ใช้เป็นชื่อผู้ออกเอกสาร'], ['billingAddress', 'ที่อยู่ออกเอกสาร', 'ใช้เป็นที่อยู่บนเอกสาร'], ['taxId', 'เลขประจำตัวผู้เสียภาษี', 'ระบุ 13 หลัก'], ['taxBranch', 'รหัสสาขา', '00000 คือสำนักงานใหญ่']] as const).map(([key, label, hint]) => <label key={key} className="block space-y-1.5 text-sm font-medium">{label}<input value={profile[key] ?? (key === 'taxBranch' ? '00000' : '')} disabled={!canEdit || busy} onChange={e => setProfile({ ...profile, [key]: e.target.value })} className="min-h-11 w-full rounded-md border bg-background px-3" /><span className="block text-xs font-normal text-muted-foreground">{hint}</span></label>)}</div>
    <label className="flex items-center gap-2"><input type="checkbox" role="switch" checked={profile.vatRegistered} disabled={!canEdit || busy || !complete && !profile.vatRegistered} onChange={e => setProfile({ ...profile, vatRegistered: e.target.checked })} />จดทะเบียน VAT</label><p className="text-xs text-muted-foreground">กรอกชื่อจดทะเบียน เลขผู้เสียภาษี และที่อยู่ก่อนเปิด VAT</p>
    {canEdit && <><Button disabled={busy} onClick={() => void save()}>บันทึกข้อมูลออกเอกสาร</Button><p className="text-xs text-muted-foreground">กดเพื่อบันทึกข้อมูลสำนักงาน</p></>}
  </>}</CardContent></Card>;
}
