'use client';

import { isUnusableAnalysis } from '@lawfirm/shared';

import { useEffect, useState } from 'react';
import { LoadFailed } from '@/components/ui/LoadFailed';
import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, KnowledgeItem, CaseItem } from '@/lib/api';
import { formatDate } from '@/lib/utils';
import { EmptyState, PageLoading } from '@/components/ui/misc';
import { PageHeader } from '@/components/samnuan/PageHeader';

const CATEGORIES = ['', 'SUMMARY', 'CONTRACT', 'COURT_ORDER', 'CORRESPONDENCE', 'OTHER'];

const CATEGORY_LABELS: Record<string, string> = {
  SUMMARY: 'สรุปคดี',
  CONTRACT: 'สัญญา',
  COURT_ORDER: 'คำสั่งศาล',
  CORRESPONDENCE: 'หนังสือโต้ตอบ',
  OTHER: 'อื่นๆ',
};

export default function KnowledgePage() {
  const d = useDashboardT();
  const { token } = useAuth();
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [filters, setFilters] = useState({ caseId: '', category: '', search: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError(false);
    api
      .getKnowledge(token, {
        caseId: filters.caseId || undefined,
        category: filters.category || undefined,
        search: filters.search || undefined,
      })
      .then(setItems)
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
  }, [token, filters, reloadKey]);

  return (
    <div>
      <PageHeader title={d.knowledge.title} description={d.knowledge.description} />

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder={d.knowledge.searchPlaceholder}
          aria-label={d.knowledge.searchPlaceholder}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="min-w-0 max-w-full flex-1 rounded-lg border border-input bg-card px-3 py-2 text-sm"
        />
        <select
          value={filters.caseId}
          aria-label={d.knowledge.allCases}
          onChange={(e) => setFilters({ ...filters, caseId: e.target.value })}
          className="min-w-0 max-w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          <option value="">{d.knowledge.allCases}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>{c.ownRef} — {c.title}</option>
          ))}
        </select>
        <select
          value={filters.category}
          aria-label={d.knowledge.allCategories}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          className="min-w-0 max-w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c ? CATEGORY_LABELS[c] : d.knowledge.allCategories}</option>
          ))}
        </select>
      </div>

      {loadError ? (
        <LoadFailed onRetry={() => setReloadKey((k) => k + 1)} />
      ) : loading ? (
        <PageLoading title={d.knowledge.loading} lines={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={BookOpen} title={d.knowledge.empty} description={d.knowledge.emptyHint} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    <Link href={`/cases/${item.case.id}#case-analyses`} className="text-brand-600 hover:underline">
                      {item.case.ownRef}
                    </Link>
                    {' — '}{item.createdBy.firstName} {item.createdBy.lastName}
                    {' — '}{formatDate(item.createdAt)}
                  </p>
                  <span className="mt-2 inline-block rounded-sm bg-muted px-2 py-1 text-xs text-muted-foreground">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  aria-expanded={expanded === item.id}
                  className="min-h-11 shrink-0 px-2 text-sm text-primary hover:underline"
                >
                  {expanded === item.id ? d.knowledge.collapse : d.knowledge.expand}
                </button>
              </div>
              <p className={`mt-4 max-w-prose whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground ${expanded === item.id ? '' : 'line-clamp-3'}`}>
                {isUnusableAnalysis(item.summary) ? 'อ่านเอกสารไม่สำเร็จ — ผลเดิมไม่ใช่สรุปที่พร้อมใช้งาน กรุณาวิเคราะห์เอกสารใหม่' : item.summary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
