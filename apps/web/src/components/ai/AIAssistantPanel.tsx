'use client';

import { useRef, useState } from 'react';
import {
  Sparkles,
  X,
  FileText,
  Calendar,
  Mail,
  Search,
  StickyNote,
  ChevronRight,
  Copy,
  Check,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth';
import { api, type CaseItem, type IntakeItem } from '@/lib/api';

const AI_ACTIONS = [
  {
    id: 'summarize',
    label: 'สรุปคดี',
    icon: FileText,
    desc: 'อัปโหลดเอกสาร ให้ AI สรุปประเด็นสำคัญ',
    ready: true,
  },
  {
    id: 'dates',
    label: 'ดึงวันสำคัญ',
    icon: Calendar,
    desc: 'หา deadline และวันนัดศาลจากเอกสาร',
    ready: false,
  },
  {
    id: 'draft',
    label: 'ร่างหนังสือกฎหมาย',
    icon: Mail,
    desc: 'ร่างหนังสือบอกกล่าว/ทวงถามจากข้อมูล intake',
    ready: true,
  },
  {
    id: 'search',
    label: 'ค้นหาเอกสาร',
    icon: Search,
    desc: 'ค้นหาความหมายข้ามเอกสารทั้งหมดในคดี',
    ready: false,
  },
  {
    id: 'notes',
    label: 'สรุปบันทึกประชุม',
    icon: StickyNote,
    desc: 'ถอดเทปและสรุปบันทึกประชุมลูกความ',
    ready: false,
  },
] as const;

const CREDIT_COST = 5;

interface AIAssistantPanelProps {
  /** When opened from within a case, skips the case picker for "summarize". */
  caseId?: string;
}

export function AIAssistantPanel({ caseId }: AIAssistantPanelProps) {
  const { token, user } = useAuth();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<string | null>(null);

  const [cases, setCases] = useState<CaseItem[] | null>(null);
  const [intakes, setIntakes] = useState<IntakeItem[] | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState(caseId ?? '');
  const [selectedIntakeId, setSelectedIntakeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [creditsSpent, setCreditsSpent] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const remainingCredits = Math.max(0, (user?.aiCredits ?? 0) - creditsSpent);
  const action = AI_ACTIONS.find((a) => a.id === active);

  const resetActionState = () => {
    setResult(null);
    setError(null);
    setFile(null);
    setCopied(false);
    setSelectedCaseId(caseId ?? '');
    setSelectedIntakeId('');
  };

  const openAction = (id: string) => {
    setActive(id);
    resetActionState();
    if (id === 'summarize' && !caseId && !cases && token) {
      api
        .getCases(token)
        .then(setCases)
        .catch(() => setCases([]));
    }
    if (id === 'draft' && !intakes && token) {
      api
        .getIntakes(token, { limit: 50 })
        .then((r) => setIntakes(r.items))
        .catch(() => setIntakes([]));
    }
  };

  const runSummarize = async () => {
    if (!token || !file || !selectedCaseId) return;
    setLoading(true);
    setError(null);
    try {
      const doc = await api.analyzeDocument(token, selectedCaseId, file, file.name);
      setResult(doc.summary);
      setCreditsSpent((c) => c + CREDIT_COST);
    } catch {
      setError('สรุปเอกสารไม่สำเร็จ — ตรวจสอบว่าตั้งค่า AI credit และไฟล์เอกสารถูกต้อง');
    } finally {
      setLoading(false);
    }
  };

  const runDraft = async () => {
    if (!token || !selectedIntakeId) return;
    setLoading(true);
    setError(null);
    try {
      const { content } = await api.draftNoticeIntake(token, selectedIntakeId);
      setResult(content);
      setCreditsSpent((c) => c + CREDIT_COST);
    } catch {
      setError('ร่างหนังสือไม่สำเร็จ — ลองใหม่อีกครั้ง');
    } finally {
      setLoading(false);
    }
  };

  const copyResult = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

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
            <p className="text-sm font-semibold">Samnuan AI</p>
            <p className="text-xs text-muted-foreground">ขับเคลื่อนโดย GPT-4o</p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => {
            setOpen(false);
            setActive(null);
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
        {!active ? (
          <>
            <p className="text-sm text-muted-foreground">เลือกฟีเจอร์ AI ที่ต้องการใช้งาน</p>
            {AI_ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openAction(item.id)}
                  className="flex w-full items-center gap-3 rounded-lg border border-border bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium">{item.label}</p>
                      {!item.ready && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                          เร็วๆ นี้
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </>
        ) : (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">{action?.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!action?.ready ? (
                <p className="text-sm text-muted-foreground">
                  ฟีเจอร์นี้ยังอยู่ระหว่างพัฒนา เร็วๆ นี้จะเปิดให้ใช้งานครับ
                </p>
              ) : result ? (
                <>
                  <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-muted/40 p-3 text-sm scrollbar-thin">
                    {result}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={copyResult}>
                      {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                      {copied ? 'คัดลอกแล้ว' : 'คัดลอกข้อความ'}
                    </Button>
                    <Button size="sm" variant="secondary" onClick={resetActionState}>
                      เริ่มใหม่
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    {action?.id === 'summarize'
                      ? `ใช้ ${CREDIT_COST} credit ต่อครั้ง`
                      : `สร้างร่างจากข้อมูล intake ที่มีอยู่ — ใช้ ${CREDIT_COST} credit ต่อครั้ง`}
                  </p>

                  {action?.id === 'summarize' && (
                    <>
                      {!caseId && (
                        <select
                          value={selectedCaseId}
                          onChange={(e) => setSelectedCaseId(e.target.value)}
                          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                        >
                          <option value="">เลือกคดี...</option>
                          {(cases ?? []).map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.ownRef} — {c.title}
                            </option>
                          ))}
                        </select>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        className="hidden"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                      />
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => fileInputRef.current?.click()}
                        onKeyDown={(e) => e.key === 'Enter' && fileInputRef.current?.click()}
                        onDragOver={(e) => {
                          e.preventDefault();
                          setDragOver(true);
                        }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => {
                          e.preventDefault();
                          setDragOver(false);
                          const dropped = e.dataTransfer.files?.[0];
                          if (dropped) setFile(dropped);
                        }}
                        className={cn(
                          'cursor-pointer rounded-lg border border-dashed p-6 text-center text-sm transition-colors',
                          dragOver ? 'border-primary bg-primary/5' : 'border-border text-muted-foreground',
                        )}
                      >
                        {file ? file.name : 'ลากไฟล์ PDF หรือ DOCX มาวาง หรือคลิกเพื่อเลือกไฟล์'}
                      </div>
                    </>
                  )}

                  {action?.id === 'draft' && (
                    <select
                      value={selectedIntakeId}
                      onChange={(e) => setSelectedIntakeId(e.target.value)}
                      className="w-full rounded-lg border border-input bg-card px-3 py-2 text-sm"
                    >
                      <option value="">เลือก intake...</option>
                      {(intakes ?? []).map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.title || i.clientName || i.id}
                        </option>
                      ))}
                    </select>
                  )}

                  {error && <p className="text-sm text-destructive">{error}</p>}

                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1"
                      disabled={
                        loading ||
                        (action?.id === 'summarize' && (!file || !selectedCaseId)) ||
                        (action?.id === 'draft' && !selectedIntakeId)
                      }
                      onClick={action?.id === 'summarize' ? runSummarize : runDraft}
                    >
                      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                      {loading ? 'กำลังประมวลผล...' : action?.id === 'summarize' ? 'สรุปเอกสาร' : 'สร้างร่าง'}
                    </Button>
                  </div>
                </>
              )}
              <Button size="sm" variant="ghost" className="w-full" onClick={() => setActive(null)}>
                ย้อนกลับ
              </Button>
            </CardContent>
          </Card>
        )}
      </div>

      <div className={cn('border-t border-border px-4 py-3 text-xs text-muted-foreground')}>
        เหลือ {remainingCredits} AI credit
      </div>
    </div>
  );
}
