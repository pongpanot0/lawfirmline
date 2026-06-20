'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Search, Mail, Phone, Building2, Briefcase } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CaseItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Avatar } from '@/components/ui/avatar';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { EmptyState } from '@/components/ui/misc';

interface ClientProfile {
  name: string;
  email: string;
  phone: string;
  company: string;
  cases: CaseItem[];
}

export default function ClientsPage() {
  const { token } = useAuth();
  const router = useRouter();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<ClientProfile | null>(null);
  const [tab, setTab] = useState('information');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  const clients = useMemo(() => {
    const map = new Map<string, ClientProfile>();
    for (const c of cases) {
      const name = c.clientName?.trim();
      if (!name) continue;
      const existing = map.get(name) ?? {
        name,
        email: `${name.toLowerCase().replace(/\s+/g, '.')}@client.com`,
        phone: '02-xxx-xxxx',
        company: name.includes('Corp') || name.includes('Ltd') ? name : 'Individual',
        cases: [],
      };
      existing.cases.push(c);
      map.set(name, existing);
    }
    return Array.from(map.values()).filter((c) =>
      !search || c.name.toLowerCase().includes(search.toLowerCase()),
    );
  }, [cases, search]);

  if (selected) {
    return (
      <div>
        <button type="button" onClick={() => setSelected(null)} className="mb-4 text-sm text-primary hover:underline">
          ← All Clients
        </button>
        <div className="mb-6 flex items-center gap-4">
          <Avatar fallback={selected.name.slice(0, 2).toUpperCase()} className="h-14 w-14 text-base" />
          <div>
            <h1 className="text-2xl font-bold">{selected.name}</h1>
            <p className="text-sm text-muted-foreground">{selected.company} · {selected.cases.length} active cases</p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="information">Information</TabsTrigger>
            <TabsTrigger value="cases">Cases</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
          </TabsList>

          <TabsContent value="information">
            <Card>
              <CardContent className="grid gap-4 p-6 sm:grid-cols-2">
                <div className="flex items-center gap-3">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Email</p><p className="text-sm">{selected.email}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Phone</p><p className="text-sm">{selected.phone}</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <div><p className="text-xs text-muted-foreground">Company</p><p className="text-sm">{selected.company}</p></div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="cases">
            <div className="space-y-2">
              {selected.cases.map((c) => (
                <Card key={c.id} className="cursor-pointer hover:bg-accent/50" onClick={() => router.push(`/cases/${c.id}`)}>
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="font-medium">{c.title}</p>
                      <p className="text-xs text-muted-foreground">{c.caseNumber}</p>
                    </div>
                    <CaseStatusBadge status={c.status} />
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          <TabsContent value="documents">
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Client documents aggregated from linked cases</CardContent></Card>
          </TabsContent>

          <TabsContent value="billing">
            <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Invoices and billing history for this client</CardContent></Card>
          </TabsContent>
        </Tabs>
      </div>
    );
  }

  return (
    <div>
      <PageHeader title="Clients" description="CRM-style client management" />
      <div className="mb-4 relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search clients..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {loading ? (
        <p className="text-muted-foreground">Loading clients...</p>
      ) : clients.length === 0 ? (
        <EmptyState icon={Briefcase} title="No clients yet" description="Clients are created when you add cases" />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((client) => (
            <Card
              key={client.name}
              className="cursor-pointer transition-shadow hover:shadow-card"
              onClick={() => setSelected(client)}
            >
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <Avatar fallback={client.name.slice(0, 2).toUpperCase()} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{client.name}</p>
                    <p className="text-xs text-muted-foreground">{client.company}</p>
                  </div>
                </div>
                <div className="mt-4 space-y-1 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1"><Mail className="h-3 w-3" />{client.email}</p>
                  <p className="flex items-center gap-1"><Phone className="h-3 w-3" />{client.phone}</p>
                  <p className="flex items-center gap-1"><Briefcase className="h-3 w-3" />{client.cases.length} active cases</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
