'use client';

import { useEffect, useRef, useState } from 'react';
import { api, ApiError, DocumentItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { CaseKnowledgePanel } from './CaseKnowledgePanel';
import { Button } from '@/components/ui/button';

export function BatchAnalysisPanel({
  caseId,
  files = [],
  onFilesChange,
  onUseSummary,
  disabled = false,
  onBusyChange,
  entityLabel = 'คดี',
}: {
  caseId?: string;
  files?: File[];
  onFilesChange?: (files: File[]) => void;
  onUseSummary?: (summary: string) => void;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
  /** Noun to use in draft-mode copy ("บันทึกลง{entityLabel}") — defaults to "คดี" for case creation. */
  entityLabel?: string;
}) {
  const { token } = useAuth();
  const input = useRef<HTMLInputElement>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [progress, setProgress] = useState('');
  const [summary, setSummary] = useState('');
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const lock = useRef(false);
  useEffect(() => {
    onBusyChange?.(busy);
  }, [busy, onBusyChange]);
  const fileKey = (file: File) =>
    `${file.name}:${file.size}:${file.lastModified}`;
  const rows = caseId
    ? documents.map((doc) => ({ id: doc.id, name: doc.filename }))
    : files.map((file) => ({ id: fileKey(file), name: file.name }));

  useEffect(() => {
    if (!token || !caseId) return;
    let active = true;
    api
      .getDocuments(token, caseId)
      .then((items) => {
        if (active) {
          setDocuments(items);
          setSelected([]);
        }
      })
      .catch(() => {
        if (active) setError('โหลดเอกสารไม่สำเร็จ กรุณาโหลดหน้าใหม่');
      });
    return () => {
      active = false;
    };
  }, [token, caseId]);

  const addFiles = async (incoming: File[]) => {
    if (!token || lock.current) return;
    setError('');
    if (
      incoming.some(
        (file) =>
          !['application/pdf', 'text/plain'].includes(file.type) ||
          file.size > 10 * 1024 * 1024,
      )
    ) {
      setError('รองรับ PDF ที่มีข้อความ และ TXT ขนาดไม่เกิน 10MB ต่อไฟล์');
      return;
    }
    if (!caseId) {
      const next = [...files];
      for (const file of incoming)
        if (!next.some((item) => fileKey(item) === fileKey(file)))
          next.push(file);
      if (
        next.length > 10 ||
        next.reduce((sum, file) => sum + file.size, 0) > 50 * 1024 * 1024
      ) {
        setError('เลือกไม่เกิน 10 ไฟล์ รวมไม่เกิน 50MB');
        return;
      }
      onFilesChange?.(next);
      setSelected((previous) => [
        ...new Set([...previous, ...incoming.map(fileKey)]),
      ]);
      setSummary('');
      return;
    }
    if (incoming.length > 10) {
      setError('อัปโหลดได้ครั้งละไม่เกิน 10 ไฟล์');
      return;
    }
    lock.current = true;
    setBusy(true);
    const failures: string[] = [];
    const uploaded: DocumentItem[] = [];
    for (const file of incoming) {
      setProgress(`กำลังอัปโหลด ${file.name}`);
      try {
        uploaded.push(await api.uploadDocument(token, caseId, file));
      } catch {
        failures.push(file.name);
      }
    }
    setDocuments((previous) => [...uploaded, ...previous]);
    setSelected((previous) =>
      [...new Set([...previous, ...uploaded.map((doc) => doc.id)])].slice(
        0,
        10,
      ),
    );
    setSummary('');
    if (failures.length)
      setError(
        `อัปโหลดไม่สำเร็จ: ${failures.join(', ')} — เลือกอัปโหลดเฉพาะไฟล์เหล่านี้อีกครั้ง`,
      );
    setBusy(false);
    lock.current = false;
    setProgress('');
  };

  const analyze = async () => {
    if (!token || !selected.length || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    setProgress('กำลังอ่านและวิเคราะห์ไฟล์ที่เลือกทั้งหมดร่วมกัน…');
    try {
      const result = caseId
        ? await api.analyzeSelectedDocuments(token, caseId, selected)
        : await api.analyzeDraftFiles(
            token,
            files.filter((file) => selected.includes(fileKey(file))),
          );
      setSummary(result.summary);
      if (caseId) setAnalysisRevision((value) => value + 1);
    } catch (err) {
      setError(
        err instanceof ApiError
          ? err.message
          : 'วิเคราะห์ไม่สำเร็จ ไฟล์ที่เลือกยังอยู่ ลองใหม่ได้',
      );
    } finally {
      lock.current = false;
      setBusy(false);
      setProgress('');
    }
  };

  return (
    <section
      className="min-w-0 space-y-3 rounded-xl border border-border bg-card p-4 sm:p-5"
      aria-label="เอกสารสำหรับวิเคราะห์รวม"
    >
      <h2 className="font-semibold">เอกสารและการวิเคราะห์รวม</h2>
      <p className="text-sm text-muted-foreground">
        เพิ่มหลายไฟล์ เลือกไฟล์ที่ต้องการ แล้ววิเคราะห์พร้อมกันในครั้งเดียว ·
        PDF/TXT ไม่เกิน 10MB ต่อไฟล์
      </p>
      {!caseId && (
        <p className="text-xs text-muted-foreground">
          ไฟล์จะถูกเก็บเมื่อบันทึกข้อมูลสำเร็จ หากออกจากหน้านี้ก่อน
          ไฟล์ที่เลือกจะไม่ถูกเก็บ
        </p>
      )}
      <input
        ref={input}
        type="file"
        multiple
        accept=".pdf,.txt,application/pdf,text/plain"
        className="hidden"
        onChange={(event) => {
          const incoming = Array.from(event.target.files ?? []);
          event.target.value = '';
          void addFiles(incoming);
        }}
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={disabled || busy}
          onClick={() => input.current?.click()}
        >
          เพิ่มหลายไฟล์
        </Button>
        {rows.length > 0 && (
          <Button
            type="button"
            variant="ghost"
            disabled={disabled || busy}
            onClick={() => {
              setSelected(
                selected.length ? [] : rows.slice(0, 10).map((row) => row.id),
              );
              setSummary('');
            }}
          >
            {selected.length
              ? 'ยกเลิกเลือกทั้งหมด'
              : 'เลือกทั้งหมด (สูงสุด 10)'}
          </Button>
        )}
      </div>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {rows.map((row) => (
          <li
            key={row.id}
            className="flex min-w-0 items-start gap-2 rounded-lg border border-border p-3 text-sm"
          >
            <label className="flex min-w-0 flex-1 items-start gap-2">
              <input
                type="checkbox"
                checked={selected.includes(row.id)}
                disabled={
                  disabled ||
                  busy ||
                  (!selected.includes(row.id) && selected.length >= 10)
                }
                onChange={() => {
                  setSelected((previous) =>
                    previous.includes(row.id)
                      ? previous.filter((id) => id !== row.id)
                      : [...previous, row.id],
                  );
                  setSummary('');
                }}
                className="mt-1"
              />
              <span className="min-w-0 break-words">{row.name}</span>
            </label>
            {!caseId && (
              <button
                type="button"
                className="shrink-0 text-xs text-muted-foreground hover:text-destructive"
                disabled={disabled || busy}
                onClick={() => {
                  onFilesChange?.(
                    files.filter((file) => fileKey(file) !== row.id),
                  );
                  setSelected((previous) =>
                    previous.filter((id) => id !== row.id),
                  );
                  setSummary('');
                }}
              >
                นำออก
              </button>
            )}
          </li>
        ))}
      </ul>
      {!rows.length && (
        <p className="text-sm text-muted-foreground">
          ยังไม่มีไฟล์ เริ่มจาก “เพิ่มหลายไฟล์”
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={disabled || busy || !selected.length}
          onClick={analyze}
        >
          วิเคราะห์รวม {selected.length} ไฟล์
        </Button>
        <span className="text-xs text-muted-foreground">
          5 เครดิตต่อครั้ง · เลือกได้ 1–10 ไฟล์
        </span>
      </div>
      {progress && (
        <p role="status" className="text-sm text-primary">
          {progress}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {caseId && <CaseKnowledgePanel caseId={caseId} refreshKey={analysisRevision} />}
      {summary && !caseId && (
        <div className="space-y-3 border-t border-border pt-4">
          <h3 className="text-sm font-semibold">ผลวิเคราะห์ไฟล์ที่เลือก</h3>
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
            {summary}
          </p>
          {onUseSummary && (
            <Button
              type="button"
              variant="outline"
              onClick={() => onUseSummary(summary)}
            >
              เพิ่มผลสรุปในรายละเอียด{entityLabel}
            </Button>
          )}
          <p className="text-xs text-muted-foreground">
            ตรวจสอบข้อเท็จจริงและจำนวนเงินกับเอกสารต้นฉบับก่อนนำไปใช้
          </p>
        </div>
      )}
    </section>
  );
}
