'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';
import { LayoutDashboard, ListChecks, FolderOpen, CalendarDays, Users, Wallet, Mail, MessageSquare, Ship, FileText } from 'lucide-react';
import type { CaseTabId } from '@/lib/case-tabs';

export function CaseTabBar({ caseId, active, tasks, overdue, documents, events, parties, comments, cargo, closing }: { caseId: string; active: CaseTabId; tasks: number; overdue: number; documents: number; events: number; parties: number; comments: number | null; cargo: boolean; closing: boolean }) {
  const activeRef = useRef<HTMLAnchorElement>(null);
  useEffect(() => { activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }, [active]);
  const tabs = [
    { id: 'overview', label: 'ภาพรวม', icon: LayoutDashboard },
    { id: 'tasks', label: 'งาน', icon: ListChecks, count: `${tasks}${overdue ? ` · เลยกำหนด ${overdue}` : ''}` },
    { id: 'documents', label: 'เอกสาร', icon: FolderOpen, count: String(documents) },
    { id: 'calendar', label: 'นัดและปฏิทิน', icon: CalendarDays, count: String(events) },
    { id: 'parties', label: 'คู่ความ', icon: Users, count: String(parties) },
    { id: 'billing', label: 'การเงิน', icon: Wallet },
    { id: 'email', label: 'อีเมล', icon: Mail },
    { id: 'comments', label: 'ข้อความ', icon: MessageSquare, count: comments == null ? undefined : String(comments) },
    ...(cargo ? [{ id: 'cargo-claim', label: 'Cargo Claim', icon: Ship }] : []),
    ...(closing ? [{ id: 'closing-report', label: 'รายงานปิดงาน', icon: FileText }] : []),
  ] as const;
  return <nav aria-label="ส่วนต่าง ๆ ของคดี" style={{ '--tab-cols': tabs.length } as React.CSSProperties} className="sticky top-0 z-10 grid gap-1 md:[grid-template-columns:repeat(var(--tab-cols),minmax(0,1fr))] overflow-x-auto rounded-xl border border-border bg-white p-1.5 shadow-[0_4px_16px_rgba(20,46,67,.07)] max-md:grid-flow-col max-md:auto-cols-[minmax(108px,1fr)]">{tabs.map(({ id, label, icon: Icon, ...rest }) => <Link key={id} id={`case-tab-${id}`} ref={active === id ? activeRef : undefined} href={`/cases/${caseId}?tab=${id}`} aria-current={active === id ? 'page' : undefined} className={`flex min-h-11 flex-col items-center justify-center rounded-lg px-2 py-2.5 text-center font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${active === id ? 'bg-[#142e43] text-white shadow' : 'text-[#142e43] hover:bg-[#f3f1ea]'}`}><span className="text-lg leading-none"><Icon aria-hidden="true" className="inline-block h-[1.1em] w-[1.1em] align-[-.18em]" strokeWidth={2} /></span><span className="mt-1 whitespace-nowrap text-[15px]">{label}</span>{'count' in rest && rest.count !== undefined && <span className={`mt-0.5 block text-xs ${id === 'tasks' && overdue ? 'font-bold text-[#a83232]' : active === id ? 'text-[#dbe4ec]' : 'text-[#52616b]'}`}>{rest.count}</span>}</Link>)}</nav>;
}
