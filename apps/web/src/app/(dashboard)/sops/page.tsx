'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { FirmRole } from '@lawfirm/shared';
import { api, ApiError, SopItem } from '@/lib/api';
import { FirmRoleStr, PlaybookRelease, setupRequest } from '@/lib/practice-setup';
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
  const [onlyAuto, setOnlyAuto] = useState(false);

  useEffect(() => {
    if (!token) return;
    setupRequest<PlaybookRelease[]>(token, '/playbooks')
      .then((all) => {
        // API ส่งทุก version — เก็บเฉพาะ version ล่าสุดของแต่ละชื่อ
        const latest = new Map<string, PlaybookRelease>();
        for (const p of all) if (!latest.has(p.name) || p.version > latest.get(p.name)!.version) latest.set(p.name, p);
        setPlaybooks([...latest.values()]);
      })
      .catch(console.error);
  }, [token]);

  const autoItems = playbooks.filter((p) => !q || p.name.toLowerCase().includes(q.toLowerCase()));

  const load = () => {
    if (!token) return;
    setLoading(true);
    api
      .listSops(token, q || undefined)
      .then(setSops)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(load, [token, q]);

  const save = async () => {
    if (!token || !editing?.title?.trim() || !editing?.content?.trim()) return;
    setError(null);
    try {
      if (editing.id) {
        await api.updateSop(token, editing.id, {
          title: editing.title,
          content: editing.content,
          category: editing.category ?? undefined,
        });
      } else {
        await api.createSop(token, {
          title: editing.title,
          content: editing.content,
          category: editing.category ?? undefined,
        });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกไม่สำเร็จ');
    }
  };

  const remove = async (sop: SopItem) => {
    if (!token || !confirm(`ลบ SOP "${sop.title}"?`)) return;
    await api.deleteSop(token, sop.id).catch(console.error);
    load();
  };

  return (
    <div>
      <PageHeader
        title="SOP / คู่มือการทำงาน"
        description="คู่มือให้คนอ่าน และ SOP อัตโนมัติ (⚡) ที่ระบบสร้างงานให้เมื่อคดีเข้าขั้น"
        actions={
          isOwner ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing({})}>
                <Plus className="mr-1 h-4 w-4" /> SOP เอกสาร
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
          placeholder="ค้นหา SOP..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={onlyAuto} onChange={(e) => setOnlyAuto(e.target.checked)} />
          เฉพาะ SOP อัตโนมัติ
        </label>
      </div>

      {editing && (
        <Card className="mb-4">
          <CardContent className="space-y-3 p-4">
            <Input
              placeholder="ชื่อ SOP เช่น วิธีเปิดคดีใหม่"
              value={editing.title ?? ''}
              onChange={(e) => setEditing({ ...editing, title: e.target.value })}
            />
            <Input
              placeholder="หมวด (ไม่บังคับ) เช่น การรับคดี"
              value={editing.category ?? ''}
              onChange={(e) => setEditing({ ...editing, category: e.target.value })}
            />
            <textarea
              className="min-h-40 w-full rounded-md border bg-background p-3 text-sm"
              placeholder="ขั้นตอนโดยละเอียด..."
              value={editing.content ?? ''}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
            />
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button size="sm" onClick={save}>
                บันทึก
              </Button>
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>
                ยกเลิก
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {autoItems.length > 0 && (
        <div className="mb-3 space-y-3">
          {autoItems.map((p) => (
            <Card key={p.id}>
              <CardContent className="p-0">
                <details className="group">
                  <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-2 p-4 hover:text-primary [&::-webkit-details-marker]:hidden">
                    <Zap className="h-4 w-4 shrink-0 text-amber-500" />
                    <span className="font-semibold">{p.name}</span>
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
                            <p className="font-medium">{step.title}</p>
                            <p className="text-xs text-muted-foreground">
                              {[
                                step.primaryRole && `ผู้ทำ: ${ROLE_LABELS[step.primaryRole]}`,
                                step.secondaryRole && `ผู้สำรอง: ${ROLE_LABELS[step.secondaryRole]}`,
                                step.stage && `ขั้นคดี: ${caseStageLabel(step.stage)}`,
                                step.offsetDays != null && `กำหนด +${step.offsetDays} ${step.dayBasis === 'BUSINESS' ? 'วันทำการ' : 'วันปฏิทิน'}`,
                              ].filter(Boolean).join(' · ')}
                            </p>
                            {step.instructions && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{step.instructions}</p>}
                          </div>
                        </li>
                      ))}
                    </ol>
                    {isOwner && <Link href={`/playbooks/${p.id}`} className="mt-4 inline-block text-sm font-medium text-primary hover:underline">แก้ไข SOP อัตโนมัติ</Link>}
                  </div>
                </details>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {loading ? (
        <PageLoading title="กำลังโหลด SOP" lines={3} />
      ) : onlyAuto ? (
        autoItems.length === 0 && <EmptyState title="ไม่พบ SOP อัตโนมัติ" description="ยังไม่มี Playbook ที่เผยแพร่ในสำนักงานนี้" />
      ) : sops.length === 0 ? (
        autoItems.length === 0 && (
          <EmptyState
            title="ยังไม่มี SOP"
            description={isOwner ? 'เพิ่มคู่มือขั้นตอนแรกของสำนักงาน' : 'เจ้าของสำนักงานยังไม่ได้เพิ่ม SOP'}
          />
        )
      ) : (
        <div className="space-y-3">
          {sops.map((sop) => (
            <Card key={sop.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <button
                    className="flex items-center gap-2 text-left"
                    onClick={() => setExpanded(expanded === sop.id ? null : sop.id)}
                  >
                    <BookOpen className="h-4 w-4 shrink-0 text-primary" />
                    <span className="font-semibold">{sop.title}</span>
                    {sop.category && <Badge variant="muted">{sop.category}</Badge>}
                  </button>
                  {isOwner && (
                    <div className="flex shrink-0 gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(sop)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => remove(sop)}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  )}
                </div>
                {expanded === sop.id && (
                  <div className="mt-3 whitespace-pre-wrap border-t pt-3 text-sm text-muted-foreground">
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
    </div>
  );
}
