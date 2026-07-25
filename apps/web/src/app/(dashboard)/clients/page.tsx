'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Search, Mail, Phone, Building2, Briefcase, Plus, User } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ClientItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { EmptyState } from '@/components/ui/misc';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { fmt } from '@/lib/i18n/dashboard';

export default function ClientsPage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [clients, setClients] = useState<ClientItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientItem | null>(null);
  const [tab, setTab] = useState('information');
  const [loading, setLoading] = useState(true);

  const load = () => {
    if (!token) return;
    api.getClients(token, search || undefined)
      .then(setClients)
      .catch(console.error)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    load();
  }, [token, search]);

  useEffect(() => {
    const id = searchParams.get('id');
    if (!id || !token) return;
    api.getClient(token, id).then(setSelected).catch(console.error);
  }, [searchParams, token]);

  if (selected) {
    const primary = selected.contacts.find((c) => c.isPrimary) ?? selected.contacts[0];
    return (
      <div>
        <button type="button" onClick={() => setSelected(null)} className="mb-4 text-sm text-primary hover:underline">
          {d.clients.allClients}
        </button>
        <div className="mb-6 flex items-center gap-4">
          <Avatar fallback={selected.name.slice(0, 2).toUpperCase()} className="h-14 w-14 text-base" />
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-sm text-muted-foreground">
              {selected.type === 'COMPANY' ? d.clients.company : d.clients.individual} · {fmt(d.clients.casesCount, { count: selected._count?.cases ?? selected.cases?.length ?? 0 })}
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="information">Information</TabsTrigger>
            <TabsTrigger value="contacts">Contacts</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
            <Card>
              <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
                {primary?.email && (
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{primary.email}</p></div>
                  </div>
                )}
                {primary?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{primary.phone}</p></div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Type</p><p className="text-sm">{selected.type === 'COMPANY' ? 'Company' : 'Individual'}</p></div>
                </div>
                {selected.notes && (
                  <div className="sm:col-span-2">
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm">{selected.notes}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="contacts">
            <div className="space-y-2">
              {selected.contacts.map((c, i) => (
                <Card key={c.id ?? i}>
                  <CardContent className="flex items-start gap-3 p-4">
                    <User className="mt-0.5 h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="font-medium">
                        {c.name}
                        {c.isPrimary && <span className="ml-2 text-xs text-primary">(Primary)</span>}
                      </p>
                      {c.position && <p className="text-xs text-muted-foreground">{c.position}</p>}
                      <div className="mt-1 space-y-0.5 text-sm text-muted-foreground">
                        {c.email && <p>{c.email}</p>}
                        {c.phone && <p>{c.phone}</p>}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="cases">
            <div className="space-y-2">
              {(selected.cases ?? []).map((c) => (
                <Card key={c.id} className="cursor-pointer hover:bg-accent/50" onClick={() => router.push(`/cases/${c.id}`)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.ownRef}{c.courtName ? ` · ${c.courtName}` : ''}</p>
                    </div>
                    <CaseStatusBadge status={c.status} />
                  </CardContent>
                </Card>
              ))}
              {(selected.cases ?? []).length === 0 && (
                <p className="text-sm text-muted-foreground">No cases linked yet</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title={d.clients.title}
        description={d.clients.description}
        actions={
          <Button size="sm" onClick={() => router.push('/clients/new')}>
            <Plus className="h-4 w-4" />{d.clients.addClient}
          </Button>
        }
      />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder={d.clients.searchPlaceholder} className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-muted-foreground">{d.clients.loading}</p>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={d.clients.empty}
          description={d.clients.emptyHint}
          action={
            <Button size="sm" onClick={() => router.push('/clients/new')}>
              <Plus className="h-4 w-4" />{d.clients.addClient}
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => {
            const primary = client.contacts.find((c) => c.isPrimary) ?? client.contacts[0];
            return (
              <Card
                key={client.id}
                className="cursor-pointer transition-shadow hover:shadow-card"
                onClick={() => api.getClient(token!, client.id).then(setSelected)}
              >
                <CardContent className="p-5">
                  <div className="flex items-start gap-3">
                    <Avatar fallback={client.name.slice(0, 2).toUpperCase()} />
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold truncate">{client.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {client.contacts.length} contact{client.contacts.length !== 1 ? 's' : ''}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                    {primary?.email && <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{primary.email}</p>}
                    {primary?.phone && <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{primary.phone}</p>}
                    <p className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{client._count?.cases ?? 0} cases</p>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
