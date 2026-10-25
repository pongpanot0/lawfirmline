'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, CourtItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TextField } from '@/components/ui/form-fields';
import { EmptyState, Skeleton } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';

export default function CourtsPage() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => {
    if (!token) return;
    setLoadError(false);
    api.getCourts(token, false)
      .then(setCourts)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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
    setSaving(true);
    setSaveError('');
    try {
      await api.createCourt(token, form);
      setForm({ name: '', address: '' });
      setShowForm(false);
      load();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : d.common.loadFailed);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={d.admin.courtsTitle}
        description={d.admin.courtsDescription}
        actions={
          <Button size="sm" aria-expanded={showForm} onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" aria-hidden />{d.admin.addCourt}
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <TextField
                label={d.admin.courtName}
                required
                placeholder="ศาลแพ่งกรุงเทพใต้"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                containerClassName="flex-1"
              />
              <TextField
                label={d.admin.address}
                placeholder={d.admin.addressPlaceholder}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                containerClassName="flex-1"
              />
              <Button type="submit" disabled={saving} className="w-full sm:w-auto">{d.admin.addCourt}</Button>
            </form>
            {saveError && <p role="alert" className="mt-2 text-sm text-destructive">{saveError}</p>}
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {loadError ? (
          <LoadFailed onRetry={load} />
        ) : loading ? (
          <div role="status" aria-label={d.common.loading} className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>
        ) : courts.length === 0 ? (
          <EmptyState
            title="ยังไม่มีข้อมูลศาล"
            description="ศาลที่เพิ่มไว้จะเลือกได้ตอนเปิดคดีและลงนัดศาล"
            action={<Button size="sm" variant="outline" onClick={() => setShowForm(true)}><Plus className="h-4 w-4" aria-hidden />{d.admin.addCourt}</Button>}
          />
        ) : courts.map((court) => (
          <Card key={court.id}>
            <CardContent className="flex items-center justify-between gap-3 p-4">
              <div>
                <p className={!court.isActive ? 'font-medium text-muted-foreground' : 'font-medium'}>{court.name}</p>
                {court.address && <p className="text-xs text-muted-foreground">{court.address}</p>}
              </div>
              {!court.isActive && <Badge variant="muted">{d.admin.inactive}</Badge>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
