'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { useDashboardT } from '@/components/landing/LocaleProvider';
import { api, KnowledgeItem, CaseItem } from '@/lib/api';
import { formatDate } from '@/lib/utils';

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
  const [filters, setFilters] = useState({ caseId: '', category: '', search: '' });
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    api.getCases(token).then(setCases).catch(console.error);
  }, [token]);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    api
      .getKnowledge(token, {
        caseId: filters.caseId || undefined,
        category: filters.category || undefined,
        search: filters.search || undefined,
      })
      .then(setItems)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, filters]);

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-slate-900">{d.knowledge.title}</h1>
      <p className="mb-6 text-sm text-slate-500">{d.knowledge.description}</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder={d.knowledge.searchPlaceholder}
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.caseId}
          onChange={(e) => setFilters({ ...filters, caseId: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">{d.knowledge.allCases}</option>
          {cases.map((c) => (
            <option key={c.id} value={c.id}>{c.ownRef} — {c.title}</option>
          ))}
        </select>
        <select
          value={filters.category}
          onChange={(e) => setFilters({ ...filters, category: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c ? CATEGORY_LABELS[c] : '{d.knowledge.allCategories}'}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">{d.knowledge.loading}</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">{d.knowledge.empty}</p>
          <p className="mt-1 text-xs text-slate-400">{d.knowledge.emptyHint}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    <Link href={`/cases/${item.case.id}#case-analyses`} className="text-brand-600 hover:underline">
                      {item.case.ownRef}
                    </Link>
                    {' — '}{item.createdBy.firstName} {item.createdBy.lastName}
                    {' — '}{formatDate(item.createdAt)}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {CATEGORY_LABELS[item.category] ?? item.category}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="text-sm text-brand-600 hover:underline"
                >
                  {expanded === item.id ? '{d.knowledge.collapse}' : '{d.knowledge.expand}'}
                </button>
              </div>
              <p className={`mt-3 text-sm text-slate-600 whitespace-pre-wrap ${expanded === item.id ? '' : 'line-clamp-3'}`}>
                {item.summary}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
