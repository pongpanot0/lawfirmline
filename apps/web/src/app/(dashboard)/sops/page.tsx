'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { FIRM_ROLE_LABELS, FirmRole, hasFirmCapability } from '@lawfirm/shared';
import { api, ApiError, SopItem, type WorkflowTemplate } from '@/lib/api';
import { FirmRoleStr, latestPlaybookReleases, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
import { caseStageLabel } from '@/lib/stage-labels';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { getPageGuide } from '@/components/guide/page-guides';
import { Card, CardContent } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TextField, TextareaField } from '@/components/ui/form-fields';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { WorkflowTemplates } from '@/components/workflows/WorkflowTemplates';
import { ArrowRightLeft, BookOpen, ChevronDown, Plus, Pencil, Trash2, Zap } from 'lucide-react';
import { SearchHint } from '@/components/guide/SearchHint';

const ROLE_LABELS: Record<FirmRoleStr, string> = {
  OWNER: 'เจ้าของสำนักงาน',
  SENIOR_LAWYER: 'ทนายอาวุโส',
  OFFICE_MANAGER: FIRM_ROLE_LABELS.OFFICE_MANAGER.th,
  LAWYER: 'ทนาย',
  ASSISTANT: 'ผู้ช่วย',
  EXTERNAL: 'ผู้รับงานภายนอก (ฟรีแลนซ์)',
};

export default function SopsPage() { return <Suspense><SopsContent /></Suspense>; }

