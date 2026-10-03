'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { FirmRole } from '@lawfirm/shared';
import { api, ApiError, SopItem } from '@/lib/api';
import { FirmRoleStr, latestPlaybookReleases, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { caseStageLabel } from '@/lib/stage-labels';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { BookOpen, ChevronDown, Plus, Pencil, Trash2, Zap } from 'lucide-react';

const ROLE_LABELS: Record<FirmRoleStr, string> = {
  OWNER: 'เจ้าของสำนักงาน',
  SENIOR_LAWYER: 'ทนายอาวุโส',
  LAWYER: 'ทนาย',
  ASSISTANT: 'ผู้ช่วย',
  EXTERNAL: 'ผู้รับงานภายนอก (ฟรีแลนซ์)',
};

export default function SopsPage() {
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const [sops, setSops] = useState<SopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<SopItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const [view, setView] = useState<'all' | 'manual' | 'auto'>('all');
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [saved, setSaved] = useState('');
  const search = q.trim().toLocaleLowerCase();
  const autoItems = playbooks.filter((p) => [p.name, ...p.steps.flatMap((step) => [step.title, step.instructions])].join(' ').toLocaleLowerCase().includes(search));
  const manualItems = sops.filter((sop) => [sop.title, sop.category, sop.content].join(' ').toLocaleLowerCase().includes(search));

  const load = () => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    Promise.all([api.listSops(token), setupRequest<PlaybookRelease[]>(token, '/playbooks')])
      .then(([manuals, releases]) => {
        setSops(manuals);
        setPlaybooks(latestPlaybookReleases(releases));
      })
      .catch(() => setLoadError('โหลดคู่มือไม่สำเร็จ กรุณาลองอีกครั้ง'))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const save = async () => {
    if (!token || !editing || saving) return;
    if (!editing.title?.trim() || !editing.content?.trim()) {
      setError('กรอกชื่อคู่มือและขั้นตอนการทำงานก่อนบันทึก');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      const payload = { title: editing.title.trim(), content: editing.content.trim(), category: editing.category?.trim() || (editing.id ? '' : undefined) };
      const result = editing.id ? await api.updateSop(token, editing.id, payload) : await api.createSop(token, payload);
      setEditing(null);
      setExpanded(result.id);
      setSaved(`บันทึกคู่มือ “${result.title}” แล้ว`);
      setQ('');
      setView('manual');
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    } finally { setSaving(false); }
  };

  const remove = async (sop: SopItem) => {
    if (!token || !confirm(`ลบ SOP "${sop.title}"?`)) return;
    try { await api.deleteSop(token, sop.id); load(); }
    catch { setError('ลบคู่มือไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-4">
      <PageHeader
        title="SOP / คู่มือการทำงาน"
        description="ค้นหาวิธีทำงานของสำนักงาน หรือเลือก SOP ที่ช่วยสร้างงานให้ทีม"
        actions={
          isOwner ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => { setEditing({}); setError(null); setSaved(''); }}>
                <Plus className="mr-1 h-4 w-4" /> เขียนคู่มือ
              </Button>
              <Link href="/playbooks/new">
                <Button size="sm">
                  <Zap className="mr-1 h-4 w-4" /> สร้าง SOP อัตโนมัติ
                </Button>
              </Link>
            </div>
          ) : undefined
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          aria-label="ค้นหาคู่มือหรือขั้นตอน"
          placeholder="ค้นหา SOP..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <div role="group" aria-label="ประเภทคู่มือ" className="flex flex-wrap gap-2">
          {([['all', 'ทั้งหมด', manualItems.length + autoItems.length], ['manual', 'คู่มือให้อ่าน', manualItems.length], ['auto', 'สร้างงานอัตโนมัติ', autoItems.length]] as const).map(([key, label, count]) =>
            <Button key={key} size="sm" variant={view === key ? 'default' : 'outline'} aria-pressed={view === key} onClick={() => setView(key)}>{label} ({count})</Button>)}
        </div>
      </div>
      {saved && <p role="status" className="text-sm text-primary">{saved}</p>}
      {error && !editing && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loadError && <div role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{loadError}<Button variant="outline" size="sm" className="ml-2" onClick={load}>ลองใหม่</Button></div>}

      {editing && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4" aria-label="เขียนคู่มือ">
            <fieldset disabled={saving} className="space-y-4">
            <h2 className="font-semibold">{editing.id ? 'แก้ไขคู่มือ' : 'เขียนคู่มือใหม่'}</h2>
            <label className="block text-sm font-medium">ชื่อคู่มือ *
            <Input
              required autoFocus maxLength={200} className="mt-1"
              placeholder="ชื่อ SOP เช่น วิธีเปิดคดีใหม่"
              value={editing.title ?? ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            </label>
            <details className="rounded-lg border p-3">
              <summary className="cursor-pointer text-sm">หมวดคู่มือ (ไม่บังคับ){editing.category?.trim() && ` · ${editing.category}`}</summary>
            <Input
              aria-label="หมวดคู่มือ" maxLength={100} className="mt-3"
              placeholder="หมวด (ไม่บังคับ) เช่น การรับคดี"
              value={editing.category ?? ''}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
            </details>
            <label className="block text-sm font-medium">ขั้นตอนการทำงาน *
            <textarea
              required maxLength={50000} rows={6} className="mt-1 w-full rounded-md border bg-background p-3 text-sm"
              placeholder={'1. ต้องเตรียมอะไร\n2. ทำอย่างไร\n3. ส่งให้ใครตรวจ'}
              value={editing.content ?? ''}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            </label>
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" size="sm">
                {saving ? 'กำลังบันทึก…' : 'บันทึกคู่มือ'}
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                ยกเลิก
              </Button>
            </div>
            </fieldset>
            </form>
          </CardContent>
        </Card>
      )}

      {!loading && !loadError && view !== 'manual' && autoItems.length > 0 && (
        <div className="mb-3 space-y-3">
          <h2 className="text-sm font-semibold">SOP สร้างงานอัตโนมัติ</h2>
          {autoItems.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-0">
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 p-4 hover:text-primary [&::-webkit-details-marker]:hidden">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="min-w-0 break-words font-semibold">{p.name}</span>
                    <Badge variant="muted">อัตโนมัติ · {p.steps.length} ขั้นตอน</Badge>
                    <span className="ml-auto text-xs text-muted-foreground">v{p.version}</span>
                    <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
                  </summary>
                  <div className="border-t px-4 py-3">
                    <ol className="space-y-3">
                      {p.steps.map((step, index) => (
                        <li key={index} className="flex gap-3 text-sm">
                          <span className="w-6 shrink-0 text-right text-xs text-muted-foreground">{index + 1}.</span>
                          <div>
                            <p className="break-words font-medium">{step.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                step.primaryRole && `ผู้ทำ: ${ROLE_LABELS[step.primaryRole]}`,
                                step.secondaryRole && `ผู้สำรอง: ${ROLE_LABELS[step.secondaryRole]}`,
                                step.stage && `ขั้นคดี: ${caseStageLabel(step.stage)}`,
                                step.offsetDays != null && `กำหนด +${step.offsetDays} ${step.dayBasis === 'BUSINESS' ? 'วันทำการ' : 'วันปฏิทิน'}`,
                              ].filter(Boolean).join(' · ')}
                            </p>
                            {step.instructions && <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">{step.instructions}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                    <div className="mt-4 flex flex-wrap items-center gap-4">
                      <Link href={`/cases?sop=${encodeURIComponent(p.id)}`} className="inline-flex min-h-10 items-center rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground">ใช้กับคดี</Link>
                      {isOwner && <Link href={`/playbooks/${p.id}`} className="text-sm font-medium text-primary hover:underline">แก้ไข SOP อัตโนมัติ</Link>}
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <PageLoading title="กำลังโหลด SOP" lines={3} />
      ) : !loadError && view !== 'auto' && manualItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">คู่มือให้อ่าน</h2>
          {manualItems.map((sop) => (
            <Card key={sop.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button" aria-expanded={expanded === sop.id} aria-controls={`sop-content-${sop.id}`}
                    className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-left"
                    onClick={() => setExpanded(expanded === sop.id ? null : sop.id)}
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                    <span className="min-w-0 break-words font-semibold">{sop.title}</span>
                    {sop.category && <Badge variant="muted" className="max-w-full break-all">{sop.category}</Badge>}
                  </button>
                  {isOwner && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" aria-label={`แก้ไข ${sop.title}`} onClick={() => { setEditing(sop); setError(null); setSaved(''); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`ลบ ${sop.title}`} onClick={() => remove(sop)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
                {expanded === sop.id && (
                  <div id={`sop-content-${sop.id}`} className="mt-3 whitespace-pre-wrap break-words border-t pt-3 text-sm text-muted-foreground">
                    {sop.content}
                  </div>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  แก้ล่าสุดโดย {sop.updatedBy.firstName} {sop.updatedBy.lastName} ·{' '}
                  {new Date(sop.updatedAt).toLocaleDateString('th-TH')}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
      {!loading && !loadError && (view === 'auto' ? !autoItems.length : view === 'manual' ? !manualItems.length : !autoItems.length && !manualItems.length) && <EmptyState
        title={search ? 'ไม่พบคู่มือที่ค้นหา' : 'ยังไม่มีคู่มือในหมวดนี้'}
        description={search ? 'ลองค้นด้วยชื่อคู่มือ คำในขั้นตอน หรือเปลี่ยนประเภทคู่มือ' : isOwner ? 'เริ่มจากเขียนคู่มือ หรือสร้าง SOP อัตโนมัติด้านบน' : 'เจ้าของสำนักงานยังไม่ได้เพิ่มคู่มือในหมวดนี้'} />}
    </div>
  );
}
