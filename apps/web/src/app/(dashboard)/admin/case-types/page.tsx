'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseTypeItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CaseTypesPage() {
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

  if (user?.role !== Role.ADMIN) {
    return <p className="text-destructive">Access denied. Admin only.</p>;
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
        title="Case Types / ประเภทคดี"
        description="Manage case categories for the firm"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4" />
            Add Type
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">Name</label>
                <Input
                  required
                  placeholder="e.g. Litigation"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Description</label>
                <Input
                  placeholder="Optional description"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">Save</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {types.map((t) => (
          <Card key={t.id} className={!t.isActive ? 'opacity-60' : undefined}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold">{t.name}</h3>
                <span className="shrink-0 text-xs text-muted-foreground">{t._count?.cases ?? 0} cases</span>
              </div>
              {t.description && <p className="mt-1 text-sm text-muted-foreground">{t.description}</p>}
              {!t.isActive && <p className="mt-2 text-xs text-destructive">Inactive</p>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
