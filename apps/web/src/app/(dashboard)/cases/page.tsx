'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, ArrowUpDown, Columns3, ClipboardList, Briefcase } from 'lucide-react';
import { Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseItem, IntakeItem, UserItem } from '@/lib/api';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { caseStatusOptions, getCaseStatusDisplay } from '@/lib/case-status';
import { caseStageLabel, caseStageOptions, intakeStageLabel } from '@/lib/stage-labels';
import { caseNumberDisplay } from '@/lib/case-number-display';
import { casePartyDisplay } from '@/lib/case-party-display';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useDashboardT } from '@/components/landing/LocaleProvider';

const PAGE_SIZE = 10;

/** Columns a lawyer can hide — mostly-empty in practice, so they crowd the table by default. */
const OPTIONAL_COLUMNS = [
  { key: 'estimatedFee', label: 'รายได้โดยประมาณ' },
  { key: 'updatedAt', label: 'อัปเดตล่าสุด' },
] as const;
type OptionalColumnKey = (typeof OPTIONAL_COLUMNS)[number]['key'];
const HIDDEN_COLUMNS_KEY = 'samnuan.cases.hiddenColumns';

function firstIntakeId(legalCase: CaseItem) {
  return legalCase.intake?.id ?? legalCase.relatedIntakes?.[0]?.id ?? null;
}

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
  const [intakes, setIntakes] = useState<IntakeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [intakesLoading, setIntakesLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [intakesLoadError, setIntakesLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [intakeOnly, setIntakeOnly] = useState(searchParams.get('view') === 'intake');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [lawyerFilter, setLawyerFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [bulkLawyerId, setBulkLawyerId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<Set<OptionalColumnKey>>(new Set());

  useEffect(() => {
    setIntakeOnly(searchParams.get('view') === 'intake');
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    api
      .getCases(token, {
        search: search || undefined,
        status: statusFilter || undefined,
        stage: stageFilter || undefined,
        userId: lawyerFilter || undefined,
      })
      .then((result) => {
        setCases(result);
        setSelected(new Set());
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, search, statusFilter, stageFilter, lawyerFilter, reloadKey]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setIntakesLoading(true);
    setIntakesLoadError(false);

    void (async () => {
      const pageSize = 100;
      const firstPage = await api.getIntakes(token, { page: 1, limit: pageSize });
      const allItems = [...firstPage.items];
      const pageCount = Math.ceil(firstPage.total / pageSize);
      for (let pageNumber = 2; pageNumber <= pageCount; pageNumber += 1) {
        const nextPage = await api.getIntakes(token, { page: pageNumber, limit: pageSize });
        allItems.push(...nextPage.items);
      }
      if (!cancelled) setIntakes(allItems);
    })()
      .catch(() => {
        if (!cancelled) setIntakesLoadError(true);
      })
      .finally(() => {
        if (!cancelled) setIntakesLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [token, reloadKey]);

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

  const orphanIntakes = useMemo(
    () => intakes.filter((intake) => !intake.case?.id && !intake.relatedCaseId),
    [intakes],
  );
  const intakeCases = useMemo(
    () => cases.filter((legalCase) => !!firstIntakeId(legalCase)),
    [cases],
  );
  const visibleOrphanIntakes = useMemo(() => {
    const term = search.trim().toLocaleLowerCase();
    if (!term) return orphanIntakes;
    return orphanIntakes.filter((intake) =>
      [intake.title, intake.clientName, intake.client?.name, intake.referralName, intake.customerRef]
        .some((value) => value?.toLocaleLowerCase().includes(term)),
    );
  }, [orphanIntakes, search]);

  const sorted = useMemo(() => {
    const queueCases = intakeOnly ? intakeCases : cases;
    return [...queueCases].sort((a, b) => {
      const cmp = a.ownRef.localeCompare(b.ownRef);
      return sortAsc ? cmp : -cmp;
    });
  }, [cases, intakeCases, intakeOnly, sortAsc]);

  const paginated = sorted.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalPages = Math.ceil(sorted.length / PAGE_SIZE);
  const canCreate = user?.role === Role.ADMIN || user?.role === Role.LAWYER;
  const pageAllSelected = paginated.length > 0 && paginated.every((c) => selected.has(c.id));
  const showOrphanIntakes = intakeOnly || (!statusFilter && !stageFilter && !lawyerFilter);
  const includedOrphanIntakes = showOrphanIntakes ? visibleOrphanIntakes : [];

  const changeQueueView = (showIntakes: boolean) => {
    setIntakeOnly(showIntakes);
    setPage(0);
    setSelected(new Set());
    if (showIntakes) {
      setStatusFilter('');
      setStageFilter('');
      setLawyerFilter('');
    }
    const params = new URLSearchParams(searchParams.toString());
    if (showIntakes) params.set('view', 'intake');
    else params.delete('view');
    const query = params.toString();
    router.replace(`/cases${query ? `?${query}` : ''}`, { scroll: false });
  };

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
      'Black Case Number',
      'Red Case Number',
      'ศาล',
      'โจทก์',
      'จำเลย',
      'ชื่อคดี',
      'ลูกความ',
      'หมายเหตุ',
      'เจ้าของคดี',
      'รายได้โดยประมาณ',
      'สถานะ',
      'ขั้นตอน',
    ];
    const rows = [
      ...sorted.map((c) => [
        c.ownRef,
        c.customerRef ?? '',
        c.blackCaseNumber ?? '',
        c.redCaseNumber ?? '',
        c.courtName ?? '',
        casePartyDisplay(c.participants ?? [], 'plaintiff'),
        casePartyDisplay(c.participants ?? [], 'defendant'),
        c.title,
        c.clientName ?? '',
        c.description ?? '',
        `${c.leadLawyer.firstName} ${c.leadLawyer.lastName}`,
        c.estimatedFee != null ? String(c.estimatedFee) : '',
        getCaseStatusDisplay(c.status, d.caseStatus).label,
        c.stage ? caseStageLabel(c.stage, 'th') : '',
      ]),
      ...includedOrphanIntakes.map((intake) => [
        '',
        intake.customerRef ?? '',
        '',
        '',
        '',
        '',
        '',
        intake.title || intake.matterType || '',
        intake.clientName ?? intake.client?.name ?? '',
        intake.description ?? '',
        intake.receivedBy ? `${intake.receivedBy.firstName} ${intake.receivedBy.lastName}` : '',
        intake.estimatedDamage != null ? String(intake.estimatedDamage) : '',
        intake.status,
        intake.stage ? intakeStageLabel(intake.stage, 'th') : '',
      ]),
    ];
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matters-${new Date().toISOString().slice(0, 10)}.csv`;
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
            <Button variant="outline" size="sm" disabled={sorted.length + includedOrphanIntakes.length === 0} onClick={exportCsv}>
              <Download className="h-4 w-4" />
              {d.common.export}
            </Button>
            <Button size="sm" onClick={() => router.push('/intake/new')}>
              <Plus className="h-4 w-4" />{d.cases.newIntake}
            </Button>
            {canCreate && (
              <Button variant="outline" size="sm" onClick={() => router.push('/cases/new')}>
                <Plus className="h-4 w-4" />{d.cases.newCase}
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label={d.cases.queueViewLabel}>
        <Button
          type="button"
          size="sm"
          variant={intakeOnly ? 'outline' : 'default'}
          aria-pressed={!intakeOnly}
          onClick={() => changeQueueView(false)}
        >
          {d.cases.allMatters}<span className="ml-2 rounded-full bg-background/20 px-2 py-0.5 text-xs">{cases.length + includedOrphanIntakes.length}</span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={intakeOnly ? 'default' : 'outline'}
          aria-pressed={intakeOnly}
          onClick={() => changeQueueView(true)}
        >
          {d.cases.intakeOnly}<span className="ml-2 rounded-full bg-background/20 px-2 py-0.5 text-xs">{intakeCases.length + visibleOrphanIntakes.length}</span>
        </Button>
      </div>

      {showOrphanIntakes && (intakeOnly || visibleOrphanIntakes.length > 0 || intakesLoading || intakesLoadError) && (
        <Card className="mb-4">
          <CardContent className="p-0">
            <div className="border-b px-4 py-3">
              <h2 className="flex items-center gap-2 font-semibold">
                {d.cases.intakeWithoutCase}
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal">{visibleOrphanIntakes.length}</span>
              </h2>
            </div>
            {intakesLoadError ? (
              <div className="p-4"><LoadFailed onRetry={() => setReloadKey((key) => key + 1)} /></div>
            ) : intakesLoading ? (
              <div className="p-4"><PageLoading title={d.cases.loading} lines={2} /></div>
            ) : visibleOrphanIntakes.length === 0 ? (
              <p className="px-4 py-5 text-sm text-muted-foreground">{d.cases.noLinkedCases}</p>
            ) : (
              <ul className="divide-y">
                {visibleOrphanIntakes.map((intake) => (
                  <li key={intake.id}>
                    <Link href={`/intake/${intake.id}`} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">
                          {intake.title || intake.matterType || intake.clientName || intake.client?.name || '(ไม่ระบุชื่อ)'}
                        </span>
                        <span className="mt-1 block truncate text-sm text-muted-foreground">
                          {intake.clientName || intake.client?.name || intake.referralName || '—'} · รับเมื่อ {formatDate(intake.receivedDate)}
                        </span>
                      </span>
                      {intake.stage && (
                        <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary">
                          {intakeStageLabel(intake.stage, 'th')}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-3 p-4">
          <Input
            placeholder={d.cases.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            className="max-w-xs"
          />
          {!intakeOnly && (
            <>
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
              <select
                aria-label="กรองตามขั้นตอนงาน"
                value={stageFilter}
                onChange={(e) => { setStageFilter(e.target.value); setPage(0); }}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">ทุกขั้นตอน</option>
                {caseStageOptions('th').map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                aria-label="กรองตามทนาย"
                value={lawyerFilter}
                onChange={(e) => { setLawyerFilter(e.target.value); setPage(0); }}
                className="h-9 rounded-lg border border-input bg-card px-3 text-sm"
              >
                <option value="">ทุกคน</option>
                {lawyers.map((u) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </>
          )}
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
          ) : loading || (intakeOnly && intakesLoading) ? (
            <div className="p-4"><PageLoading title={d.cases.loading} lines={3} /></div>
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={intakeOnly ? ClipboardList : Briefcase}
              title={intakeOnly ? d.cases.noLinkedCases : visibleOrphanIntakes.length ? d.cases.noCasesYet : d.cases.empty}
              description={d.cases.emptyHint}
              action={intakeOnly
                ? <Button onClick={() => router.push('/intake/new')}>{d.cases.newIntake}</Button>
                : canCreate && <Button onClick={() => router.push('/cases/new')}>{d.cases.newCase}</Button>}
            />
          ) : (
            <>
              {/* The full case register is too wide for a phone; each case becomes a card there. */}
              <ul className="divide-y md:hidden">
                {paginated.map((c) => (
                  <li key={c.id}>
                    <Link href={`/cases/${c.id}`} className="block space-y-1.5 p-4 hover:bg-muted/50">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium text-primary">{c.ownRef}</span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <CaseStatusBadge status={c.status} />
                          {c.stage && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{caseStageLabel(c.stage, 'th')}</span>}
                        </span>
                      </div>
                      <p className="font-medium leading-snug">{c.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {c.clientName ?? '—'}
                        {c.courtName ? ` · ${c.courtName}` : ''}
                      </p>
                      {(c.blackCaseNumber || c.redCaseNumber) && (
                        <p className="text-xs text-muted-foreground">
                          คดีดำ {caseNumberDisplay(c.blackCaseNumber)} · คดีแดง {caseNumberDisplay(c.redCaseNumber)}
                        </p>
                      )}
                      {(c.participants?.length ?? 0) > 0 && (
                        <p className="text-xs text-muted-foreground">
                          โจทก์ {casePartyDisplay(c.participants ?? [], 'plaintiff')} · จำเลย {casePartyDisplay(c.participants ?? [], 'defendant')}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {c.leadLawyer.firstName} {c.leadLawyer.lastName}
                        {c.updatedAt ? ` · ${formatDate(c.updatedAt)}` : ''}
                      </p>
                    </Link>
                    {firstIntakeId(c) && (
                      <Link href={`/intake/${firstIntakeId(c)}`} className="inline-flex px-4 pb-3 text-xs font-medium text-primary hover:underline">
                        {d.cases.intakeDetails}
                      </Link>
                    )}
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
                    <TableHead>{d.cases.customerRef}</TableHead>
                    <TableHead>หมายเลขคดีดำ</TableHead>
                    <TableHead>หมายเลขคดีแดง</TableHead>
                    <TableHead>{d.home.court}</TableHead>
                    <TableHead>โจทก์</TableHead>
                    <TableHead>จำเลย</TableHead>
                    <TableHead>{d.cases.caseTitle}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    <TableHead>หมายเหตุ</TableHead>
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
                      <TableCell className="font-medium text-primary">
                        <span className="flex flex-col items-start gap-1">
                          <span>{c.ownRef}</span>
                          {firstIntakeId(c) && (
                            <Link
                              href={`/intake/${firstIntakeId(c)}`}
                              className="text-xs font-normal text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {d.cases.intakeDetails}
                            </Link>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{c.customerRef ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{caseNumberDisplay(c.blackCaseNumber)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">{caseNumberDisplay(c.redCaseNumber)}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={c.courtName ?? undefined}>{c.courtName ?? '—'}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={casePartyDisplay(c.participants ?? [], 'plaintiff')}>{casePartyDisplay(c.participants ?? [], 'plaintiff')}</TableCell>
                      <TableCell className="max-w-[180px] truncate text-muted-foreground" title={casePartyDisplay(c.participants ?? [], 'defendant')}>{casePartyDisplay(c.participants ?? [], 'defendant')}</TableCell>
                      <TableCell className="max-w-[220px] truncate" title={c.title}>{c.title}</TableCell>
                      <TableCell className="max-w-[160px] truncate text-muted-foreground" title={c.clientName ?? undefined}>{c.clientName ?? '—'}</TableCell>
                      <TableCell className="max-w-[220px] truncate text-muted-foreground" title={c.description ?? undefined}>{c.description ?? '—'}</TableCell>
                      <TableCell>{c.leadLawyer.firstName} {c.leadLawyer.lastName}</TableCell>
                      {!hiddenColumns.has('estimatedFee') && (
                        <TableCell className="text-muted-foreground">
                          {c.estimatedFee != null ? formatCurrency(c.estimatedFee) : '—'}
                        </TableCell>
                      )}
                      <TableCell>
                        <span className="flex flex-col items-start gap-1">
                          <CaseStatusBadge status={c.status} />
                          {c.stage && <span className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{caseStageLabel(c.stage, 'th')}</span>}
                        </span>
                      </TableCell>
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
