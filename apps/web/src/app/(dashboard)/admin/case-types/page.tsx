'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, CaseTypeItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import { DocumentCategory } from '@lawfirm/shared';
import { documentCategoryLabel } from '@/lib/stage-labels';

export default function CaseTypesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [types, setTypes] = useState<CaseTypeItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  // เก็บเป็นค่า DocumentCategory ไม่ใช่ข้อความอิสระ — ต้องเทียบกับหมวดของเอกสารได้ตรง ๆ
  const [form, setForm] = useState({ name: '', description: '', requiredDocs: [] as string[] });

  const load = () => {
    if (!token) return;
    api.getCaseTypes(token, false).then(setTypes).catch(console.error);
  };

  useEffect(() => {
    load();
  }, [token]);

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    await api.createCaseType(token, {
      name: form.name,
      description: form.description,
      requiredDocuments: form.requiredDocs,
    });
    setForm({ name: '', description: '', requiredDocs: [] });
    setShowForm(false);
    load();
  };

  const handleDelete = async (type: CaseTypeItem) => {
    if (!token) return;
    if (!window.confirm(`ลบประเภทคดี "${type.name}" ใช่ไหม`)) return;
    await api.deleteCaseType(token, type.id);
    load();
  };

  return (
    <div>
      <PageHeader
        title={d.admin.caseTypesTitle}
        description={d.admin.caseTypesDescription}
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            {d.admin.addCaseType}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="case-type-name" className="text-sm font-medium">{d.admin.name}</label>
                  <Input
                    id="case-type-name"
                    required
                    placeholder={d.admin.namePlaceholder}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
                <div>
                  <label htmlFor="case-type-description" className="text-sm font-medium">{d.admin.typeDescription}</label>
                  <Input
                    id="case-type-description"
                    placeholder={d.admin.descriptionPlaceholder}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className="mt-1.5"
                  />
                </div>
              </div>

              <div className="rounded-lg border bg-muted/30 p-3">
                <p className="text-sm font-medium">หมวดเอกสารที่คดีประเภทนี้ต้องมี</p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {Object.values(DocumentCategory).map((value) => {
                    const picked = form.requiredDocs.includes(value);
                    return (
                      <button
                        key={value}
                        type="button"
                        onClick={() =>
                          setForm({
                            ...form,
                            requiredDocs: picked
                              ? form.requiredDocs.filter((item) => item !== value)
                              : [...form.requiredDocs, value],
                          })
                        }
                        className={`min-h-9 rounded-full border px-3 py-1 text-xs transition-colors ${
                          picked
                            ? 'border-primary bg-primary text-primary-foreground'
                            : 'border-input bg-card text-muted-foreground hover:border-primary/40'
                        }`}
                      >
                        {documentCategoryLabel(value, 'th')}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
                <Button type="button" variant="ghost" onClick={() => setShowForm(false)}>{d.common.cancel}</Button>
                <Button type="submit">{d.common.save}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState title="ยังไม่มีประเภทคดี" description="เพิ่มประเภทคดีแรกเพื่อใช้เลือกตอนเปิดคดีและตั้ง deadline rule เฉพาะประเภทได้" />
          </div>
        ) : types.map((t) => (
          <Card key={t.id} className={!t.isActive ? 'opacity-60' : undefined}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{fmt(d.admin.caseCount, { count: t._count?.cases ?? 0 })}</span>
              </div>
              {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
              {(t.requiredDocuments?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  เอกสารที่ต้องมี:{' '}
                  {t.requiredDocuments!.map((c) => documentCategoryLabel(c, 'th')).join(', ')}
                </p>
              )}
              {!t.isActive && <p className="mt-2 text-xs text-destructive">{d.admin.inactive}</p>}
              {t.isActive && (
                <button
                  type="button"
                  onClick={() => handleDelete(t)}
                  className="mt-3 text-xs text-destructive hover:underline"
                >
                  ลบ
                </button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
