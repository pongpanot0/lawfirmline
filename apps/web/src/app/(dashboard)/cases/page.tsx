'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, SlidersHorizontal, ArrowUpDown } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseItem } from '@/lib/api';
import { PageHeader } from '@/components/lexflow/PageHeader';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/ui/misc';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Briefcase } from 'lucide-react';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const PAGE_SIZE = 10;

export default function CasesPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<p className="text-muted-foreground">{d.cases.loading}</p>}>
      <CasesPageContent />
    </Suspense>
  );
}

function CasesPageContent() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getCases(token, { search: search || undefined, status: statusFilter || undefined })
      .then(setCases)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, search, statusFilter]);

  const sorted = useMemo(() => {
    return [...cases].sort((a, b) => {
      const cmp = a.ownRef.localeCompare(b.ownRef);
      return sortAsc ? cmp : -cmp;
    });
  }, [cases, sortAsc]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const canCreate = user?.role === Role.ADMIN || user?.role === Role.LAWYER;

  return (
    <div>
      <PageHeader
        title={d.cases.title}
        description={d.cases.description}
        actions={
          <>
            <Button variant="outline" size="sm"><Download className="h-4 w-4" />{d.common.export}</Button>
            <Button variant="outline" size="sm"><SlidersHorizontal className="h-4 w-4" />{d.common.filter}</Button>
            {canCreate && (
              <Button size="sm" onClick={() => router.push('/cases/new')}>
                <Plus className="h-4 w-4" />{d.cases.newCase}
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap gap-3 p-4">
          <Input
            placeholder={d.cases.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="max-w-xs"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">{d.cases.allStatuses}</option>
            <option value="OPEN">New</option>
            <option value="DRAFTING">Drafting</option>
            <option value="IN_PROGRESS">Filed</option>
            <option value="COURT_DATE">Hearing</option>
            <option value="PENDING">Judgment Pending</option>
            <option value="CLOSED">Closed</option>
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-8 text-center text-muted-foreground">{d.cases.loading}</p>
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={d.cases.empty}
              description={d.cases.emptyHint}
              action={canCreate && <Button onClick={() => router.push('/cases/new')}>{d.cases.newCase}</Button>}
            />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => setSortAsc(!sortAsc)}>
                        {d.cases.ownRef} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    <TableHead>{d.cases.customerRef}</TableHead>
                    <TableHead>{d.cases.caseTitle}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    <TableHead>{d.home.court}</TableHead>
                    <TableHead>{d.cases.assignedLawyer}</TableHead>
                    <TableHead>รายได้โดยประมาณ</TableHead>
                    <TableHead>{d.billing.status}</TableHead>
                    <TableHead>{d.cases.lastUpdated}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/cases/${c.id}`)}
                    >
                      <TableCell className="font-medium text-primary">{c.ownRef}</TableCell>
                      <TableCell className="text-muted-foreground">{c.customerRef ?? '—'}</TableCell>
                      <TableCell>{c.title}</TableCell>
                      <TableCell className="text-muted-foreground">{c.clientName ?? '—'}</TableCell>
                      <TableCell className="text-muted-foreground">{c.courtName ?? '—'}</TableCell>
                      <TableCell>{c.leadLawyer.firstName} {c.leadLawyer.lastName}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {c.estimatedFee != null ? formatCurrency(c.estimatedFee) : '—'}
                      </TableCell>
                      <TableCell><CaseStatusBadge status={c.status} /></TableCell>
                      <TableCell className="text-muted-foreground text-xs">—</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} of {sorted.length}
                  </p>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>{d.common.previous}</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>{d.common.next}</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
