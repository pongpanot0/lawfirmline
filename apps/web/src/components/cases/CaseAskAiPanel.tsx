'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type AskResult = Awaited<ReturnType<typeof api.askCase>>;

const SUGGESTED_QUESTIONS = [
  'สรุปเหตุการณ์สำคัญในคดีนี้',
  'มีเอกสารใดกล่าวถึงจำนวนเงินหรือค่าเสียหายบ้าง?',
  'มีกำหนดนัดหรือเส้นตายอะไรในเอกสารบ้าง?',
  'มีข้อมูลใดในเอกสารที่ขัดแย้งกันหรือไม่?',
];

export default function CaseAskAiPanel({ caseId }: { caseId: string }) {
  const { token } = useAuth();
  const [question, setQuestion] = useState('');
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

  const openSource = async (documentId: string, filename: string) => {
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
                        onClick={() => void openSource(source.documentId, source.filename)}
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
