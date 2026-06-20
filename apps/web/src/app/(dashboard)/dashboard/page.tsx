'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Briefcase,
  Activity,
  CalendarDays,
  Banknote,
  Plus,
  Gavel,
  Upload,
  UserPlus,
  FileText,
  CheckCircle2,
} from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, DashboardStats } from '@/lib/api';
import { PageHeader, KpiCard, QuickActionButton } from '@/components/lexflow/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CaseStatusBadge } from '@/components/lexflow/CaseStatusBadge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatDateTime, formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/misc';

const ACTIVITIES = [
  { type: 'case', label: 'New Case Created', time: '2 hours ago' },
  { type: 'hearing', label: 'Court Hearing Added', time: '5 hours ago' },
  { type: 'document', label: 'Document Uploaded', time: 'Yesterday' },
  { type: 'payment', label: 'Payment Received', time: '2 days ago' },
];

export default function DashboardPage() {
  const { token, user } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    api.getDashboardStats(token).then(setData).catch(console.error).finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-28" />)}
        </div>
      </div>
    );
  }

  if (!data || !user) return null;

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description={`Welcome back, ${user.firstName}. Here's your firm overview.`}
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Cases" value={data.stats.totalCases} icon={Briefcase} change="+2 this month" trend="up" />
        <KpiCard label="Active Cases" value={data.stats.openCases} icon={Activity} change="In progress" trend="neutral" />
        <KpiCard label="Upcoming Hearings" value={data.stats.upcomingEvents} icon={CalendarDays} change="Next 30 days" trend="neutral" />
        <KpiCard label="Monthly Revenue" value={formatCurrency(125000)} icon={Banknote} change="+12% vs last month" trend="up" />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-6">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Upcoming Court Appointments</CardTitle>
              <Link href="/court-schedule" className="text-sm text-primary hover:underline">View all</Link>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Case Number</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Court</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.upcomingHearings.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="font-medium">{formatDate(e.startAt)}</TableCell>
                      <TableCell>
                        <Link href={`/cases`} className="text-primary hover:underline">{e.case.caseNumber}</Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{e.case.title}</TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell><CaseStatusBadge status="COURT_DATE" /></TableCell>
                    </TableRow>
                  ))}
                  {data.upcomingHearings.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No upcoming court appointments
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Recent Activities</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative space-y-0">
                {[...data.recentCases.slice(0, 2).map((c) => ({
                  icon: Briefcase,
                  label: `Case updated: ${c.caseNumber}`,
                  time: 'Recently',
                })), ...ACTIVITIES.slice(0, 2).map((a) => ({
                  icon: FileText,
                  label: a.label,
                  time: a.time,
                }))].map((item, i) => {
                  const Icon = item.icon;
                  return (
                    <div key={i} className="flex gap-4 pb-6 last:pb-0">
                      <div className="relative flex flex-col items-center">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                          <Icon className="h-4 w-4 text-primary" />
                        </div>
                        {i < 3 && <div className="absolute top-8 h-full w-px bg-border" />}
                      </div>
                      <div className="pt-1">
                        <p className="text-sm font-medium">{item.label}</p>
                        <p className="text-xs text-muted-foreground">{item.time}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <QuickActionButton label="New Case" icon={Plus} onClick={() => router.push('/cases/new')} />
              <QuickActionButton label="Add Hearing" icon={Gavel} onClick={() => router.push('/court-schedule')} />
              <QuickActionButton label="Upload Document" icon={Upload} onClick={() => router.push('/documents')} />
              <QuickActionButton label="Add Client" icon={UserPlus} onClick={() => router.push('/clients')} />
            </CardContent>
          </Card>

          {data.pendingReimbursements.length > 0 && (
            <Card>
              <CardHeader className="flex-row items-center justify-between">
                <CardTitle>Pending Expenses</CardTitle>
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-xs font-medium text-warning">
                  {data.pendingReimbursements.length}
                </span>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.pendingReimbursements.slice(0, 3).map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-sm">
                    <div>
                      <p className="font-medium truncate max-w-[140px]">{e.description}</p>
                      <p className="text-xs text-muted-foreground">{e.case?.caseNumber ?? 'General'}</p>
                    </div>
                    <p className="font-semibold">{formatCurrency(e.amount)}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Tasks Due</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                <span>{data.stats.overdueTasks} overdue tasks</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span>{data.stats.myTasks} assigned to you</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
