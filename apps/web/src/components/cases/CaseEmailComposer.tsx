'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { SideDrawer } from '@/components/ui/SideDrawer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/lib/auth';
import { publishActionFeedback } from '@/lib/action-feedback';
import { api, type CaseEmailComposeOptions, type DocumentItem, type SendCaseEmailResult } from '@/lib/api';
import {
  appendAddress,
  composeError,
  newSubject,
  parseAddressList,
  replyRecipients,
  replySubject,
  type ReplySourceMessage,
} from '@/lib/case-email-compose';

export type CaseEmailComposerMode =
  | { kind: 'new' }
  | { kind: 'reply'; replyAll: boolean; threadSubject: string; message: ReplySourceMessage };

/**
 * เขียน/ตอบอีเมลจากกล่อง Microsoft 365 ของผู้ใช้เอง — เปิดจากแท็บอีเมลคดี และหน้า thread ที่ผูกคดีแล้ว
 * `mode === null` = ปิด. ส่งจริงหลังกดยืนยันในกล่องสรุปเท่านั้น
 */
export function CaseEmailComposer({
  caseId,
  mode,
  onClose,
  onSent,
}: {
  caseId: string;
  mode: CaseEmailComposerMode | null;
  onClose: () => void;
  onSent?: (result: SendCaseEmailResult) => void;
}) {
  const { token } = useAuth();
  const [options, setOptions] = useState<CaseEmailComposeOptions | null>(null);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [toText, setToText] = useState('');
  const [ccText, setCcText] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const requestKey = useRef('');
  const inFlight = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const confirmingRef = useRef(false);
  confirmingRef.current = confirming;
  const closeDrawer = useCallback(() => {
    if (inFlight.current) return;
    if (confirmingRef.current) {
      setConfirming(false);
      return;
    }
    onCloseRef.current();
  }, []);

  useEffect(() => {
    if (!mode || !token) return;
    let cancelled = false;
    setOptions(null);
    setError('');
    setBody('');
    setDocumentIds([]);
    setConfirming(false);
    requestKey.current = '';
    Promise.all([api.getCaseEmailComposeOptions(token, caseId), api.getDocuments(token, caseId)])
      .then(([loaded, docs]) => {
        if (cancelled) return;
        setOptions(loaded);
        setDocuments(docs);
        if (mode.kind === 'reply') {
          const prefill = replyRecipients(mode.message, mode.replyAll, loaded.mailboxAddress);
          setToText(prefill.to.join(', '));
          setCcText(prefill.cc.join(', '));
          setSubject(replySubject(mode.threadSubject));
        } else {
          setToText('');
          setCcText('');
          setSubject(newSubject(loaded.ownRef));
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'โหลดข้อมูลไม่สำเร็จ');
      });
    return () => {
      cancelled = true;
    };
  }, [mode, token, caseId]);

  const to = parseAddressList(toText);
  const cc = parseAddressList(ccText);
  const attached = documents.filter((d) => documentIds.includes(d.id));

  const review = () => {
    const problem = composeError({ to, cc, subject, body });
    setError(problem ?? '');
    if (!problem) setConfirming(true);
  };

  const send = async () => {
    if (!token || !mode || inFlight.current) return;
    inFlight.current = true;
    setSending(true);
    setError('');
    if (!requestKey.current) requestKey.current = crypto.randomUUID();
    try {
      const result = await api.sendCaseEmail(token, caseId, {
        to,
        cc,
        subject: subject.trim(),
        body,
        documentIds,
        ...(mode.kind === 'reply' ? { replyToMessageId: mode.message.id, replyAll: mode.replyAll } : {}),
        clientRequestId: requestKey.current,
      });
      requestKey.current = '';
      publishActionFeedback(
        'success',
        (result.recorded ? 'ส่งอีเมลแล้ว' : 'ส่งอีเมลแล้ว แต่บันทึกเข้าแท็บอีเมลไม่สำเร็จ — ดูได้ใน Sent Items ของ Outlook') +
          (result.mode === 'REPLY_AS_NEW' ? ' (ส่งเป็นอีเมลใหม่ ไม่อยู่ใน conversation เดิม)' : ''),
      );
      setConfirming(false);
      onSent?.(result);
      onClose();
    } catch (err) {
      setConfirming(false);
      setError(err instanceof Error ? err.message : 'ส่งอีเมลไม่สำเร็จ');
    } finally {
      inFlight.current = false;
      setSending(false);
    }
  };

  const connect = async () => {
    if (!token) return;
    try {
      const { url } = await api.getOutlookConnectUrl(token);
      window.location.assign(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'เชื่อมต่อ Microsoft 365 ไม่สำเร็จ');
    }
  };

  const title = mode?.kind === 'reply' ? (mode.replyAll ? 'ตอบกลับทั้งหมด' : 'ตอบกลับ') : 'เขียนอีเมล';

  return (
    <SideDrawer open={!!mode} title={title} onClose={closeDrawer}>
      {!options && !error && <p className="text-sm text-muted-foreground">กำลังโหลด…</p>}
      {!options && error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

      {options && !options.mailboxAddress && (
        <div className="space-y-3 rounded-lg border border-dashed p-4 text-sm">
          <p>ส่งอีเมลจากระบบได้เมื่อเชื่อมต่อกล่องจดหมาย Microsoft 365 ของคุณเองก่อน อีเมลจะออกจากชื่อคุณและอยู่ใน Sent Items ของ Outlook</p>
          <Button onClick={() => void connect()}>เชื่อมต่อ Microsoft 365</Button>
        </div>
      )}

      {options?.mailboxAddress && confirming && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">ยืนยันการส่งอีเมล</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">จาก</dt>
              <dd>{options?.mailboxAddress}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ถึง ({to.length})</dt>
              <dd className="break-all">{to.join(', ')}</dd>
            </div>
            {cc.length > 0 && (
              <div>
                <dt className="text-muted-foreground">สำเนา ({cc.length})</dt>
                <dd className="break-all">{cc.join(', ')}</dd>
              </div>
            )}
            <div>
              <dt className="text-muted-foreground">หัวเรื่อง</dt>
              <dd>{subject}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ไฟล์แนบ ({attached.length})</dt>
              <dd>{attached.length ? attached.map((d) => d.filename).join(', ') : 'ไม่มี'}</dd>
            </div>
          </dl>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirming(false)} disabled={sending}>
              กลับไปแก้
            </Button>
            <Button onClick={() => void send()} disabled={sending}>
              {sending ? 'กำลังส่ง…' : 'ส่งอีเมล'}
            </Button>
          </div>
        </div>
      )}

      {options?.mailboxAddress && !confirming && (
        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">ส่งจาก: {options.mailboxAddress}</p>

          <label className="block space-y-1 text-sm">
            <span className="font-medium">ถึง</span>
            <Input value={toText} onChange={(e) => setToText(e.target.value)} placeholder="อีเมล คั่นด้วย , หรือ ;" />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">สำเนา (CC)</span>
            <Input value={ccText} onChange={(e) => setCcText(e.target.value)} placeholder="ไม่บังคับ" />
          </label>

          {options.recipients.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">ผู้ติดต่อในคดี</p>
              <ul className="max-h-40 space-y-1 overflow-y-auto text-sm">
                {options.recipients.map((r) => (
                  <li key={r.email} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {r.name} &lt;{r.email}&gt; <span className="text-xs text-muted-foreground">· {r.group}</span>
                    </span>
                    <span className="flex shrink-0 gap-1">
                      <Button type="button" size="sm" variant="outline" onClick={() => setToText((p) => appendAddress(p, r.email))}>
                        ถึง
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => setCcText((p) => appendAddress(p, r.email))}>
                        สำเนา
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <label className="block space-y-1 text-sm">
            <span className="font-medium">หัวเรื่อง</span>
            <Input value={subject} maxLength={255} onChange={(e) => setSubject(e.target.value)} />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium">ข้อความ</span>
            <Textarea rows={10} maxLength={20000} value={body} onChange={(e) => setBody(e.target.value)} />
          </label>

          {documents.length > 0 && (
            <fieldset className="space-y-1">
              <legend className="text-sm font-medium">แนบเอกสารคดี</legend>
              <p className="text-xs text-muted-foreground">ไฟล์ละไม่เกิน 3 MB — ไฟล์ใหญ่กว่านั้นให้ส่งเป็นลิงก์ OneDrive</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {documents.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={documentIds.includes(d.id)}
                      onChange={(e) =>
                        setDocumentIds((ids) => (e.target.checked ? [...ids, d.id] : ids.filter((id) => id !== d.id)))
                      }
                    />
                    <Paperclip className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{d.filename}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={closeDrawer} disabled={sending}>
              ยกเลิก
            </Button>
            <Button onClick={review} disabled={sending}>
              ตรวจทานก่อนส่ง
            </Button>
          </div>
        </div>
      )}

    </SideDrawer>
  );
}
