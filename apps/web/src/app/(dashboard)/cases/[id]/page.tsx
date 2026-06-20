'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  Gavel,
  FileText,
  Upload,
  CalendarDays,
  Plus,
  StickyNote,
  CheckSquare,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, CaseDetail, TaskItem } from '@/lib/api';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';

const TIMELINE = [
  { label: 'Case Opened', date: 'Opened', type: 'case' },
  { label: 'Complaint Filed', date: 'Pending', type: 'document' },
  { label: 'Hearing Scheduled', date: 'Upcoming', type: 'hearing' },
];

export default function CaseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { token } = useAuth();
  const router = useRouter();
  const [legalCase, setCase] = useState<CaseDetail | null>(null);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [totalSpent, setTotalSpent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!token || !id) return;
    Promise.all([
      api.getCase(token, id),
      api.getTasks(token, id).catch(() => []),
      api.getExpenseSummary(token, id).catch(() => ({ totalSpent: 0 })),
    ])
      .then(([c, t, summary]) => {
        setCase(c);
        setTasks(t);
        setTotalSpent(summary.totalSpent);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [token, id]);

  if (loading) return <Skeleton className="h-96 w-full" />;
  if (!legalCase) return <p className="text-destructive">Case not found</p>;

  const customFields = legalCase.customFields as Record<string, string> | null;
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'tasks', label: 'Tasks', href: `/cases/${id}/tasks` },
    { id: 'calendar', label: 'Calendar', href: `/cases/${id}/calendar` },
    { id: 'documents', label: 'Documents', href: `/cases/${id}/documents` },
    { id: 'billing', label: 'Billing', href: `/cases/${id}/billing` },
  ];

  return (
    <div>
      <div className="mb-6">
        <button type="button" onClick={() => router.push('/cases')} className="text-sm text-primary hover:underline">
          ← Back to Cases
        </button>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">{legalCase.title}</h1>
          <CaseStatusBadge status={legalCase.status} />
        </div>
        <p className="mt-1 text-sm text-muted-foreground">{legalCase.caseNumber} · {legalCase.folderId}</p>
      </div>

      <div className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((t) => (
          t.href ? (
            <Link
              key={t.id}
              href={t.href}
              className="whitespace-nowrap px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {t.label}
            </Link>
          ) : (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground'
              }`}
            >
              {t.label}
            </button>
          )
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* LEFT PANEL */}
        <div className="lg:col-span-3 space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-sm">Case Overview</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Case Number</p>
                <p className="font-medium">{legalCase.caseNumber}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Case Type</p>
                <p className="font-medium">{legalCase.caseType?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Court</p>
                <p className="font-medium">{legalCase.courtName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Client</p>
                <p className="font-medium">{legalCase.clientName ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Opponent</p>
                <p className="font-medium text-muted-foreground">—</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Assigned Lawyer</p>
                <p className="font-medium">{legalCase.leadLawyer.firstName} {legalCase.leadLawyer.lastName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Approved Expenses</p>
                <p className="font-medium text-primary">{formatCurrency(totalSpent)}</p>
              </div>
              {customFields && Object.entries(customFields).map(([k, v]) => (
                <div key={k}>
                  <p className="text-xs text-muted-foreground">{k}</p>
                  <p className="font-medium">{v}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* CENTER PANEL */}
        <div className="lg:col-span-5 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Case Timeline</CardTitle>
              <Button variant="outline" size="sm"><Plus className="h-3 w-3" />Add Activity</Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Gavel className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium">Case Opened</p>
                    <p className="text-xs text-muted-foreground">{formatDate(legalCase.openedAt)}</p>
                  </div>
                </div>
                {legalCase.calendarEvents.map((e) => (
                  <div key={e.id} className="flex gap-3">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 dark:bg-orange-950">
                      <CalendarDays className="h-4 w-4 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTime(e.startAt)} — {e.type}</p>
                    </div>
                  </div>
                ))}
                {TIMELINE.slice(1).map((t, i) => (
                  <div key={i} className="flex gap-3 opacity-60">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{t.label}</p>
                      <p className="text-xs text-muted-foreground">{t.date}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {legalCase.description && (
            <Card>
              <CardHeader><CardTitle className="text-sm">Description</CardTitle></CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{legalCase.description}</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* RIGHT PANEL */}
        <div className="lg:col-span-4 space-y-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm">Upcoming Tasks</CardTitle>
              <Link href={`/cases/${id}/tasks`} className="text-xs text-primary hover:underline">View all</Link>
            </CardHeader>
            <CardContent className="space-y-2">
              {tasks.slice(0, 4).map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
                  <CheckSquare className="h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.title}</span>
                  <span className="text-xs text-muted-foreground">{t.status}</span>
                </div>
              ))}
              {tasks.length === 0 && (
                <p className="text-sm text-muted-foreground">No tasks assigned</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Calendar</CardTitle></CardHeader>
            <CardContent>
              {legalCase.calendarEvents.length > 0 ? (
                legalCase.calendarEvents.slice(0, 3).map((e) => (
                  <div key={e.id} className="mb-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <p className="font-medium">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(e.startAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No upcoming events</p>
              )}
              <Button variant="outline" size="sm" className="mt-2 w-full" onClick={() => router.push(`/cases/${id}/calendar`)}>
                <CalendarDays className="h-4 w-4" />Open Calendar
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm">Quick Notes</CardTitle></CardHeader>
            <CardContent>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a quick note..."
                rows={3}
                className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
              <Button size="sm" className="mt-2" variant="secondary">
                <StickyNote className="h-4 w-4" />Save Note
              </Button>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/documents`)}>
              <Upload className="h-4 w-4" />Documents
            </Button>
            <Button size="sm" variant="outline" className="flex-1" onClick={() => router.push(`/cases/${id}/billing`)}>
              <FileText className="h-4 w-4" />Billing
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
