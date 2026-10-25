'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Loader2 } from 'lucide-react';
import { api, type CaseDetail } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { caseStageOptions } from '@/lib/stage-labels';

/**
 * โหมด chat ของ AI Assistant เมื่ออยู่ในหน้าคดี — ตามแบบ AI drawer:
 * รู้บริบทคดี, quick actions กดเอง, ผลเป็นการ์ดพร้อมปุ่มทำต่อ
 * กติกา: AI ทำงานเฉพาะเมื่อกด และไม่บันทึกอะไรเองจนกว่าจะยืนยัน
 */

type Msg = {
  role: 'user' | 'ai';
  title?: string;
  text: string;
  actions?: Array<{ label: string; href?: string; onClick?: () => void; primary?: boolean }>;
};

export function CaseAiChat({
  caseId,
  intakeId: intakeIdProp,
  onPickLegacy,
}: {
  caseId?: string;
  /** เปิดจากหน้าเรื่องรับเข้าโดยตรง */
  intakeId?: string;
  /** สลับไป flow เดิมของ panel (เช่น สรุปเอกสารด้วยการอัปโหลด) */
  onPickLegacy: (action: 'summarize') => void;
}) {
  const { token } = useAuth();
  const [legalCase, setLegalCase] = useState<CaseDetail | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState('');
  const [lastAnalysisId, setLastAnalysisId] = useState<string | undefined>(undefined);
  const bottomRef = useRef<HTMLDivElement>(null);

  const [intakeInfo, setIntakeInfo] = useState<{ id: string; partyRole?: string | null; caseTypeName?: string | null } | null>(null);

  useEffect(() => {
    if (!token) return;
    if (caseId) {
      api.getCase(token, caseId).then((c) => setLegalCase(c as CaseDetail)).catch(() => setLegalCase(null));
    } else if (intakeIdProp) {
      api.getIntake(token, intakeIdProp)
        .then((it) => setIntakeInfo({ id: it.id, partyRole: it.partyRole, caseTypeName: (it as { caseType?: { name?: string } }).caseType?.name ?? it.matterType }))
        .catch(() => setIntakeInfo(null));
    }
  }, [token, caseId, intakeIdProp]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, busy]);

  const push = (m: Msg) => setMessages((prev) => [...prev, m]);
  const intakeId = legalCase?.intake?.id ?? intakeIdProp;
  const stageLabel = legalCase
    ? (caseStageOptions('th').find((o) => o.value === legalCase.stage)?.label ?? legalCase.stage)
    : '';
  const partyRole = legalCase?.partyRole ?? intakeInfo?.partyRole;
  const partyLabel = partyRole === 'PLAINTIFF' ? 'โจทก์' : partyRole === 'DEFENDANT' ? 'จำเลย' : 'ไม่ระบุฝ่าย';

  const runAnalysis = async () => {
    if (!token || !intakeId || busy) return;
    push({ role: 'user', text: 'วิเคราะห์แนวฎีกา — โอกาสสู้คดีนี้เป็นยังไง' });
    setBusy(true);
    try {
      let item = await api.runPrecedentAnalysis(token, intakeId);
      for (let i = 0; i < 40 && item.status === 'PENDING'; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        item = await api.getPrecedentAnalysis(token, intakeId, item.id);
      }
      if (item.status !== 'COMPLETE') {
        push({ role: 'ai', title: 'วิเคราะห์ไม่สำเร็จ', text: item.errorMessage || 'ลองใหม่อีกครั้ง หรือแนบเอกสาร/เหตุการณ์เพิ่มก่อน' });
      } else {
        setLastAnalysisId(item.id);
        push({
          role: 'ai',
          title: `ผลวิเคราะห์ (มุม${partyLabel})`,
          text: `${item.summaryBullets}${item.precedents.length ? `\n\nอ้างอิงฎีกา ${item.precedents.length} เรื่อง` : ''}`,
          actions: [
            { label: 'ร่าง Notice จากผลนี้', onClick: () => void runDraft(item.id), primary: true },
            { label: 'ดูฉบับเต็ม / ข้อเท็จจริง', href: `/intake/${intakeId}` },
          ],
        });
      }
    } catch (err) {
      push({ role: 'ai', title: 'วิเคราะห์ไม่สำเร็จ', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setBusy(false);
    }
  };

  const runDraft = async (analysisId?: string) => {
    if (!token || !intakeId || busy) return;
    push({ role: 'user', text: analysisId ? 'ร่าง Notice จากผลวิเคราะห์นี้เลย' : 'ร่างหนังสือทวงถาม (Notice)' });
    setBusy(true);
    try {
      const { content } = await api.draftNoticeIntake(token, intakeId, analysisId ?? lastAnalysisId);
      push({
        role: 'ai',
        title: 'ร่างหนังสือทวงถาม (ฉบับร่าง)',
        text: content,
        actions: [
          {
            label: 'คัดลอกร่าง',
            onClick: () => { void navigator.clipboard.writeText(content).catch(() => undefined); },
            primary: true,
          },
          { label: 'ไปหน้าออก Notice', href: caseId ? `/cases/${caseId}` : `/intake/${intakeId}` },
        ],
      });
    } catch (err) {
      push({ role: 'ai', title: 'ร่างไม่สำเร็จ', text: err instanceof Error ? err.message : 'เกิดข้อผิดพลาด' });
    } finally {
      setBusy(false);
    }
  };

  const sendFree = () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    push({ role: 'user', text: q });
    push({
      role: 'ai',
      text: 'โหมดถามอิสระกำลังตามมาเร็ว ๆ นี้ — ตอนนี้ใช้ปุ่มลัดด้านบนได้เลย: วิเคราะห์แนวฎีกา, ร่าง Notice, สรุปเอกสาร',
    });
  };

  const chips: Array<{ label: string; onClick?: () => void; href?: string; disabled?: boolean }> = [
    { label: 'วิเคราะห์แนวฎีกา', onClick: runAnalysis, disabled: !intakeId },
    { label: 'ร่าง Notice', onClick: () => void runDraft(), disabled: !intakeId },
    { label: 'สรุปเอกสาร', onClick: () => onPickLegacy('summarize') },
    { label: 'เอกสาร', href: caseId ? `/cases/${caseId}?tab=documents` : `/intake/${intakeId}` },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="border-b border-border px-4 py-2 text-xs text-muted-foreground">
        รู้บริบทเรื่องนี้แล้ว:{' '}
        <span className="font-semibold text-foreground">
          {legalCase
            ? [partyLabel, legalCase.caseType?.name, stageLabel].filter(Boolean).join(' · ')
            : intakeInfo
              ? [partyLabel, intakeInfo.caseTypeName].filter(Boolean).join(' · ')
              : 'กำลังโหลด…'}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-2.5">
        {chips.map((c) =>
          c.href ? (
            <Link
              key={c.label}
              href={c.href}
              className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
            >
              {c.label}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <button
              key={c.label}
              type="button"
              disabled={c.disabled || busy}
              onClick={c.onClick}
              className="min-h-11 rounded-full border border-primary/30 bg-primary/5 px-3 py-1 text-xs font-semibold text-primary hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 sm:min-h-8"
            >
              {c.label}
            </button>
          ),
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 scrollbar-thin">
        {messages.length === 0 && (
          <p className="text-sm text-muted-foreground">
            AI ทำงานเมื่อคุณกดปุ่มด้านบนเท่านั้น ผลทุกอย่างเป็นฉบับร่างจนกว่าคุณจะยืนยัน
          </p>
        )}
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
              {m.text}
            </div>
          ) : (
            <div key={i} className="mr-auto max-w-[95%] space-y-2 rounded-2xl rounded-bl-sm border border-border bg-muted/40 px-3.5 py-2.5">
              {m.title && <p className="text-xs font-bold text-primary">{m.title}</p>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.text}</p>
              {m.actions && (
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {m.actions.map((a) =>
                    a.href ? (
                      <Link
                        key={a.label}
                        href={a.href}
                        className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-input px-3 py-1 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8"
                      >
                        {a.label}
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden />
                      </Link>
                    ) : (
                      <button
                        key={a.label}
                        type="button"
                        onClick={a.onClick}
                        className={
                          a.primary
                            ? 'min-h-11 rounded-lg bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8'
                            : 'min-h-11 rounded-lg border border-input px-3 py-1 text-xs font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8'
                        }
                      >
                        {a.label}
                      </button>
                    ),
                  )}
                </div>
              )}
              <p className="text-xs text-muted-foreground">ฉบับร่าง ตรวจและยืนยันก่อนใช้ทุกครั้ง</p>
            </div>
          ),
        )}
        {busy && (
          <div role="status" className="mr-auto flex items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3.5 py-2 text-sm text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> กำลังทำงาน… (วิเคราะห์อาจใช้เวลาสักครู่)
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex gap-2 border-t border-border px-4 py-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              sendFree();
            }
          }}
          aria-label="ถามเกี่ยวกับคดีนี้"
          placeholder="ถามอะไรก็ได้เกี่ยวกับคดีนี้…"
          className="h-11 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <button
          type="button"
          onClick={sendFree}
          className="h-11 rounded-lg border border-input bg-card px-4 text-sm font-semibold hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          ส่ง
        </button>
      </div>
    </div>
  );
}
