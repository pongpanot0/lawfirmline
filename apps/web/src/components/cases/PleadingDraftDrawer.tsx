'use client';

import { useEffect, useState } from 'react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { api, ApiError, PleadingCitation, PleadingDraftItem } from '@/lib/api';
import { publishActionFeedback } from '@/lib/action-feedback';
import { splitDraftParagraphs, splitParagraphSegments } from '@/lib/pleading-draft-format';

const KIND_OPTIONS: { value: string; label: string }[] = [
  { value: 'ANSWER', label: 'คำให้การ' },
  { value: 'COMPLAINT', label: 'คำฟ้อง' },
  { value: 'MOTION', label: 'คำร้อง' },
  { value: 'LETTER', label: 'หนังสือ' },
];

export function PleadingDraftDrawer({
  open,
  onClose,
  token,
  caseId,
  onGenerated,
}: {
  open: boolean;
  onClose: () => void;
  token: string;
  caseId: string;
  onGenerated: () => void;
}) {
  const [kind, setKind] = useState('ANSWER');
  const [instructions, setInstructions] = useState('');
  const [drafts, setDrafts] = useState<PleadingDraftItem[]>([]);
  const [draft, setDraft] = useState<PleadingDraftItem | null>(null);
  const [activeCitation, setActiveCitation] = useState<PleadingCitation | null>(null);
  const [editing, setEditing] = useState(false);
  const [editedBody, setEditedBody] = useState('');
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) {
      setDraft(null);
      setActiveCitation(null);
      setEditing(false);
      setError('');
      return;
    }
    api.getPleadingDrafts(token, caseId).then(setDrafts).catch(() => {});
  }, [open, token, caseId]);

  const handleGenerate = async () => {
    setGenerating(true);
    setError('');
    try {
      const created = await api.generatePleadingDraft(token, caseId, {
        kind,
        instructions: instructions || undefined,
      });
      setDraft(created);
      setDrafts((prev) => [created, ...prev]);
      setEditing(false);
      setActiveCitation(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'สร้างร่างไม่สำเร็จ');
    } finally {
      setGenerating(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!draft) return;
    setSaving(true);
    setError('');
    try {
      const updated = await api.updatePleadingDraft(token, caseId, draft.id, editedBody);
      setDraft(updated);
      setEditing(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!draft) return;
    const k = draft.unsupportedParagraphs.length;
    if (k > 0 && !window.confirm(`มี ${k} ข้อความที่ไม่มีแหล่งอ้างอิง ยืนยันบันทึกเป็นเอกสารหรือไม่?`)) return;
    setApproving(true);
    setError('');
    try {
      const approved = await api.approvePleadingDraft(token, caseId, draft.id);
      setDraft(approved);
      publishActionFeedback('success', 'บันทึกเป็นเอกสารแล้ว');
      onGenerated();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setApproving(false);
    }
  };

  const paragraphs = draft ? splitDraftParagraphs(draft.bodyText) : [];
  const citationByN = new Map((draft?.citations ?? []).map((c) => [c.n, c]));

  return (
    <SideDrawer open={open} title="AI ร่างคำคู่ความ" onClose={onClose}>
      <div className="flex h-full gap-4">
        <div className="min-w-0 flex-1">
          {drafts.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-1.5 border-b border-border pb-3">
              {drafts.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => {
                    setDraft(d);
                    setEditing(false);
                    setActiveCitation(null);
                  }}
                  className={`rounded-full border px-2.5 py-1 text-xs ${
                    draft?.id === d.id ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
                  }`}
                >
                  {KIND_OPTIONS.find((k) => k.value === d.kind)?.label ?? d.kind} ·{' '}
                  {new Date(d.createdAt).toLocaleDateString('th-TH')}
                </button>
              ))}
            </div>
          )}

          {!draft && (
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium">ประเภท</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                >
                  {KIND_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">คำสั่งเพิ่มเติม (ถ้ามี)</label>
                <textarea
                  value={instructions}
                  onChange={(e) => setInstructions(e.target.value)}
                  rows={4}
                  className="w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                  placeholder="เช่น เน้นประเด็นผิดสัญญาเช่า"
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
              >
                {generating ? (
                  <>
                    <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/40 border-t-primary-foreground" />
                    AI กำลังร่าง…
                  </>
                ) : (
                  'สร้างร่าง'
                )}
              </button>
              <p className="text-xs text-muted-foreground">ใช้ 10 เครดิต</p>
            </div>
          )}

          {draft && (
            <div>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
                    draft.status === 'APPROVED'
                      ? 'border-emerald-300 text-emerald-700 dark:text-emerald-300'
                      : 'border-amber-400 text-amber-700 dark:text-amber-300'
                  }`}
                >
                  {draft.status === 'APPROVED' ? 'บันทึกเป็นเอกสารแล้ว' : 'ร่าง AI · ยังไม่บันทึก'}
                </span>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-lg border px-2.5 py-1 text-xs hover:bg-accent"
                >
                  ← กลับไปสร้างร่างใหม่
                </button>
              </div>

              {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

              {editing ? (
                <textarea
                  value={editedBody}
                  onChange={(e) => setEditedBody(e.target.value)}
                  rows={16}
                  className="mb-3 w-full rounded-lg border bg-background px-2 py-1.5 text-sm"
                />
              ) : (
                <div className="mb-3 space-y-3 text-sm leading-relaxed">
                  {paragraphs.map((p, i) => (
                    <p key={i}>
                      {splitParagraphSegments(p).map((seg, j) =>
                        seg.type === 'text' ? (
                          <span key={j}>{seg.value}</span>
                        ) : (
                          <button
                            key={j}
                            type="button"
                            onMouseEnter={() => citationByN.get(seg.n) && setActiveCitation(citationByN.get(seg.n)!)}
                            onClick={() => citationByN.get(seg.n) && setActiveCitation(citationByN.get(seg.n)!)}
                            className="mx-0.5 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-medium text-primary hover:bg-primary/20"
                          >
                            [{seg.n}]
                          </button>
                        ),
                      )}
                      {draft.unsupportedParagraphs.includes(i) && (
                        <span className="ml-2 rounded-full bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive">
                          ไม่พบแหล่งอ้างอิง
                        </span>
                      )}
                    </p>
                  ))}
                </div>
              )}

              {draft.unsupportedParagraphs.length > 0 && (
                <p className="mb-3 text-xs font-medium text-destructive">
                  {draft.unsupportedParagraphs.length} ข้อความไม่มีแหล่งอ้างอิง ต้องตรวจก่อนบันทึก
                </p>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={generating || draft.status === 'APPROVED'}
                  className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                >
                  {generating ? 'AI กำลังร่าง…' : 'ร่างใหม่'}
                </button>
                {editing ? (
                  <button
                    type="button"
                    onClick={handleSaveEdit}
                    disabled={saving}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditedBody(draft.bodyText);
                      setEditing(true);
                    }}
                    disabled={draft.status === 'APPROVED'}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
                  >
                    แก้ไข
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={approving || editing || draft.status === 'APPROVED'}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50"
                >
                  {approving ? 'กำลังบันทึก...' : 'ตรวจแล้ว บันทึกเป็นเอกสาร'}
                </button>
                {editing && <p className="w-full text-xs text-muted-foreground">บันทึกการแก้ไขก่อน</p>}
              </div>
            </div>
          )}
        </div>

        {draft && (
          <div className="w-56 shrink-0 border-l border-border pl-3">
            <h3 className="mb-2 text-sm font-semibold">แหล่งอ้างอิง</h3>
            {activeCitation ? (
              <div className="text-xs">
                <p className="mb-1 font-medium">
                  [{activeCitation.n}] {activeCitation.filename}
                </p>
                {activeCitation.pageStart != null && (
                  <p className="mb-1 text-muted-foreground">หน้า {activeCitation.pageStart}</p>
                )}
                <p className="text-muted-foreground">{activeCitation.snippet}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">ชี้หรือคลิกที่ [N] ในร่างเพื่อดูแหล่งอ้างอิง</p>
            )}
          </div>
        )}
      </div>
    </SideDrawer>
  );
}