function SopsContent() {
  const { token, user } = useAuth();
  const canManageContent = hasFirmCapability(user?.firmRole, 'manageFirmContent');
  const canEditFlows = user?.firmRole === FirmRole.OWNER || user?.firmRole === FirmRole.SENIOR_LAWYER;
  // Everyone in the firm may write down their own way of working (handbook or handoff flow); editing others' stays with the roles above.
  const canCreate = !!user?.firmRole && user.firmRole !== FirmRole.EXTERNAL;
  const [sops, setSops] = useState<SopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<SopItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [playbooks, setPlaybooks] = useState<PlaybookRelease[]>([]);
  const params = useSearchParams();
  const [view, setView] = useState<'all' | 'manual' | 'auto' | 'handoff'>(() => params.get('tab') === 'playbooks' ? 'auto' : params.get('tab') === 'flows' ? 'handoff' : 'manual');
  const [createOpen, setCreateOpen] = useState(false);
  const [flowCount, setFlowCount] = useState(0);
  const [flowEditor, setFlowEditor] = useState<WorkflowTemplate | 'new' | null>(null);
  useEffect(() => { if (token) api.getWorkflowTemplates(token).then(items => setFlowCount(items.length)).catch(() => {}); }, [token, flowEditor]);
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
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง');
    } finally { setSaving(false); }
  };

  const remove = async (sop: SopItem) => {
    if (!token || !confirm(`ลบคู่มือการทำงาน "${sop.title}"?`)) return;
    try { await api.deleteSop(token, sop.id); load(); }
    catch { setError('ลบคู่มือไม่สำเร็จ กรุณาลองอีกครั้ง'); }
  };

  return (
    <div className="mx-auto max-w-5xl min-w-0 space-y-4">
      <PageHeader
        title="คู่มือการทำงาน"
        description="วิธีทำงานของสำนักงาน ชุดงานที่ระบบสร้างให้ในคดี และสายงานส่งต่อ"
        actions={canCreate ? <div className="relative">
          <Button onClick={() => setCreateOpen(!createOpen)} aria-expanded={createOpen} aria-haspopup="menu" title="เลือกรูปแบบที่ต้องการสร้าง"><Plus className="h-4 w-4" />สร้างใหม่ <ChevronDown className="h-4 w-4" /></Button>
          <p className="mt-1 text-xs text-muted-foreground">เลือกรูปแบบที่ต้องการสร้าง</p>
          {createOpen && <div role="menu" aria-label="สร้างใหม่" onKeyDown={(e) => { if (e.key === 'Escape') setCreateOpen(false); }} className="absolute right-0 z-20 w-72 max-w-[85vw] rounded-xl border bg-card p-2 shadow-lg">
            <button role="menuitem" className="no-marker block w-full rounded-md p-3 text-left hover:bg-muted" onClick={() => { setEditing({}); setError(null); setSaved(''); setCreateOpen(false); }}>คู่มือการทำงาน <span className="block text-xs text-muted-foreground">เขียนขั้นตอนให้ทีมอ่าน</span></button>
            {canManageContent && <Link role="menuitem" href="/playbooks/new" className="block rounded-md p-3 hover:bg-muted">ชุดงานอัตโนมัติ <span className="block text-xs text-muted-foreground">ระบบสร้างงานให้ในคดีตามขั้นตอนนี้</span></Link>}
            <button role="menuitem" className="no-marker block w-full rounded-md p-3 text-left hover:bg-muted" onClick={() => { setView('handoff'); setQ(''); setFlowEditor('new'); setCreateOpen(false); }}>สายงานส่งต่อ <span className="block text-xs text-muted-foreground">งานส่งต่อจากคนหนึ่งไปอีกคนทีละขั้น</span></button>
          </div>}
        </div> : undefined}
      />

      <div className="space-y-3 rounded-xl border-l-4 border-[var(--color-brass)] bg-[var(--operations-highlight)] p-5">
        <div className="flex flex-wrap items-center gap-2">
        <Input
          aria-label="ค้นหาคู่มือหรือขั้นตอน"
          aria-describedby="sops-search-hint"
          placeholder="ค้นหาคู่มือ ชุดงาน หรือสายงาน เช่น ยื่นฟ้อง สืบพยาน"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="min-w-0 w-full"
        />
        <SearchHint id="sops-search-hint">{getPageGuide('/sops')?.searchHint}</SearchHint>
        </div>
        <Tabs value={view} onValueChange={(v) => setView(v as typeof view)}>
          <TabsList className="h-auto w-full gap-1">
            <TabsTrigger className="flex-1 whitespace-nowrap" value="manual"><BookOpen className="mr-1 h-4 w-4 shrink-0" />คู่มือให้อ่าน {manualItems.length}</TabsTrigger>
            <TabsTrigger className="flex-1 whitespace-nowrap" value="auto"><Zap className="mr-1 h-4 w-4 shrink-0" />ชุดงานอัตโนมัติ {autoItems.length}</TabsTrigger>
            <TabsTrigger className="flex-1 whitespace-nowrap" value="handoff"><ArrowRightLeft className="mr-1 h-4 w-4 shrink-0" />สายงานส่งต่อ {flowCount}</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      {saved && <p role="status" className="text-sm text-primary">{saved}</p>}
      {error && !editing && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {loadError && <LoadFailed message={loadError} onRetry={load} />}

      {editing && (
        <Card className="mb-4">
          <CardContent className="p-4">
            <form onSubmit={(event) => { event.preventDefault(); void save(); }} className="space-y-4" aria-label="เขียนคู่มือ">
            <fieldset disabled={saving} className="space-y-4">
            <h2 className="font-semibold">{editing.id ? 'แก้ไขคู่มือ' : 'เขียนคู่มือใหม่'}</h2>
            <TextField
              label="ชื่อคู่มือ" required autoFocus maxLength={200}
              placeholder="เช่น วิธีเปิดคดีใหม่"
              value={editing.title ?? ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <details className="rounded-lg border p-3">
              <summary className="disclosure flex min-h-11 cursor-pointer items-center text-sm">หมวดคู่มือ (ไม่บังคับ){editing.category?.trim() && ` · ${editing.category}`}</summary>
            <Input
              aria-label="หมวดคู่มือ" maxLength={100} className="mt-3"
              placeholder="หมวด (ไม่บังคับ) เช่น การรับคดี"
              value={editing.category ?? ''}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
            </details>
            <TextareaField
              label="ขั้นตอนการทำงาน" required maxLength={50000} rows={6}
              placeholder={'1. ต้องเตรียมอะไร\n2. ทำอย่างไร\n3. ส่งให้ใครตรวจ'}
              value={editing.content ?? ''}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => setEditing(null)}>
                ยกเลิก
              </Button>
              <Button type="submit" size="sm">
                {saving ? 'กำลังบันทึก…' : 'บันทึกคู่มือ'}
              </Button>
            </div>
            </fieldset>
            </form>
          </CardContent>
        </Card>
      )}

      {token && (view === 'all' || view === 'handoff') && <WorkflowTemplates token={token} canEdit={canEditFlows} canCreate={canCreate} userId={user?.id} search={q} editor={flowEditor} onEditorChange={setFlowEditor} />}

      {!loading && !loadError && (view === 'all' || view === 'auto') && autoItems.length > 0 && (
        <div className="mb-3 space-y-3">
          <h2 className="text-sm font-semibold">ชุดงานอัตโนมัติทั้งหมด</h2>
          {autoItems.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-0">
                <details className="group">
                  <summary className="disclosure flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 p-4 hover:text-primary [&::-webkit-details-marker]:hidden">
                    <Zap className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 break-words font-semibold">{p.name}</span>
                    <Badge variant="muted">อัตโนมัติ · {p.steps.length} ขั้นตอน</Badge>
                    <span className="ml-auto text-xs tabular-nums text-muted-foreground">ฉบับที่ {p.version}</span>
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
                                step.side && `ฝ่าย: ${step.side === 'PLAINTIFF' ? 'โจทก์' : 'จำเลย'}`,
                                step.requiresAttachment && 'ต้องแนบไฟล์',
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
                      <Link href={`/cases?sop=${encodeURIComponent(p.id)}`} className={buttonVariants({ size: 'sm', variant: 'outline' })}>ใช้กับคดี</Link>
                      {<Link href={`/playbooks/${p.id}`} className="inline-flex min-h-11 items-center text-sm font-medium text-primary hover:underline">{canManageContent ? 'แก้ไขชุดงานอัตโนมัติ' : 'ดูชุดงานอัตโนมัติ'}</Link>}
                    </div>
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading && view !== 'handoff' ? (
        <PageLoading variant="list" title="กำลังโหลดคู่มือการทำงาน" lines={3} />
      ) : !loadError && (view === 'all' || view === 'manual') && manualItems.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold">คู่มือให้อ่าน</h2>
          {manualItems.map((sop) => (
            <Card key={sop.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button" aria-expanded={expanded === sop.id} aria-controls={`sop-content-${sop.id}`}
                    className="flex min-h-11 min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => setExpanded(expanded === sop.id ? null : sop.id)}
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="min-w-0 break-words font-semibold">{sop.title}</span>
                    {sop.category && <Badge variant="muted" className="max-w-full break-all">{sop.category}</Badge>}
                  </button>
                  {(canManageContent || (!!user?.id && sop.createdById === user.id)) && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" aria-label={`แก้ไข ${sop.title}`} onClick={() => { setEditing(sop); setError(null); setSaved(''); }}>
                        <Pencil className="h-4 w-4" aria-hidden />
                      </Button>
                      <Button size="sm" variant="ghost" aria-label={`ลบ ${sop.title}`} onClick={() => remove(sop)}>
                        <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
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
      {!loading && !loadError && (view === 'auto' ? !autoItems.length : view === 'manual' ? !manualItems.length : false) && <EmptyState
        title={search ? 'ไม่พบคู่มือที่ค้นหา' : 'ยังไม่มีคู่มือในหมวดนี้'}
        description={search ? 'ลองค้นด้วยชื่อคู่มือหรือคำในขั้นตอน' : (view === 'auto' ? canManageContent : canCreate) ? 'เพิ่มรายการในหมวดนี้เพื่อให้ทีมใช้งาน'  : 'ขอให้ผู้ดูแลสำนักงานเพิ่มคู่มือ'}
        action={!search && (view === 'auto' ? canManageContent : canCreate) ? (view === 'auto'
          ? <Link href="/playbooks/new" className={buttonVariants({ size: 'sm', variant: 'outline' })}><Zap className="h-4 w-4" aria-hidden />สร้างชุดงานอัตโนมัติ</Link>
          : <Button size="sm" variant="outline" onClick={() => { setEditing({}); setError(null); setSaved(''); }}><Plus className="h-4 w-4" aria-hidden />เขียนคู่มือ</Button>) : undefined} />}
    </div>
  );
}
