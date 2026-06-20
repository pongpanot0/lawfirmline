'use client';

import { useState } from 'react';
import {
  Sparkles,
  X,
  FileText,
  Calendar,
  Mail,
  Search,
  StickyNote,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

const AI_ACTIONS = [
  { id: 'summarize', label: 'Summarize Case', icon: FileText, desc: 'Generate case overview from all documents' },
  { id: 'dates', label: 'Extract Important Dates', icon: Calendar, desc: 'Find deadlines and hearing dates' },
  { id: 'draft', label: 'Draft Legal Letters', icon: Mail, desc: 'Create complaint, notice, or response drafts' },
  { id: 'search', label: 'Search Documents', icon: Search, desc: 'Semantic search across case files' },
  { id: 'notes', label: 'Meeting Notes', icon: StickyNote, desc: 'Transcribe and structure client meetings' },
];

export function AIAssistantPanel() {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 flex h-12 items-center gap-2 rounded-full bg-primary px-4 text-sm font-medium text-primary-foreground shadow-card transition-transform hover:scale-105"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden sm:inline">AI Assistant</span>
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 right-0 top-14 z-40 flex w-full max-w-sm flex-col border-l border-border bg-card shadow-card sm:bottom-6 sm:right-6 sm:top-auto sm:h-[calc(100vh-5rem)] sm:max-h-[640px] sm:rounded-xl sm:border">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">LexFlow AI</p>
            <p className="text-xs text-muted-foreground">Powered by GPT-4o</p>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={() => setOpen(false)}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {!active ? (
          <>
            <p className="text-sm text-muted-foreground">
              Select an AI action to assist with your legal workflow.
            </p>
            {AI_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  type="button"
                  onClick={() => setActive(action.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{action.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{action.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">
                {AI_ACTIONS.find((a) => a.id === active)?.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Upload a document or select a case to run this AI action. Each action costs 5 credits.
              </p>
              <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                Drop PDF or DOCX here
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="flex-1">Run Analysis</Button>
                <Button size="sm" variant="outline" onClick={() => setActive(null)}>Back</Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <div className={cn('border-t border-border px-4 py-3 text-xs text-muted-foreground')}>
        100 AI credits remaining
      </div>
    </div>
  );
}
