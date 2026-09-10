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

export default function CaseTypesPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [types, setTypes] = useState<CaseTypeItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', description: '' });

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
    await api.createCaseType(token, form);
    setForm({ name: '', description: '' });
    setShowForm(false);
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
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">{d.admin.name}</label>
                <Input
                  required
                  placeholder={d.admin.namePlaceholder}
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">{d.admin.typeDescription}</label>
                <Input
                  placeholder={d.admin.descriptionPlaceholder}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">{d.common.save}</Button>
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
              {!t.isActive && <p className="mt-2 text-xs text-destructive">{d.admin.inactive}</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
