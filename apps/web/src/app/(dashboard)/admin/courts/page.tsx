'use client';

import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { FirmRole } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CourtItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function CourtsPage() {
  const { token, user } = useAuth();
  const [courts, setCourts] = useState<CourtItem[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: '', address: '' });

  const load = () => {
    if (!token) return;
    api.getCourts(token, false).then(setCourts).catch(console.error);
  };

  useEffect(() => {
    load();
  }, [token]);

  if (user?.firmRole !== FirmRole.OWNER) {
    return <p className="text-destructive">Access denied. Admin only.</p>;
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    await api.createCourt(token, form);
    setForm({ name: '', address: '' });
    setShowForm(false);
    load();
  };

  return (
    <div>
      <PageHeader
        title="Courts / ศาล"
        description="Manage court list for case and calendar selection"
        actions={
          <Button size="sm" onClick={() => setShowForm(!showForm)}>
            <Plus className="h-4 w-4" />Add Court
          </Button>
        }
      />

      {showForm && (
        <Card className="mb-6">
          <CardContent className="p-4 sm:p-6">
            <form onSubmit={handleCreate} className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="text-sm font-medium">Court Name / ชื่อศาล *</label>
                <Input
                  required
                  placeholder="ศาลแพ่งกรุงเทพใต้"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1"
                />
              </div>
              <div className="flex-1">
                <label className="text-sm font-medium">Address</label>
                <Input
                  placeholder="Optional address"
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="mt-1"
                />
              </div>
              <Button type="submit" className="w-full sm:w-auto">Save</Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {courts.map((court) => (
          <Card key={court.id} className={!court.isActive ? 'opacity-50' : ''}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-medium">{court.name}</p>
                {court.address && <p className="text-xs text-muted-foreground">{court.address}</p>}
              </div>
              {!court.isActive && <span className="text-xs text-muted-foreground">Inactive</span>}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
