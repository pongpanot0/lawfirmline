'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { hasFirmCapability } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';
import { api, CaseTypeItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form-fields';
import { Badge } from '@/components/ui/badge';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { DocumentCategory } from '@lawfirm/shared';
import { documentCategoryLabel } from '@/lib/stage-labels';

export default function CaseTypesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [types, setTypes] = useState<CaseTypeItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  // เก็บเป็นค่า DocumentCategory ไม่ใช่ข้อความอิสระ — ต้องเทียบกับหมวดของเอกสารได้ตรง ๆ
  const [form, setForm] = useState({ name: '', description: '', requiredDocs: [] as string[] });

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!token) return;
    setLoadError(false);
    api.getCaseTypes(token, false)
      .then(setTypes)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [token]);

  if (!hasFirmCapability(user?.firmRole, 'manageFirmContent')) {
    return <p className="text-destructive">{d.admin.accessDenied}</p>;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSaving(true);
    setActionError('');
    try {
      await api.createCaseType(token, {
        name: form.name,
        description: form.description,
        requiredDocuments: form.requiredDocs,
      });
      setForm({ name: '', description: '', requiredDocs: [] });
      setShowForm(false);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : d.common.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (type: CaseTypeItem) => {
    if (!token) return;
    if (!window.confirm(`ลบประเภทคดี "${type.name}" ใช่ไหม`)) return;
    setActionError('');
    try {
      await api.deleteCaseType(token, type.id);
      load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : d.common.loadFailed);
    }
  };

  return (
    <div>
      <PageHeader
        title={d.admin.caseTypesTitle}
        description={d.admin.caseTypesDescription}
        actions={
          <Button size="sm" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" aria-hidden />
            {d.admin.addCaseType}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="space-y-4 p-4 sm:p-6">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextField
                  id="case-type-name"
                  label={d.admin.name}
                  required
                  placeholder={d.admin.namePlaceholder}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                />
                <TextField
                  id="case-type-description"
                  label={d.admin.typeDescription}
                  placeholder={d.admin.descriptionPlaceholder}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                />
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
                        aria-pressed={picked}
                        onClick={() =>
                          setForm({
                            ...form,
                            requiredDocs: picked
                              ? form.requiredDocs.filter((item) => item !== value)
                              : [...form.requiredDocs, value],
                          })
                        }
                        className={`min-h-11 rounded-full border px-3 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-9 ${
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
                <Button type="submit" disabled={saving}>{d.admin.addCaseType}</Button>
              </div>
            </form>
            {actionError && <p role="alert" className="text-sm text-destructive">{actionError}</p>}
          </CardContent>
        </Card>
      )}

      {actionError && !showForm && <p role="alert" className="mb-3 text-sm text-destructive">{actionError}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loadError ? (
          <div className="sm:col-span-2 lg:col-span-3"><LoadFailed onRetry={load} /></div>
        ) : loading ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)
        ) : types.length === 0 ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <EmptyState
              title="ยังไม่มีประเภทคดี"
              description="ประเภทคดีใช้เลือกตอนเปิดคดีและตั้ง deadline rule เฉพาะประเภท"
              action={<Button size="sm" variant="outline" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" aria-hidden />{d.admin.addCaseType}</Button>}
            />
          </div>
        ) : types.map((t) => (
          <Card key={t.id}>
            <CardContent className="flex h-full flex-col p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{fmt(d.admin.caseCount, { count: t._count?.cases ?? 0 })}</span>
              </div>
              {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
              {(t.requiredDocuments?.length ?? 0) > 0 && (
                <p className="mt-1 text-xs text-muted-foreground">
                  เอกสารที่ต้องมี:{' '}
                  {t.requiredDocuments!.map((c) => documentCategoryLabel(c, 'th')).join(', ')}
                </p>
              )}
              {!t.isActive && <Badge variant="muted" className="mt-2 self-start">{d.admin.inactive}</Badge>}
              {t.isActive && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDelete(t)}
                  className="mt-auto self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  aria-label={`ลบประเภทคดี ${t.name}`}
                >
                  ลบ
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
