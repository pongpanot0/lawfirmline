'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { FirmRole } from '@lawfirm/shared';
import { api, ApiError, SopItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { BookOpen, Plus, Pencil, Trash2 } from 'lucide-react';

export default function SopsPage() {
  const { token, user } = useAuth();
  const isOwner = user?.firmRole === FirmRole.OWNER;
  const [sops, setSops] = useState<SopItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Partial<SopItem> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

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
        description="ขั้นตอนมาตรฐานของสำนักงาน — วิธีเปิดคดี ส่งรีวิว ปิดคดี ฯลฯ"
        actions={
          isOwner ? (
            <Button size="sm" onClick={() => setEditing({})}>
              <Plus className="mr-1 h-4 w-4" /> เพิ่ม SOP
            </Button>
          ) : undefined
        }
      />

      <Input
        placeholder="ค้นหา SOP..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
        className="mb-4 max-w-sm"
      />

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

      {loading ? (
        <PageLoading title="กำลังโหลด SOP" lines={3} />
      ) : sops.length === 0 ? (
        <EmptyState
          title="ยังไม่มี SOP"
          description={isOwner ? 'เพิ่มคู่มือขั้นตอนแรกของสำนักงาน' : 'เจ้าของสำนักงานยังไม่ได้เพิ่ม SOP'}
        />
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
