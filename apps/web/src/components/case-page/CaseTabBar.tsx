'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { LayoutDashboard, ListChecks, Files, CalendarDays, Users, Wallet, Mail, MessageSquare, Ship, FileText } from 'lucide-react';
import type { CaseTabId } from '@/lib/case-tabs';

export function CaseTabBar({ caseId, active, tasks, overdue, documents, events, parties, comments, cargo, closing }: { caseId: string; active: CaseTabId; tasks: number; overdue: number; documents: number; events: number; parties: number; comments: number | null; cargo: boolean; closing: boolean }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active]);
  const tabs = [
    { id: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
    { id: 'tasks', label: 'งาน', icon: ListChecks, count: `${tasks}${overdue ? ` · เลยกำหนด ${overdue}` : ''}` },
    { id: 'documents', label: 'เอกสาร', icon: Files, count: String(documents) },
    { id: 'calendar', label: 'นัดและปฏิทิน', icon: CalendarDays, count: String(events) },
    { id: 'parties', label: 'คู่ความ', icon: Users, count: String(parties) },
    { id: 'billing', label: 'การเงิน', icon: Wallet },
    { id: 'email', label: 'อีเมล', icon: Mail },
    { id: 'comments', label: 'ข้อความ', icon: MessageSquare, count: comments == null ? undefined : String(comments) },
    ...(cargo ? [{ id: 'cargo-claim', label: 'Cargo Claim', icon: Ship }] : []),
    ...(closing ? [{ id: 'closing-report', label: 'รายงานปิดงาน', icon: FileText }] : []),
  ] as const;
  return <nav aria-label="ส่วนต่าง ๆ ของคดี" className="min-w-0 overflow-x-auto rounded-lg border bg-card p-1 shadow-md"><div className="flex min-w-full w-max">{tabs.map(({ id, label, icon: Icon, ...rest }) => <Link key={id} id={`case-tab-${id}`} ref={active === id ? activeRef : undefined} href={`/cases/${caseId}?tab=${id}`} aria-current={active === id ? 'page' : undefined} className={`flex min-h-16 w-[108px] flex-1 flex-col items-center justify-center gap-1 rounded-md px-2 py-2 text-center text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === id ? 'bg-primary font-semibold text-primary-foreground' : 'text-foreground hover:bg-accent'}`}><span className="flex items-center gap-1"><Icon aria-hidden="true" className="h-4 w-4 shrink-0" />{label}</span>{'count' in rest && rest.count !== undefined && <span className={`text-xs ${id === 'tasks' && overdue ? active === id ? 'rounded bg-destructive px-1 text-destructive-foreground' : 'text-destructive' : ''}`}>{rest.count}</span>}</Link>)}</div></nav>;
}
