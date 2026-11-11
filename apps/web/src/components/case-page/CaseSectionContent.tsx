'use client';
import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CargoClaimPanel } from '@/components/cargo/CargoClaimPanel';
import type { CaseDetail, TaskItem } from '@/lib/api';
import type { CaseTabId } from '@/lib/case-tabs';
const CaseWorkflows = dynamic(() => import('@/components/workflows/CaseWorkflows').then((m) => m.CaseWorkflows), { ssr: false });
const CaseTasksPanel = dynamic(() => import('@/components/cases/CaseTasksPanel').then((m) => m.CaseTasksPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseCalendarPanel = dynamic(() => import('@/components/cases/CaseCalendarPanel').then((m) => m.CaseCalendarPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseDocumentsPanel = dynamic(() => import('@/components/cases/CaseDocumentsPanel').then((m) => m.CaseDocumentsPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseBillingPanel = dynamic(() => import('@/components/cases/CaseBillingPanel').then((m) => m.CaseBillingPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseAskAiPanel = dynamic(() => import('@/components/cases/CaseAskAiPanel'), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseCommentsPanel = dynamic(() => import('@/components/cases/CaseCommentsPanel').then((m) => m.CaseCommentsPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseEmailPanel = dynamic(() => import('@/components/cases/CaseEmailPanel').then((m) => m.CaseEmailPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });
const CaseClosingReportPanel = dynamic(() => import('@/components/cases/CaseClosingReportPanel').then((m) => m.CaseClosingReportPanel), { ssr: false, loading: () => <p className="text-sm text-muted-foreground">กำลังโหลด…</p> });

export function CaseSectionContent({ tab, caseId, legalCase, thread, showAiAnalysis, setShowAiAnalysis, onChanged, onTasksChanged, onOpenSuggestions }: { tab: CaseTabId; caseId: string; legalCase: CaseDetail; thread: string | null; showAiAnalysis: boolean; setShowAiAnalysis: (value: boolean) => void; onChanged: () => void; onTasksChanged: (tasks: TaskItem[]) => void; onOpenSuggestions: () => void }) {
  return <>
      {tab === 'tasks' && (
        <div
          role="tabpanel"
          id="case-tabpanel-tasks"
          aria-labelledby="case-tab-tasks"
          className="min-w-0"
        >
          <CaseWorkflows caseId={caseId} />
          <CaseTasksPanel caseId={caseId} onTasksChanged={onTasksChanged} />
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
          <div className="mb-3 flex justify-end">
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
          <CaseDocumentsPanel caseId={caseId} onChanged={onChanged} newFolderName={`${legalCase.ownRef} - ${legalCase.title}`} />
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
          className="min-w-0"
        >
          <CaseCommentsPanel
            caseId={caseId}
            teamMembers={[legalCase.leadLawyer, ...legalCase.assignments.map((a) => a.user)].filter(
              (m, i, all) => all.findIndex((x) => x.id === m.id) === i,
            )}
          />
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
