'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { api, KnowledgeItem, CaseItem } from '@/lib/api';

const CATEGORIES = ['', 'SUMMARY', 'CONTRACT', 'COURT_ORDER', 'CORRESPONDENCE', 'OTHER'];

export default function KnowledgePage() {
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
      <h1 className="mb-2 text-2xl font-bold text-slate-900">Case Knowledge Base</h1>
      <p className="mb-6 text-sm text-slate-500">AI-generated summaries and document insights</p>

      <div className="mb-6 flex flex-wrap gap-3">
        <input
          type="text"
          placeholder="Search summaries..."
          value={filters.search}
          onChange={(e) => setFilters({ ...filters, search: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <select
          value={filters.caseId}
          onChange={(e) => setFilters({ ...filters, caseId: e.target.value })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="">All Cases</option>
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
            <option key={c} value={c}>{c || 'All Categories'}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading...</p>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-12 text-center">
          <p className="text-slate-500">No knowledge entries yet</p>
          <p className="mt-1 text-xs text-slate-400">Upload documents in a case and run AI analysis</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <div key={item.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-semibold">{item.title}</h3>
                  <p className="mt-1 text-xs text-slate-400">
                    <Link href={`/cases/${item.case.id}`} className="text-brand-600 hover:underline">
                      {item.case.ownRef}
                    </Link>
                    {' — '}{item.createdBy.firstName} {item.createdBy.lastName}
                    {' — '}{new Date(item.createdAt).toLocaleDateString()}
                  </p>
                  <span className="mt-2 inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {item.category}
                  </span>
                </div>
                <button
                  onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                  className="text-sm text-brand-600 hover:underline"
                >
                  {expanded === item.id ? 'Collapse' : 'Expand'}
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
