'use client';

import { useEffect, useState } from 'react';
import { api, ContactCaseAccessEntry, DocumentItem } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/misc';

export interface PublishDocumentDialogProps {
  caseId: string;
  document: DocumentItem;
  onClose: () => void;
  onPublished: () => void;
}

/**
 * Who is about to be able to read this file, shown before it is published.
 *
 * Publishing sends the document to the client portal and notifies the contacts
 * who hold access to the case. That list was never in front of the lawyer
 * pressing the button — so it is here, with the file being shared named at the
 * top, and every recipient tickable. Nothing is published until the lawyer
 * confirms, and the state afterwards is whatever the server reports.
 */
export function PublishDocumentDialog({
  caseId,
  document,
  onClose,
  onPublished,
}: PublishDocumentDialogProps) {
  const { token } = useAuth();
  const [grants, setGrants] = useState<ContactCaseAccessEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState(document.filename);
  const [summary, setSummary] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    setLoadError('');
    api
      .listContactCaseAccess(token, caseId)
      .then((entries) => {
        const now = Date.now();
        const active = entries.filter(
          (entry) =>
            !entry.revokedAt && (!entry.endDate || new Date(entry.endDate).getTime() >= now),
        );
        setGrants(active);
        // Everyone who already has access is the default, because that is what
        // publishing does today — the point is that it is now visible and can
        // be narrowed, not that it silently changed.
        setSelected(active.map((entry) => entry.clientContactId));
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : 'โหลดรายชื่อผู้รับไม่สำเร็จ'),
      )
      .finally(() => setLoading(false));
  }, [token, caseId]);

  const toggle = (contactId: string) =>
    setSelected((previous) =>
      previous.includes(contactId)
        ? previous.filter((id) => id !== contactId)
        : [...previous, contactId],
    );

  const handlePublish = async () => {
    if (!token || publishing) return;
    setPublishing(true);
    setError('');
    try {
      await api.publishDocument(token, caseId, document.id, {
        title: title.trim() || document.filename,
        summary: summary.trim() || undefined,
        recipientContacts: selected,
      });
      onPublished();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เผยแพร่ไม่สำเร็จ');
      setPublishing(false);
    }
  };

  return (
    <Modal open onClose={onClose} className="max-w-lg">
      <h2 className="text-lg font-semibold">ตรวจก่อนเผยแพร่</h2>
      <p className="mt-1 break-words text-sm text-muted-foreground">
        ไฟล์: <span className="font-medium text-foreground">{document.filename}</span>
      </p>

      <div className="mt-4 space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">ชื่อที่ลูกความจะเห็น</span>
          <Input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-muted-foreground">คำอธิบายสั้นๆ (ไม่บังคับ)</span>
          <Input value={summary} onChange={(e) => setSummary(e.target.value)} />
        </label>

        <div className="rounded-lg border border-border p-3">
          <p className="text-sm font-medium">ใครจะเห็นไฟล์นี้</p>
          {loading ? (
            <p className="mt-2 text-sm text-muted-foreground">กำลังโหลดรายชื่อ...</p>
          ) : loadError ? (
            <p role="alert" className="mt-2 text-sm text-destructive">
              {loadError}
            </p>
          ) : grants.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              ยังไม่มีผู้ติดต่อที่เข้าถึงคดีนี้ได้ — เผยแพร่แล้วจะยังไม่มีใครเห็นจนกว่าจะให้สิทธิ์
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {grants.map((grant) => (
                <li key={grant.id}>
                  <label className="flex items-start gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={selected.includes(grant.clientContactId)}
                      onChange={() => toggle(grant.clientContactId)}
                    />
                    <span className="min-w-0">
                      <span className="break-words">{grant.clientContact.name}</span>
                      {grant.clientContact.email && (
                        <span className="block break-words text-xs text-muted-foreground">
                          {grant.clientContact.email}
                        </span>
                      )}
                      {grant.endDate && (
                        <span className="block text-xs text-muted-foreground">
                          สิทธิ์ถึง {new Date(grant.endDate).toLocaleDateString('th-TH')}
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button onClick={handlePublish} disabled={publishing || loading}>
          {publishing ? 'กำลังเผยแพร่...' : 'เผยแพร่ให้ที่เลือก'}
        </Button>
        <Button variant="outline" onClick={onClose} disabled={publishing}>
          ยกเลิก
        </Button>
      </div>
    </Modal>
  );
}
