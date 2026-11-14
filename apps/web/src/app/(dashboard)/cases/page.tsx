'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus, Download, ArrowUpDown, Columns3, ClipboardList, Briefcase, Upload } from 'lucide-react';
import { FirmRole, Role } from '@lawfirm/shared';
import { useAuth } from '@/lib/auth';
import { api, CaseListItem, CaseProgress, CaseTypeItem, UserItem } from '@/lib/api';
import { CaseViewToggle } from '@/components/cases/CaseViewToggle';
import { CaseSummaryBars } from '@/components/cases/CaseSummaryBars';
import { PageHeader } from '@/components/samnuan/PageHeader';
import { CaseStatusBadge } from '@/components/samnuan/CaseStatusBadge';
import { caseStatusOptions, getCaseStatusDisplay } from '@/lib/case-status';
import { caseStageLabel, caseStageOptions } from '@/lib/stage-labels';
import { caseNumberDisplay } from '@/lib/case-number-display';
import { casePartyDisplay } from '@/lib/case-party-display';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { LoadFailed } from '@/components/ui/LoadFailed';
import { formatDate, formatCurrency } from '@/lib/utils';
import { csvCell } from '@/lib/petty-cash-csv';
import { WhoActsTabs } from '@/components/process/WhoActsTabs';
import { FilterChips } from '@/components/process/FilterChips';
import { StepTracker } from '@/components/process/StepTracker';
import { dueLabel } from '@/components/process/helpers';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { SearchHint } from '@/components/guide/SearchHint';
import { Select } from '@/components/ui/select';

const PAGE_SIZE = 10;

/** Columns a lawyer can hide — mostly-empty in practice, so they crowd the table by default. */
const OPTIONAL_COLUMNS = [
  { key: 'customerRef', label: 'เลขอ้างอิงผู้ว่าจ้าง' },
  { key: 'courtNumbers', label: 'หมายเลขคดีดำ / แดง' },
  { key: 'parties', label: 'โจทก์ / จำเลย' },
  { key: 'description', label: 'หมายเหตุ' },
  { key: 'estimatedFee', label: 'รายได้โดยประมาณ' },
  { key: 'updatedAt', label: 'อัปเดตล่าสุด' },
] as const;
type OptionalColumnKey = (typeof OPTIONAL_COLUMNS)[number]['key'];
const HIDDEN_COLUMNS_KEY = 'samnuan.cases.hiddenColumns';

function firstIntakeId(legalCase: CaseListItem) {
  return legalCase.intake?.id ?? legalCase.relatedIntakes?.[0]?.id ?? null;
}

export default function CasesPage() {
  const d = useDashboardT();
  return (
    <Suspense fallback={<PageLoading variant="list" title={d.cases.loading} lines={3} />}>
      <CasesPageContent />
    </Suspense>
  );
}

