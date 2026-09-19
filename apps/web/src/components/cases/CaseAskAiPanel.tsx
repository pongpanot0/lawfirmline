'use client';

import { useEffect, useState } from 'react';
import { api, DocumentItem, KnowledgeItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AskResult = Awaited<ReturnType<typeof api.askCase>>;
type Section = 'ask' | 'facts';

const SUGGESTED_QUESTIONS = [
  'สรุปเหตุการณ์สำคัญในคดีนี้',
  'มีเอกสารใดกล่าวถึงจำนวนเงินหรือค่าเสียหายบ้าง?',
  'มีกำหนดนัดหรือเส้นตายอะไรในเอกสารบ้าง?',
  'มีข้อมูลใดในเอกสารที่ขัดแย้งกันหรือไม่?',
];

const SECTION_LABELS: Record<Section, string> = {
  ask: 'ถามเอกสาร',
  facts: 'ตรวจ Facts',
};

/** MIME types the RAG pipeline can read — mirrors INDEXABLE_MIME_TYPES on the API. */
const READABLE_MIME_TYPES = ['application/pdf', 'text/plain'];

function AskSection({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [question, setQuestion] = useState('');

  useEffect(() => {
    if (!token) return;
    api.getDocuments(token, caseId).then(setDocuments).catch(console.error);
  }, [token, caseId]);

  const readable = documents.filter((doc) => READABLE_MIME_TYPES.includes(doc.mimeType));
  const unreadable = documents.length - readable.length;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AskResult | null>(null);
  const [askedQuestion, setAskedQuestion] = useState('');

  const ask = async (q: string) => {
    if (!token || !q.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAskedQuestion(q);
    try {
      setResult(await api.askCase(token, caseId, q.trim()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ไม่สามารถถาม AI ได้');
    } finally {
      setLoading(false);
    }
  };

  const openSource = async (documentId: string) => {
    if (!token) return;
    const blob = await api.downloadDocument(token, caseId, documentId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener');
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">ถามจากสำนวนคดี (AI)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="rounded-md bg-muted/40 p-3">
            <p className="text-xs font-medium text-muted-foreground">
              AI ตอบจากเอกสารในคดีนี้ ({readable.length} ไฟล์)
            </p>
            {readable.length ? (
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {readable.map((doc) => (
                  <span key={doc.id} className="rounded-full border border-border bg-background px-2 py-0.5 text-xs">
                    {doc.filename}
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">
                ยังไม่มีเอกสารที่ AI อ่านได้ — อัปโหลด PDF หรือ TXT ในแท็บเอกสารก่อน
              </p>
            )}
            {unreadable > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                อีก {unreadable} ไฟล์เป็นชนิดที่ AI ยังอ่านไม่ได้ (รองรับ PDF และ TXT)
              </p>
            )}
          </div>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void ask(question);
            }}
          >
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="เช่น ผลตรวจครั้งแรกพบอะไร และอยู่ในเอกสารหน้าไหน?"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              maxLength={2000}
            />
            <Button type="submit" disabled={loading || question.trim().length < 3}>
              {loading ? 'กำลังค้น...' : 'ถาม'}
            </Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                type="button"
                disabled={loading}
                onClick={() => {
                  setQuestion(q);
                  void ask(q);
                }}
                className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {q}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            AI ตอบจากเอกสารในคดีเท่านั้น พร้อมแหล่งอ้างอิง — ไม่ใช่คำแนะนำทางกฎหมาย ทนายต้องตรวจสอบกับต้นฉบับเสมอ
          </p>
        </CardContent>
      </Card>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">คำตอบ: {askedQuestion}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="whitespace-pre-wrap text-sm">{result.answer}</p>
            {result.sources.length > 0 && (
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">
                  แหล่งอ้างอิง ({result.sources.length})
                </p>
                <ul className="space-y-2">
                  {result.sources.map((source, i) => (
                    <li key={`${source.documentId}-${i}`} className="rounded-md border border-border bg-muted/30 p-2 text-xs">
                      <p className="font-medium">
                        {source.filename}
                        {source.pageStart
                          ? ` · หน้า ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `-${source.pageEnd}` : ''}`
                          : ''}
                      </p>
                      <p className="mt-1 line-clamp-2 text-muted-foreground">{source.snippet}</p>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-2"
                        onClick={() => void openSource(source.documentId)}
                      >
                        เปิดต้นฉบับ
                      </Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function FactsReviewSection({
  caseId,
  knowledge,
  onChanged,
}: {
  caseId: string;
  knowledge: KnowledgeItem[];
  onChanged: () => void;
}) {
  const { token } = useAuth();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pending = knowledge.filter((k) => !k.reviewedAt);
  const reviewed = knowledge.filter((k) => k.reviewedAt);

  const verify = async (id: string) => {
    if (!token) return;
    setBusyId(id);
    setError(null);
    try {
      await api.reviewCaseKnowledge(token, caseId, id);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'ยืนยันไม่สำเร็จ');
    } finally {
      setBusyId(null);
    }
  };

  const renderItem = (item: KnowledgeItem, verified: boolean) => (
    <li key={item.id} className="rounded-md border border-border p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium text-muted-foreground">
            {verified ? '✓ ตรวจแล้ว' : '🤖 รอทนายตรวจ'} · {item.title}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm">{item.summary}</p>
          {item.citations && item.citations.length > 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              อ้างอิง {item.citations.length} จุด:{' '}
              {item.citations
                .slice(0, 3)
                .map((c) => `${c.document.filename}${c.page ? ` หน้า ${c.page}` : ''}`)
                .join(', ')}
              {item.citations.length > 3 ? ' …' : ''}
            </p>
          )}
        </div>
        {!verified && (
          <Button
            type="button"
            size="sm"
            disabled={busyId === item.id}
            onClick={() => void verify(item.id)}
          >
            {busyId === item.id ? 'กำลังยืนยัน...' : 'ยืนยันถูกต้อง'}
          </Button>
        )}
      </div>
    </li>
  );

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-destructive">{error}</p>}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">รอตรวจ ({pending.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {pending.length ? (
            <ul className="space-y-2">{pending.map((k) => renderItem(k, false))}</ul>
          ) : (
            <p className="text-sm text-muted-foreground">ไม่มีผลวิเคราะห์ที่รอตรวจ</p>
          )}
        </CardContent>
      </Card>
      {reviewed.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">ตรวจแล้ว ({reviewed.length})</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">{reviewed.map((k) => renderItem(k, true))}</ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default function CaseAskAiPanel({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [section, setSection] = useState<Section>('ask');
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!token) return;
    api.getCaseKnowledge(token, caseId).then(setKnowledge).catch(console.error);
  }, [token, caseId, reloadKey]);

  const pendingCount = knowledge.filter((k) => !k.reviewedAt).length;

  return (
    <div className="space-y-4">
      <div role="group" aria-label="เครื่องมือ AI" className="flex w-fit rounded-md border border-border p-0.5">
        {(Object.keys(SECTION_LABELS) as Section[]).map((s) => (
          <button
            key={s}
            type="button"
            aria-pressed={section === s}
            onClick={() => setSection(s)}
            className={
              section === s
                ? 'rounded px-3 py-1.5 text-sm font-semibold bg-primary text-primary-foreground'
                : 'rounded px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground'
            }
          >
            {SECTION_LABELS[s]}
            {s === 'facts' && pendingCount > 0 && (
              <span className="ml-1.5 rounded-full bg-amber-500/20 px-1.5 text-xs text-amber-700 dark:text-amber-400">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {section === 'ask' && <AskSection caseId={caseId} />}
      {section === 'facts' && (
        <FactsReviewSection
          caseId={caseId}
          knowledge={knowledge}
          onChanged={() => setReloadKey((n) => n + 1)}
        />
      )}
    </div>
  );
}
