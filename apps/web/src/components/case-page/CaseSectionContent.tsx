'use client';
import dynamic from 'next/dynamic';
import { useState } from 'react';
import { Lock, MessageSquare, Sparkles, Workflow } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CargoClaimPanel } from '@/components/cargo/CargoClaimPanel';
import type { CaseDetail, TaskItem } from '@/lib/api';
import v2 from '@/components/case-page/v2.module.css';
import type { CaseTabId } from '@/lib/case-tabs';
const CaseWorkflows = dynamic(() => import('@/components/workflows/CaseWorkflows').then((m) => m.CaseWorkflows), { ssr: false });
const CaseTasksPanel = dynamic(() => import('@/components/cases/CaseTasksPanel').then((m) => m.CaseTasksPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseCalendarPanel = dynamic(() => import('@/components/cases/CaseCalendarPanel').then((m) => m.CaseCalendarPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseDocumentsPanel = dynamic(() => import('@/components/cases/CaseDocumentsPanel').then((m) => m.CaseDocumentsPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseBillingPanel = dynamic(() => import('@/components/cases/CaseBillingPanel').then((m) => m.CaseBillingPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseAskAiPanel = dynamic(() => import('@/components/cases/CaseAskAiPanel'), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseMessagesPanel = dynamic(() => import('@/components/cases/CaseMessagesPanel').then((m) => m.CaseMessagesPanel), { ssr: false });
const CaseCommentsPanel = dynamic(() => import('@/components/cases/CaseCommentsPanel').then((m) => m.CaseCommentsPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseEmailPanel = dynamic(() => import('@/components/cases/CaseEmailPanel').then((m) => m.CaseEmailPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseClosingReportPanel = dynamic(() => import('@/components/cases/CaseClosingReportPanel').then((m) => m.CaseClosingReportPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });

function useChannel() { return useState<'team' | 'client'>('team'); }

export function CaseSectionContent({ tab, caseId, legalCase, thread, showAiAnalysis, setShowAiAnalysis, onChanged, onTasksChanged, onOpenSuggestions }: { tab: CaseTabId; caseId: string; legalCase: CaseDetail; thread: string | null; showAiAnalysis: boolean; setShowAiAnalysis: (value: boolean) => void; onChanged: () => void; onTasksChanged: (tasks: TaskItem[]) => void; onOpenSuggestions: () => void }) {
  const [channel, setChannel] = useChannel();
  return <>
      {tab === 'tasks' && (
        <div
          role="tabpanel"
          id="case-tabpanel-tasks"
          aria-labelledby="case-tab-tasks"
          className="min-w-0"
        >
          <CaseTasksPanel caseId={caseId} onTasksChanged={onTasksChanged} />
          <section className={`${v2.card} mt-5 p-5 shadow-[0_4px_16px_rgba(20,46,67,.06)]`}><h3 className="flex items-center gap-2 text-lg font-bold"><Workflow aria-hidden="true" className="h-5 w-5" />สายงานส่งต่อ</h3><p className={v2.hint}>งานที่ต้องส่งต่อเป็นทอด เช่น แปล → ทำใบเบิกความ → เขียนคำฟ้อง ระบบส่งงานให้คนถัดไปเมื่อทอดก่อนเสร็จ</p><div className="mt-4"><CaseWorkflows caseId={caseId} /></div></section>
        </div>
      )}
      {tab === 'calendar' && (
        <div
          role="tabpanel"
          id="case-tabpanel-calendar"
          aria-labelledby="case-tab-calendar"
          className="min-w-0"
        >
          <CaseCalendarPanel caseId={caseId} onChanged={onChanged} />
        </div>
      )}
      {tab === 'documents' && (
        <div
          role="tabpanel"
          id="case-tabpanel-documents"
          aria-labelledby="case-tab-documents"
          className="min-w-0"
        >
          <CaseDocumentsPanel caseId={caseId} onChanged={onChanged} newFolderName={`${legalCase.ownRef} - ${legalCase.title}`} />
          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              aria-expanded={showAiAnalysis}
              aria-controls="case-ai-analysis-panel"
              onClick={() => setShowAiAnalysis(true)}
            >
              <Sparkles aria-hidden="true" className="h-4 w-4" />สรุปเอกสารรวม
            </Button>
          </div>
        </div>
      )}
      {tab === 'email' && (
        <div
          role="tabpanel"
          id="case-tabpanel-email"
          aria-labelledby="case-tab-email"
          className="min-w-0"
        >
          <CaseEmailPanel key={caseId} caseId={caseId} caseRef={legalCase.ownRef} initialThreadId={thread} onOpenSuggestions={() => onOpenSuggestions()} />
        </div>
      )}
      {tab === 'comments' && (
        <div
          role="tabpanel"
          id="case-tabpanel-comments"
          aria-labelledby="case-tab-comments"
          className="min-w-0 space-y-5"
        >
          <div role="group" aria-label="เลือกช่องข้อความ" className="grid grid-cols-2 gap-2 rounded-xl bg-[#e7e4dc] p-1.5 text-center font-semibold">
            <button type="button" aria-pressed={channel === 'team'} onClick={() => setChannel('team')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg py-2.5 ${channel === 'team' ? 'bg-white shadow' : 'text-muted-foreground'}`}><Lock aria-hidden="true" className="h-[1.1em] w-[1.1em]" />บันทึกภายในทีม</button>
            <button type="button" aria-pressed={channel === 'client'} onClick={() => setChannel('client')} className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg py-2.5 ${channel === 'client' ? 'bg-white shadow' : 'text-muted-foreground'}`}><MessageSquare aria-hidden="true" className="h-[1.1em] w-[1.1em]" />คุยกับลูกความ</button>
          </div>
          <p className="mt-[.3rem] text-[.82rem] leading-[1.45] text-muted-foreground">{channel === 'team' ? 'ข้อความในแท็บนี้ “บันทึกภายในทีม” เห็นเฉพาะคนในสำนักงาน ลูกความไม่เห็น' : 'ข้อความที่ส่งตรงนี้ ลูกความเห็นในพอร์ทัลของลูกความ'}</p>
          {channel === 'team' ? <CaseCommentsPanel
            caseId={caseId}
            teamMembers={[legalCase.leadLawyer, ...legalCase.assignments.map((a) => a.user)].filter(
              (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
            )}
          /> : <section className="rounded-xl border border-[#e2e0d8] bg-card p-5 shadow-[0_4px_16px_rgba(20,46,67,.06)]"><CaseMessagesPanel caseId={caseId} /></section>}
        </div>
      )}
      {tab === 'cargo-claim' && (
        <div
          role="tabpanel"
          id="case-tabpanel-cargo-claim"
          aria-labelledby="case-tab-cargo-claim"
          className="min-w-0"
        >
          <CargoClaimPanel caseId={caseId} />
        </div>
      )}
      {tab === 'billing' && (
        <div
          role="tabpanel"
          id="case-tabpanel-billing"
          aria-labelledby="case-tab-billing"
          className="min-w-0"
        >
          <CaseBillingPanel caseId={caseId} />
        </div>
      )}
      {tab === 'ask-ai' && (
        <div
          role="tabpanel"
          id="case-tabpanel-ask-ai"
          aria-label="ถาม AI เรื่องคดีนี้"
          className="min-w-0"
        >
          <CaseAskAiPanel caseId={caseId} />
        </div>
      )}
      {tab === 'closing-report' && (
        <div
          role="tabpanel"
          id="case-tabpanel-closing-report"
          aria-labelledby="case-tab-closing-report"
          className="min-w-0"
        >
          <CaseClosingReportPanel caseId={caseId} />
        </div>
      )}</>;
}
