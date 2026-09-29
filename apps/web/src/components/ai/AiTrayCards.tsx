'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { CalendarCheck, Sparkles } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, type AiTrayCard } from '@/lib/api';
import { Button } from '@/components/ui/button';

type DocStatus = 'running' | 'done' | 'failed';
type UnreadCard = Extract<AiTrayCard, { type: 'UNREAD_DOCUMENTS' }>;

/**
 * ถาดงาน AI: เสนองาน ไม่รันเอง — AI ทำงานเมื่อผู้ใช้กด และบอกเครดิตก่อนเสมอ.
 * caseId → เฉพาะคดีนั้น (หน้าคดี); ไม่ส่ง → ทุกคดีที่เข้าถึงได้ (AI Assistant).
 */
export function AiTrayCards({ caseId, compact = false, onChanged }: { caseId?: string; compact?: boolean; onChanged?: () => void }) {
  const { token } = useAuth();
  const [cards, setCards] = useState<AiTrayCard[] | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    api.getAiTray(token, caseId).then(setCards).catch((err) => {
      console.error(err);
      setCards([]);
    });
  }, [token, caseId]);
  useEffect(load, [load]);

  if (!cards) return null;
  if (!cards.length) return compact ? <p className="text-xs text-muted-foreground">ไม่มีงาน AI ค้าง</p> : null;

  return (
    <div className={compact ? 'space-y-2' : 'mb-4 space-y-2'}>
      {cards.map((card) =>
        card.type === 'UNREAD_DOCUMENTS' ? (
          <UnreadDocumentsCard key={`d-${card.caseId}`} card={card} showCase={!caseId} onDone={() => { load(); onChanged?.(); }} />
        ) : (
          <div key={`p-${card.caseId}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-4 py-3 text-sm">
            <span className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary" />
              {!caseId && <b>{card.caseRef ?? card.caseTitle}:</b>} มีวันนัด/ครบกำหนด {card.count} รายการที่ AI เสนอ รอยืนยัน
            </span>
            <Link href={`/cases/${card.caseId}?tab=documents`}>
              <Button size="sm" variant="outline">ตรวจวันที่</Button>
            </Link>
          </div>
        ),
      )}
    </div>
  );
}

function UnreadDocumentsCard({ card, showCase, onDone }: { card: UnreadCard; showCase: boolean; onDone: () => void }) {
  const { token } = useAuth();
  const [deselected, setDeselected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<Record<string, DocStatus>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [skipError, setSkipError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const chosen = card.documents.filter((d) => !deselected.has(d.id)).map((d) => d.id);
  const perDoc = card.documents.length ? card.creditCost / card.documents.length : 0;
  const cost = chosen.length * perDoc;

  const toggle = (id: string) =>
    setDeselected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const run = async () => {
    if (!token || !chosen.length) return;
    if (!confirm(`ให้ AI อ่าน ${chosen.length} ไฟล์ (สรุป + จับวันสำคัญ) ใช้ ${cost} เครดิต?`)) return;
    setBusy(true);
    // ทีละไฟล์: ไฟล์ไหนพังเห็นชัด ไฟล์ที่เหลือยังทำต่อ และไฟล์ที่พังยังอยู่ในถาดให้ลองใหม่
    // สรุปก่อน (สร้าง CaseKnowledge ให้ไฟล์หลุดจากถาด) แล้วค่อยจับวัน กันจับวันซ้ำเมื่อ retry
    for (const id of chosen) {
      setStatus((s) => ({ ...s, [id]: 'running' }));
      try {
        await api.analyzeExistingDocument(token, card.caseId, id);
        await api.extractDatesFromDocument(token, card.caseId, id);
        await api.markAiTrayHandled(token, [id]);
        setStatus((s) => ({ ...s, [id]: 'done' }));
      } catch (err) {
        setStatus((s) => ({ ...s, [id]: 'failed' }));
        setErrors((e) => ({ ...e, [id]: err instanceof Error ? err.message : 'อ่านไม่สำเร็จ' }));
      }
    }
    setBusy(false);
    onDone();
  };

  const skip = async () => {
    if (!token || !chosen.length) return;
    setBusy(true);
    setSkipError(null);
    try {
      await api.markAiTrayHandled(token, chosen);
      onDone();
    } catch (err) {
      setSkipError(err instanceof Error ? err.message : 'ข้ามไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  };

  const mark = (id: string) => (status[id] === 'running' ? '⏳' : status[id] === 'done' ? '✓' : status[id] === 'failed' ? '✕' : '');

  return (
    <div className="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
      <p className="flex items-center gap-2 font-medium">
        <Sparkles className="h-4 w-4 text-primary" />
        {showCase && (
          <Link href={`/cases/${card.caseId}`} className="text-primary underline">{card.caseRef ?? card.caseTitle}</Link>
        )}
        มีเอกสารใหม่ {card.documents.length} ฉบับที่ AI ยังไม่อ่าน
      </p>
      <ul className="mt-2 space-y-1">
        {card.documents.map((d) => (
          <li key={d.id}>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={!deselected.has(d.id)} disabled={busy} onChange={() => toggle(d.id)} />
              <span className="truncate">{d.filename}</span>
              <span className="w-4">{mark(d.id)}</span>
            </label>
            {errors[d.id] && <p className="ml-6 text-xs text-red-600">{errors[d.id]}</p>}
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" onClick={run} disabled={busy || !chosen.length}>
          ✦ ให้ AI อ่าน ({cost} เครดิต)
        </Button>
        <Button size="sm" variant="ghost" onClick={skip} disabled={busy || !chosen.length}>ข้าม</Button>
      </div>
      {skipError && <p className="mt-1 text-xs text-red-600">ข้ามไม่สำเร็จ: {skipError}</p>}
    </div>
  );
}
