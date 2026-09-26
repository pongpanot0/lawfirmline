'use client';

import { useEffect, useMemo, useState } from 'react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { api, ApiError, DocumentTemplateItem } from '@/lib/api';
import { publishActionFeedback } from '@/lib/action-feedback';

// เลขคดี/ตัวความ/ศาล ฯลฯ — ป้ายภาษาไทยของตัวแปรที่ template ใช้ได้ (ตรงกับ templates.service.ts)
const VARIABLE_LABELS: Record<string, string> = {
  ownRef: 'เลขอ้างอิงสำนักงาน',
  caseNumber: 'เลขคดี',
  customerRef: 'เลขอ้างอิงลูกค้า',
  clientName: 'ตัวความ',
  courtName: 'ศาล',
  folderId: 'รหัสโฟลเดอร์',
  title: 'ชื่อคดี',
  caseType: 'ประเภทคดี',
  date: 'วันที่',
  blackCaseNumber: 'เลขคดีดำ',
  redCaseNumber: 'เลขคดีแดง',
  plaintiffNames: 'โจทก์',
  defendantNames: 'จำเลย',
  lawyerName: 'ทนาย',
};

type Rendered = {
  name: string;
  content: string;
  variables: Record<string, string>;
  missingFields: string[];
};

export function TemplateGenerateDrawer({
  open,
  onClose,
  token,
  caseId,
  templates,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  caseId: string;
  templates: DocumentTemplateItem[];
  onGenerated: () => void;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');

  const filtered = useMemo(
    () => templates.filter((t) => t.name.toLowerCase().includes(search.toLowerCase())),
    [templates, search],
  );

  useEffect(() => {
    if (!open) {
      setSearch('');
      setSelectedId(null);
      setRendered(null);
      setShowPreview(false);
      setError('');
    }
  }, [open]);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setError('');
    setShowPreview(false);
    api
      .renderTemplate(token, caseId, selectedId)
      .then(setRendered)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'โหลดแม่แบบไม่สำเร็จ'))
      .finally(() => setLoading(false));
  }, [selectedId, token, caseId]);

  const handleGenerate = async () => {
    if (!selectedId) return;
    setGenerating(true);
    setError('');
    try {
      await api.generateTemplateDocx(token, caseId, selectedId);
      publishActionFeedback('success', 'สร้างเอกสารแล้ว');
      onGenerated();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างเอกสารไม่สำเร็จ');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <SideDrawer open={open} title="สร้างเอกสารจากแม่แบบ" onClose={onClose}>
      <div className="flex h-full gap-4">
        <div className="w-48 shrink-0 border-r border-border pr-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="ค้นหาแม่แบบ"
            className="mb-3 w-full rounded-lg border px-2 py-1.5 text-sm"
          />
          <div className="flex flex-col gap-1">
            {filtered.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedId(t.id)}
                className={`rounded-lg px-2 py-1.5 text-left text-sm ${
                  selectedId === t.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                }`}
              >
                {t.name}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-xs text-muted-foreground">ไม่พบแม่แบบ</p>}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          {!selectedId && <p className="text-sm text-muted-foreground">เลือกแม่แบบทางซ้าย</p>}
          {loading && <p className="text-sm text-muted-foreground">กำลังโหลด...</p>}
          {error && <p className="mb-3 text-sm text-destructive">{error}</p>}
          {rendered && !loading && (
            <>
              <table className="mb-4 w-full text-sm">
                <tbody>
                  {Object.entries(rendered.variables).map(([key, value]) => {
                    const missing = rendered.missingFields.includes(key);
                    return (
                      <tr key={key} className="border-b border-border">
                        <td className="py-1 pr-3 align-top text-muted-foreground">
                          {VARIABLE_LABELS[key] ?? key}
                        </td>
                        <td className={missing ? 'py-1 text-destructive' : 'py-1'}>
                          {missing ? 'ยังไม่มีข้อมูล' : value}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              <div className="mb-4 flex gap-2">
                <button
                  type="button"
                  onClick={() => setShowPreview((v) => !v)}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent"
                >
                  ดูตัวอย่าง
                </button>
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {generating ? 'กำลังสร้าง...' : 'สร้าง .docx'}
                </button>
              </div>

              {showPreview && (
                <pre className="max-h-64 overflow-auto rounded-lg bg-muted p-4 text-xs whitespace-pre-wrap">
                  {rendered.content}
                </pre>
              )}
            </>
          )}
        </div>
      </div>
    </SideDrawer>
  );
}