function CasesPageContent() {
  const d = useDashboardT();
  const { token, user } = useAuth();
  const canManageLegacyIntakes = user?.role === Role.ADMIN || user?.firmRole === FirmRole.OWNER;
  const router = useRouter();
  const searchParams = useSearchParams();
  const sopId = searchParams.get('sop');
  const newCaseHref = sopId ? `/cases/new?sop=${encodeURIComponent(sopId)}` : '/cases/new';
  const caseHref = (id: string) => `/cases/${id}${sopId ? `?tab=tasks&sop=${encodeURIComponent(sopId)}` : ''}`;
  const [progress, setProgress] = useState<CaseProgress[]>([]);
  const [caseTypes, setCaseTypes] = useState<CaseTypeItem[]>([]);
  const [typeFilter, setTypeFilter] = useState('');
  const [phase, setPhase] = useState('ALL');
  const tab = ['TODO', 'WAITING_CLIENT', 'WAITING_COURT', 'CLOSED'].includes(searchParams.get('tab') ?? '') ? searchParams.get('tab')! : 'TODO';
  const [cases, setCases] = useState<CaseListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [statusFilter, setStatusFilter] = useState('');
  const [stageFilter, setStageFilter] = useState(searchParams.get('stage') ?? (searchParams.get('view') === 'intake' ? 'PRE_LITIGATION' : ''));
  const urlStage = searchParams.get('stage');
  useEffect(() => { if (urlStage) setStageFilter(urlStage); }, [urlStage]);
  // Links that filter by stage (intake, operations) only make sense on the table.
  const view = searchParams.get('view') === 'table' || searchParams.get('view') === 'intake' || urlStage ? 'table' : 'queue';
  const [lawyerFilter, setLawyerFilter] = useState('');
  const [page, setPage] = useState(0);
  const [sortAsc, setSortAsc] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [lawyers, setLawyers] = useState<UserItem[]>([]);
  const [bulkLawyerId, setBulkLawyerId] = useState('');
  const [bulkSaving, setBulkSaving] = useState(false);
  const [bulkError, setBulkError] = useState('');
  const [hiddenColumns, setHiddenColumns] = useState<Set<OptionalColumnKey>>(new Set(OPTIONAL_COLUMNS.map(column => column.key)));
  const [unlinkedIntakeCount, setUnlinkedIntakeCount] = useState<number | null>(null);
  const [convertingLegacyIntakes, setConvertingLegacyIntakes] = useState(false);
  const [legacyConversionMessage, setLegacyConversionMessage] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    Promise.all([api.getCaseProgress(token), api.getCases(token, {
        search: search || undefined,
        status: statusFilter || undefined,
        stage: stageFilter || undefined,
        userId: lawyerFilter || undefined,
        caseTypeId: typeFilter || undefined,
      })])
      .then(([progressRows, result]) => {
        setProgress(progressRows);
        setCases(result);
        setSelected(new Set());
      })
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, search, statusFilter, stageFilter, lawyerFilter, typeFilter, reloadKey]);

  useEffect(() => {
    if (!token) return;
    api.getLawyers(token).then(setLawyers).catch(() => {});
    api.getCaseTypes(token).then(setCaseTypes).catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token || !canManageLegacyIntakes) return;
    api.getUnlinkedIntakeCount(token)
      .then(({ count }) => setUnlinkedIntakeCount(count))
      .catch(() => setUnlinkedIntakeCount(null));
  }, [token, canManageLegacyIntakes, reloadKey]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(HIDDEN_COLUMNS_KEY);
      if (saved) setHiddenColumns(new Set(JSON.parse(saved)));
    } catch {
      // Keep the compact register when preferences are unavailable.
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

  const convertLegacyIntakes = async () => {
    if (!token || convertingLegacyIntakes) return;
    setConvertingLegacyIntakes(true);
    setLegacyConversionMessage('');
    try {
      const result = await api.convertUnlinkedIntakes(token);
      setUnlinkedIntakeCount(result.remaining);
      setLegacyConversionMessage(
        result.failed
          ? `เปิดคดีได้ ${result.converted} รายการ · เกิดข้อผิดพลาด ${result.failed} รายการ · ยังไม่มีคดี ${result.remaining} รายการ`
          : `รวมรายการเก่าเป็นคดีก่อนฟ้องแล้ว ${result.converted} รายการ`,
      );
      setReloadKey((k) => k + 1);
    } catch {
      setLegacyConversionMessage('รวมรายการไม่สำเร็จ ลองอีกครั้งได้');
    } finally {
      setConvertingLegacyIntakes(false);
    }
  };

  const exportCsv = () => {
    const escape = csvCell;
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
    const rows = sorted.map((c) => [
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
      ]);
    const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `matters-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const phases: Record<string, string[]> = { PRE: ['INTAKE_REVIEW', 'FACT_GATHERING', 'PRE_LITIGATION'], COURT: ['FILING', 'ANSWER', 'MEDIATION', 'HEARING', 'AWAITING_JUDGMENT', 'APPEAL', 'SUPREME'], ENFORCEMENT: ['ENFORCEMENT', 'CLOSING'] };
  const progressById = new Map(progress.map((row) => [row.caseId, row]));
  const listedRows = cases.flatMap((item) => { const state = progressById.get(item.id); return state ? [{ item, state }] : []; });
  const bucketRows = listedRows.filter(({ state }) => state.bucket === tab);
  const displayed = bucketRows.filter(({ item }) => phase === 'ALL' || phases[phase]?.includes(item.stage ?? ''));
  const tabs = [{ key: 'TODO', label: 'ต้องทำ' }, { key: 'WAITING_CLIENT', label: 'รอลูกความ' }, { key: 'WAITING_COURT', label: 'รอศาล' }, { key: 'CLOSED', label: 'ปิดแล้ว' }].map((item) => ({ ...item, count: listedRows.filter(({ state }) => state.bucket === item.key).length }));
  const chips = [{ key: 'ALL', label: 'ทั้งหมด' }, { key: 'PRE', label: 'ก่อนฟ้อง' }, { key: 'COURT', label: 'ในศาล' }, { key: 'ENFORCEMENT', label: 'บังคับคดี' }].map((item) => ({ ...item, count: bucketRows.filter(({ item: legalCase }) => item.key === 'ALL' || phases[item.key]?.includes(legalCase.stage ?? '')).length }));
  return (
    <div>
      <PageHeader
        title={sopId ? 'เลือกคดีที่จะใช้ชุดงานอัตโนมัติ' : 'เรื่องและคดี'}
        description={sopId ? 'เลือกคดีเพื่อดูรายการงานก่อนยืนยันเพิ่ม ระบบจะจำคดีและชุดงานที่เลือกไว้ให้' : d.cases.description}
        actions={
          <>
            {canCreate && (
              <Button size="sm" onClick={() => router.push(newCaseHref)}>
                <Plus aria-hidden="true" className="h-4 w-4" />{d.cases.newCase}
              </Button>
            )}
          </>
        }
      />

      <CaseViewToggle current={view} />
      {view === 'queue' ? <>
      <WhoActsTabs tabs={tabs} value={tab} onChange={() => { setPhase('ALL'); setPage(0); }} />
      <div className="my-4 flex flex-wrap items-center justify-between gap-3"><FilterChips items={chips} value={phase} onChange={setPhase} /><Input aria-label="ค้นหาคดี" placeholder={d.cases.searchPlaceholder} value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }} className="w-full sm:w-64" /></div>
      {loadError ? <LoadFailed onRetry={() => setReloadKey((k) => k + 1)} /> : loading ? <PageLoading variant="list" title={d.cases.loading} lines={3} /> : displayed.length === 0 ? <EmptyState icon={Briefcase} title={{ TODO: 'ไม่มีคดีที่ต้องทำ', WAITING_CLIENT: 'ไม่มีคดีที่รอลูกความ', WAITING_COURT: 'ไม่มีคดีที่รอศาล', CLOSED: 'ไม่มีคดีที่ปิดแล้ว' }[tab] ?? 'ไม่มีคดี'} description="ลองเปลี่ยนตัวกรองหรือค้นหาอีกครั้ง" /> : <div className="space-y-3">{displayed.map(({ item, state }) => {
        const due = state.next?.dueDate ? dueLabel(state.next.dueDate) : null;
        const steps = Array.from({ length: state.stepTotal }, (_, index) => ({ key: String(index), label: index === state.stepIndex ? state.stepLabel : '', state: (index < state.stepIndex ? 'done' : index === state.stepIndex ? 'current' : 'todo') as 'done' | 'current' | 'todo' }));
        const href = state.next?.kind === 'TASK' && state.next.taskId ? `/cases/${item.id}?task=${encodeURIComponent(state.next.taskId)}` : caseHref(item.id);
        return <article key={item.id} className="relative space-y-3 rounded-lg border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/40"><div className="flex flex-wrap items-center gap-3"><span className="rounded bg-muted px-2 py-1 font-mono text-sm">{item.ownRef}</span><h2 className="font-semibold">{/* The whole card opens the case; the stretched link covers it. */}<Link href={caseHref(item.id)} className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{item.title}</Link></h2></div><div className="flex flex-wrap items-center gap-3">{state.total > 0 && <span className="rounded bg-muted px-2 py-1 text-sm">งานขั้นนี้ {state.done}/{state.total}</span>}<div className="w-56"><StepTracker steps={steps} variant="mini" /></div></div>{state.next && <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3"><p className="text-sm font-medium">▸ ต่อไป: {state.next.text} {due && <span className={`ml-2 rounded px-2 py-1 ${due.urgent ? 'bg-destructive/10 text-destructive' : 'bg-muted'}`}>{due.text}</span>}{state.next.assigneeName && state.next.assigneeName !== `${user?.firstName} ${user?.lastName}` && <span className="ml-2 text-muted-foreground">{state.next.assigneeName}</span>}</p><Link className={`${buttonVariants()} relative z-10`} href={href}>ทำเลย →</Link></div>}</article>;
      })}</div>}
      </> : <>
      {!loading && !loadError && sorted.length > 0 && (
        <div className="mb-4 grid gap-4 md:grid-cols-2">
          <CaseSummaryBars title="คดีแยกตามช่วง" hint="นับจากคดีที่กรองอยู่ในตารางด้านล่าง"
            rows={[...[{ key: 'PRE', label: 'ก่อนฟ้อง' }, { key: 'COURT', label: 'ในศาล' }, { key: 'ENFORCEMENT', label: 'บังคับคดี' }].map(({ key, label }) => ({ label, count: sorted.filter((c) => phases[key].includes(c.stage ?? '')).length })),
              { label: 'ยังไม่ระบุขั้นตอน', count: sorted.filter((c) => !Object.values(phases).flat().includes(c.stage ?? '')).length }].filter((row, index) => index < 3 || row.count > 0)} />
          <CaseSummaryBars title="คดีแยกตามสถานะ" hint="นับจากคดีที่กรองอยู่ในตารางด้านล่าง"
            rows={caseStatusOptions(d.caseStatus).map((opt) => ({ label: opt.label, count: sorted.filter((c) => c.status === opt.value).length })).filter((row) => row.count > 0)} />
        </div>
      )}
      {canManageLegacyIntakes && ((unlinkedIntakeCount ?? 0) > 0 || legacyConversionMessage) && (
        <Card className="mb-4 border-warning/40 bg-warning/5">
          <CardContent className="flex flex-wrap items-center gap-3 p-4">
            <ClipboardList aria-hidden="true" className="h-4 w-4 shrink-0 text-warning" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">
                {unlinkedIntakeCount
                  ? `มีรายการรับเรื่องเก่าที่ยังไม่มีคดี ${unlinkedIntakeCount} รายการ`
                  : 'จัดการรายการรับเรื่องเก่า'}
              </p>
              <p className="text-xs text-muted-foreground">
                รวมเข้าเป็นคดีก่อนฟ้อง โดยเก็บเอกสารและข้อมูลงานเดิมไว้
              </p>
              {legacyConversionMessage && (
                <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                  {legacyConversionMessage}
                </p>
              )}
            </div>
            {(unlinkedIntakeCount ?? 0) > 0 && (
              <Button size="sm" variant="outline" disabled={convertingLegacyIntakes} onClick={convertLegacyIntakes}>
                {convertingLegacyIntakes ? 'กำลังรวมรายการ…' : 'รวมเป็นคดีก่อนฟ้อง'}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="flex flex-wrap items-start gap-3 p-4">
          <div className="flex w-full min-w-0 items-center gap-2 sm:w-auto">
          <Input
            placeholder={d.cases.searchPlaceholder}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            aria-label={d.cases.searchPlaceholder}
            aria-describedby="cases-search-hint"
            className="w-full sm:w-64"
          />
          <SearchHint id="cases-search-hint" className="sm:w-auto">ลองพิมพ์ชื่อลูกความ</SearchHint>
          </div>
          <Select
            aria-label={d.cases.allStatuses}
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}
            className="min-h-11 max-w-full rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">{d.cases.allStatuses}</option>
            {caseStatusOptions(d.caseStatus).map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select
            aria-label="กรองตามขั้นตอนงาน"
            value={stageFilter}
            onChange={(e) => { setStageFilter(e.target.value); setPage(0); }}
            className="min-h-11 max-w-full rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">ทุกขั้นตอน</option>
            {caseStageOptions('th').map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </Select>
          <Select
            aria-label="กรองตามทนาย"
            value={lawyerFilter}
            onChange={(e) => { setLawyerFilter(e.target.value); setPage(0); }}
            className="min-h-11 max-w-full rounded-lg border border-input bg-card px-3 text-sm"
          >
            <option value="">ทุกคน</option>
            {lawyers.map((u) => (
              <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
            ))}
          </Select>
          <Select aria-label="กรองตามประเภทคดี" value={typeFilter} onChange={(event) => { setTypeFilter(event.target.value); setPage(0); }} className="min-h-11 rounded-lg border border-input bg-card px-3 text-sm"><option value="">ทุกประเภทคดี</option>{caseTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</Select>
          <details className="group relative">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-lg border border-input bg-card px-3 text-sm [&::-webkit-details-marker]:hidden">
              <Columns3 aria-hidden="true" className="h-4 w-4" /> คอลัมน์
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
            <Select
              value={bulkLawyerId}
              onChange={(e) => setBulkLawyerId(e.target.value)}
              className="min-h-11 max-w-full rounded-lg border border-input bg-card px-3 text-sm"
            >
              <option value="">เปลี่ยนผู้รับผิดชอบเป็น…</option>
              {lawyers.map((l) => (
                <option key={l.id} value={l.id}>{l.firstName} {l.lastName}</option>
              ))}
            </Select>
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
        <div className="flex items-center justify-between gap-3 border-b px-4 py-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">{stageFilter === 'PRE_LITIGATION' ? 'คดีก่อนฟ้อง' : 'คดีทั้งหมด'}</h2>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">{sorted.length}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" title="ดาวน์โหลดคดีที่กรองไว้เป็นไฟล์ CSV" disabled={sorted.length === 0} onClick={exportCsv}><Download className="h-4 w-4" />{d.common.export}</Button>
            {canCreate && <Button variant="outline" size="sm" title="เพิ่มคดีหลายรายการจากไฟล์ Excel" onClick={() => router.push('/cases/import')}><Upload className="h-4 w-4" />นำเข้าจาก Excel</Button>}
          </div>
        </div>
        <CardContent className="p-0">
          {loadError ? (
            <div className="p-4"><LoadFailed onRetry={() => setReloadKey((k) => k + 1)} /></div>
          ) : loading ? (
            <div className="p-4"><PageLoading variant="list" title={d.cases.loading} lines={3} /></div>
          ) : paginated.length === 0 ? (
            <EmptyState
              icon={Briefcase}
              title={d.cases.empty}
              description={d.cases.emptyHint}
              action={canCreate && <Button onClick={() => router.push(newCaseHref)}>{d.cases.newCase}</Button>}
            />
          ) : (
            <>
              {/* The full case register is too wide for a phone; each case becomes a card there. */}
              {canCreate && (
                <label className="flex min-h-11 cursor-pointer items-center gap-3 border-b px-4 text-sm md:hidden">
                  <Checkbox checked={pageAllSelected} onChange={toggleSelectAllOnPage} />
                  เลือกทุกคดีในหน้านี้
                </label>
              )}
              <ul className="divide-y md:hidden">
                {paginated.map((c) => (
                  <li key={c.id} className="flex items-start">
                    {/* Selecting sits beside the card link, so a tap on the box never opens the case. */}
                    {canCreate && (
                      <label className="flex min-h-11 min-w-11 shrink-0 cursor-pointer items-center justify-center pl-2 pt-2">
                        <Checkbox aria-label={`เลือกคดี ${c.ownRef}`} checked={selected.has(c.id)} onChange={() => toggleSelectOne(c.id)} />
                      </label>
                    )}
                    <div className="min-w-0 flex-1">
                    <Link href={caseHref(c.id)} className={`block space-y-1.5 py-4 pr-4 hover:bg-muted/50 ${canCreate ? 'pl-1' : 'pl-4'}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className="font-mono text-sm font-medium text-primary">{c.ownRef}</span>
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
                      <Link href={`/cases/${c.id}`} className={`inline-flex pb-3 pr-4 text-xs font-medium text-primary hover:underline ${canCreate ? 'pl-1' : 'pl-4'}`}>
                        {d.cases.intakeDetails}
                      </Link>
                    )}
                    </div>
                  </li>
                ))}
              </ul>
              <Table className="max-md:hidden">
                <TableHeader className="sticky top-0 z-[1] bg-card">
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
                        {d.cases.ownRef} <ArrowUpDown aria-hidden="true" className="h-3.5 w-3.5" />
                      </button>
                    </TableHead>
                    <TableHead>{d.cases.caseTitle}</TableHead>
                    <TableHead>{d.home.client}</TableHead>
                    <TableHead>ขั้นตอน</TableHead>
                    <TableHead>{d.billing.status}</TableHead>
                    <TableHead>{d.cases.assignedLawyer}</TableHead>
                    <TableHead>{d.home.court}</TableHead>
                    {!hiddenColumns.has('customerRef') && <TableHead>{d.cases.customerRef}</TableHead>}
                    {!hiddenColumns.has('courtNumbers') && <><TableHead>หมายเลขคดีดำ</TableHead><TableHead>หมายเลขคดีแดง</TableHead></>}
                    {!hiddenColumns.has('parties') && <><TableHead>โจทก์</TableHead><TableHead>จำเลย</TableHead></>}
                    {!hiddenColumns.has('description') && <TableHead>หมายเหตุ</TableHead>}
                    {!hiddenColumns.has('estimatedFee') && <TableHead className="text-right">รายได้โดยประมาณ</TableHead>}
                    {!hiddenColumns.has('updatedAt') && <TableHead>{d.cases.lastUpdated}</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginated.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => router.push(caseHref(c.id))}
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
                      <TableCell className="font-mono font-medium text-primary">
                        <span className="flex flex-col items-start gap-1">
                          <Link href={caseHref(c.id)} onClick={event => event.stopPropagation()} className="inline-flex min-h-11 items-center hover:underline">{c.ownRef}</Link>
                          {firstIntakeId(c) && (
                            <Link
                              href={`/cases/${c.id}`}
                              className="text-xs font-normal text-primary hover:underline"
                              onClick={(event) => event.stopPropagation()}
                            >
                              {d.cases.intakeDetails}
                            </Link>
                          )}
                        </span>
                      </TableCell>
                      <TableCell className="min-w-[200px] max-w-xs font-medium"><Link href={caseHref(c.id)} onClick={event => event.stopPropagation()} className="line-clamp-2 break-words leading-relaxed hover:underline">{c.title}</Link>{(c.blackCaseNumber || c.redCaseNumber) && <p className="text-xs font-normal text-muted-foreground">คดีดำ {caseNumberDisplay(c.blackCaseNumber)} · คดีแดง {caseNumberDisplay(c.redCaseNumber)}</p>}</TableCell>
                      <TableCell className="max-w-[160px] text-muted-foreground">{c.clientName ?? '—'}</TableCell>
                      <TableCell>{c.stage ? <span className={`inline-block whitespace-nowrap rounded-full px-2 py-1 text-xs ${c.stage === 'PRE_LITIGATION' ? 'bg-warning/10 text-warning' : c.stage === 'CLOSING' ? 'bg-muted text-muted-foreground' : 'bg-primary/10 text-primary'}`}>{caseStageLabel(c.stage, 'th')}</span> : '—'}</TableCell>
                      <TableCell><CaseStatusBadge status={c.status} /></TableCell>
                      <TableCell>{c.leadLawyer.firstName} {c.leadLawyer.lastName}</TableCell>
                      <TableCell className="max-w-[180px] text-muted-foreground">{c.courtName ?? '—'}</TableCell>
                      {!hiddenColumns.has('customerRef') && <TableCell className="text-muted-foreground">{c.customerRef ?? '—'}</TableCell>}
                      {!hiddenColumns.has('courtNumbers') && <><TableCell className="whitespace-nowrap text-muted-foreground">{caseNumberDisplay(c.blackCaseNumber)}</TableCell><TableCell className="whitespace-nowrap text-muted-foreground">{caseNumberDisplay(c.redCaseNumber)}</TableCell></>}
                      {!hiddenColumns.has('parties') && <><TableCell className="max-w-[180px] text-muted-foreground">{casePartyDisplay(c.participants ?? [], 'plaintiff')}</TableCell><TableCell className="max-w-[180px] text-muted-foreground">{casePartyDisplay(c.participants ?? [], 'defendant')}</TableCell></>}
                      {!hiddenColumns.has('description') && <TableCell className="max-w-[220px] text-muted-foreground">{c.description ?? '—'}</TableCell>}
                      {!hiddenColumns.has('estimatedFee') && (
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {c.estimatedFee != null ? formatCurrency(c.estimatedFee) : '—'}
                        </TableCell>
                      )}
                      {!hiddenColumns.has('updatedAt') && (
                        <TableCell className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
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
      </>}
    </div>
  );
}
