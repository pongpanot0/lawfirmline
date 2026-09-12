'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, ArrowUpDown, Columns3 } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseItem, UserItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { caseStatusOptions, getCaseStatusDisplay } from '@/lib/case-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDate, formatCurrency } from '@/lib/utils';
import { Briefcase } from 'lucide-react';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const PAGE_SIZE = 10;

/** Columns a lawyer can hide — mostly-empty in practice, so they crowd the table by default. */
const OPTIONAL_COLUMNS = [
  { key: 'customerRef', label: 'เลขอ้างอิงลูกค้า' },
  { key: 'courtName', label: 'ศาล' },
  { key: 'estimatedFee', label: 'รายได้โดยประมาณ' },
  { key: 'updatedAt', label: 'อัปเดตล่าสุด' },
] as const;
type OptionalColumnKey = (typeof OPTIONAL_COLUMNS)[number]['key'];
const HIDDEN_COLUMNS_KEY = 'samnuan.cases.hiddenColumns';

export default function CasesPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<PageLoading title={d.cases.loading} lines={3} />}>
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
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [bulkLawyerId, setBulkLawyerId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<Set<OptionalColumnKey>>(new Set());

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    api
      .getCases(token, { search: search || undefined, status: statusFilter || undefined })
      .then((result) => {
        setCases(result);
        setSelected(new Set());
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, search, statusFilter, reloadKey]);

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(() => {});
  }, [token]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY);
      if (saved) setHiddenColumns(new Set(JSON.parse(saved)));
    } catch {
      // A private-browsing tab or cleared storage just keeps every column shown.
    }
  }, []);

  const toggleColumn = (key: OptionalColumnKey) => {
    setHiddenColumns((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      try {
        localStorage.setItem(HIDDEN_COLUMNS_KEY, JSON.stringify([...next]));
      } catch {
        // Best-effort only — losing the preference is not worth surfacing.
      }
      return next;
    });
  };

  const sorted = useMemo(() => {
    return [...cases].sort((a, b) => {
      const cmp = a.ownRef.localeCompare(b.ownRef);
      return sortAsc ? cmp : -cmp;
    });
  }, [cases, sortAsc]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const canCreate = user?.role === Role.ADMIN || user?.role === Role.LAWYER;
  const pageAllSelected = paginated.length > 0 && paginated.every((c) => selected.has(c.id));

  const toggleSelectAllOnPage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (pageAllSelected) paginated.forEach((c) => next.delete(c.id));
      else paginated.forEach((c) => next.add(c.id));
      return next;
    });
  };

  const toggleSelectOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const bulkReassign = async () => {
    if (!token || !bulkLawyerId || selected.size === 0) return;
    setBulkSaving(true);
    setBulkError('');
    const ids = [...selected];
    const results = await Promise.allSettled(
      ids.map((id) => api.updateCase(token, id, { leadLawyerId: bulkLawyerId })),
    );
    const failed = results.filter((r) => r.status === 'rejected').length;
    setBulkSaving(false);
    setBulkLawyerId('');
    if (failed > 0) {
      setBulkError(`เปลี่ยนผู้รับผิดชอบไม่สำเร็จ ${failed} จาก ${ids.length} คดี ลองใหม่อีกครั้ง`);
    }
    setReloadKey((k) => k + 1);
  };

  const exportCsv = () => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = [
      'Own Ref',
      'Customer Ref',
      'ชื่อคดี',
      'ลูกความ',
      'ศาล',
      'เจ้าของคดี',
      'รายได้โดยประมาณ',
      'สถานะ',
    ];
    const rows = sorted.map((c) => [
      c.ownRef,
      c.customerRef ?? '',
      c.title,
      c.clientName ?? '',
      c.courtName ?? '',
      `${c.leadLawyer.firstName} ${c.leadLawyer.lastName}`,
      c.estimatedFee != null ? String(c.estimatedFee) : '',
      getCaseStatusDisplay(c.status, d.caseStatus).label,
    ]);
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `cases-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader
        title={d.cases.title}
        description={d.cases.description}
        actions={
          <>
            <Button variant="outline" size="sm" disabled={sorted.length === 0} onClick={exportCsv}>
              <Download className="h-4 w-4" />
              {d.common.export}
            </Button>
            {canCreate && (
              <Button size="sm" onClick={() => router.push('/cases/new')}>
                <Plus className="h-4 w-4" />{d.cases.newCase}
              </Button>
            )}
          </>
        }
      />

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-3 p-4">
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
            {caseStatusOptions(d.caseStatus).map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <details className="group relative ml-auto max-md:hidden">
            <summary className="flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm [&::-webkit-details-marker]:hidden">
              <Columns3 className="h-4 w-4" /> คอลัมน์
            </summary>
            <div className="absolute right-0 z-10 mt-1 w-56 rounded-lg border border-input bg-card p-2 text-sm shadow-soft">
              <p className="px-2 pb-1 text-xs text-muted-foreground">ซ่อน/แสดงคอลัมน์</p>
              {OPTIONAL_COLUMNS.map((col) => (
                <label key={col.key} className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted/50">
                  <Checkbox
                    checked={!hiddenColumns.has(col.key)}
                    onChange={() => toggleColumn(col.key)}
                  />
                  {col.label}
                </label>
              ))}
            </div>
          </details>
        </CardContent>
      </Card>

      {canCreate && selected.size > 0 && (
        <Card className="mb-4 border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-3">
            <p className="text-sm font-medium">เลือกไว้ {selected.size} คดี</p>
            <select
              value={bulkLawyerId}
              onChange={(e) => setBulkLawyerId(e.target.value)}
              className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">เปลี่ยนผู้รับผิดชอบเป็น…</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>
              ))}
            </select>
            <Button size="sm" disabled={!bulkLawyerId || bulkSaving} onClick={bulkReassign}>
              {bulkSaving ? 'กำลังบันทึก…' : 'เปลี่ยนผู้รับผิดชอบ'}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
              ล้างการเลือก
            </Button>
            {bulkError && <p className="w-full text-sm text-destructive">{bulkError}</p>}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-4"><LoadFailed onRetry={() => setReloadKey((k) => k + 1)} /></div>
          ) : loading ? (
            <div className="p-4"><PageLoading title={d.cases.loading} lines={3} /></div>
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={d.cases.empty}
              description={d.cases.emptyHint}
              action={canCreate && <Button onClick={() => router.push('/cases/new')}>{d.cases.newCase}</Button>}
            />
          ) : (
            <>
              {/* Nine columns cannot be read on a phone; each case becomes a card there. */}
              <ul className="divide-y md:hidden">
                {paginated.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-primary">{c.ownRef}</span>
                        <CaseStatusBadge status={c.status} />
                      </div>
                      <p className="font-medium leading-snug">{c.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.clientName ?? '—'}
                        {c.courtName ? ` · ${c.courtName}` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {c.leadLawyer.firstName} {c.leadLawyer.lastName}
                        {c.updatedAt ? ` · ${formatDate(c.updatedAt)}` : ''}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              <Table className="max-md:hidden">
                <TableHeader>
                  <TableRow>
                    {canCreate && (
                      <TableHead className="w-8">
                        <Checkbox
                          aria-label="เลือกทุกแถวในหน้านี้"
                          checked={pageAllSelected}
                          onChange={toggleSelectAllOnPage}
                          onClick={(e) => e.stopPropagation()}
                        />
                      </TableHead>
                    )}
                    <TableHead>
                      <button type="button" className="flex items-center gap-1" onClick={() => setSortAsc(!sortAsc)}>
                        {d.cases.ownRef} <ArrowUpDown className="h-3 w-3" />
                      </button>
                    </TableHead>
                    {!hiddenColumns.has('customerRef') && <TableHead>{d.cases.customerRef}</TableHead>}
                    <TableHead>{d.cases.caseTitle}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    {!hiddenColumns.has('courtName') && <TableHead>{d.home.court}</TableHead>}
                    <TableHead>{d.cases.assignedLawyer}</TableHead>
                    {!hiddenColumns.has('estimatedFee') && <TableHead>รายได้โดยประมาณ</TableHead>}
                    <TableHead>{d.billing.status}</TableHead>
                    {!hiddenColumns.has('updatedAt') && <TableHead>{d.cases.lastUpdated}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/cases/${c.id}`)}
                    >
                      {canCreate && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            aria-label={`เลือกคดี ${c.ownRef}`}
                            checked={selected.has(c.id)}
                            onChange={() => toggleSelectOne(c.id)}
                          />
                        </TableCell>
                      )}
                      <TableCell className="font-medium text-primary">{c.ownRef}</TableCell>
                      {!hiddenColumns.has('customerRef') && (
                        <TableCell className="text-muted-foreground">{c.customerRef ?? '—'}</TableCell>
                      )}
                      <TableCell className="max-w-[220px] truncate" title={c.title}>{c.title}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground" title={c.clientName ?? undefined}>{c.clientName ?? '—'}</TableCell>
                      {!hiddenColumns.has('courtName') && (
                        <TableCell className="max-w-[180px] truncate text-muted-foreground" title={c.courtName ?? undefined}>{c.courtName ?? '—'}</TableCell>
                      )}
                      <TableCell>{c.leadLawyer.firstName} {c.leadLawyer.lastName}</TableCell>
                      {!hiddenColumns.has('estimatedFee') && (
                        <TableCell className="text-muted-foreground">
                          {c.estimatedFee != null ? formatCurrency(c.estimatedFee) : '—'}
                        </TableCell>
                      )}
                      <TableCell><CaseStatusBadge status={c.status} /></TableCell>
                      {!hiddenColumns.has('updatedAt') && (
                        <TableCell className="text-muted-foreground text-xs">
                          {c.updatedAt ? formatDate(c.updatedAt) : '—'}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {totalPages > 1 && (
                <div className="flex items-center justify-between border-t px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, sorted.length)} จาก {sorted.length}
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
