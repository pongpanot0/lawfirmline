'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { api, AddinCaseSuggestion, CaseListItem, MailboxConnectionItem } from '@/lib/api';
import { getStoredToken } from '@/lib/auth';

const OFFICE_JS_URL = 'https://appsforoffice.microsoft.com/lib/1/hosted/office.js';

interface OfficeMailbox {
  item: { itemId: string; subject: string };
  convertToRestId: (id: string, version: string) => string;
  userProfile: { emailAddress: string };
}
interface OfficeGlobal {
  onReady: (cb: (info: unknown) => void) => void;
  context: { mailbox: OfficeMailbox };
  MailboxEnums: { RestVersion: { v2_0: string } };
}

type Phase = 'loading' | 'no-office' | 'ready';
type Done = { caseId: string; caseTitle: string; alreadyLinked: boolean };

const SEARCH_DEBOUNCE_MS = 300;

function getOffice(): OfficeGlobal | null {
  return (globalThis as unknown as { Office?: OfficeGlobal }).Office ?? null;
}

export default function OutlookAddinPage() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [token, setToken] = useState<string | null>(null);
  const [restId, setRestId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [mailboxEmail, setMailboxEmail] = useState('');
  const [ownMailbox, setOwnMailbox] = useState<MailboxConnectionItem | null | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<AddinCaseSuggestion[]>([]);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CaseListItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Done | null>(null);

  useEffect(() => {
    setToken(getStoredToken());
  }, []);

  const onOfficeLoad = useCallback(() => {
    const office = getOffice();
    if (!office) return setPhase('no-office');
    office.onReady(() => {
      const mailbox = office.context.mailbox;
      setRestId(mailbox.convertToRestId(mailbox.item.itemId, office.MailboxEnums.RestVersion.v2_0));
      setSubject(mailbox.item.subject);
      setMailboxEmail(mailbox.userProfile.emailAddress);
      setPhase('ready');
    });
  }, []);

  // Which Samnuan connection is this Outlook mailbox? Only the caller's own connections count.
  useEffect(() => {
    if (!token || !mailboxEmail) return;
    api
      .getOutlookConnections(token)
      .then((rows) => {
        const match = rows.find((r) => r.mailboxAddress.toLowerCase() === mailboxEmail.toLowerCase());
        setOwnMailbox(match ?? null);
      })
      .catch(() => setOwnMailbox(null));
  }, [token, mailboxEmail]);

  useEffect(() => {
    if (!token || !restId || !ownMailbox) return;
    api
      .addinSuggestCases(token, restId)
      .then(setSuggestions)
      .catch((e: Error) => setError(e.message));
  }, [token, restId, ownMailbox]);

  useEffect(() => {
    if (!token || !ownMailbox) return;
    const q = query.trim();
    if (!q) return setResults([]);
    const timer = setTimeout(() => {
      api
        .getCases(token, { search: q })
        .then((rows) => setResults(rows.slice(0, 8)))
        .catch(() => setResults([]));
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [token, ownMailbox, query]);

  const file = async (caseId: string, caseTitle: string) => {
    if (!token || !restId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await api.addinFileMessage(token, { graphMessageId: restId, caseId });
      setDone({ caseId, caseTitle, alreadyLinked: res.alreadyLinked });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto w-[320px] p-3 text-sm text-slate-800">
      <Script src={OFFICE_JS_URL} strategy="afterInteractive" onLoad={onOfficeLoad} onError={() => setPhase('no-office')} />
      <h1 className="mb-2 text-base font-semibold">ส่งเข้าคดี</h1>

      {phase === 'no-office' && <p className="text-red-700">เปิดหน้านี้จาก Outlook เท่านั้น</p>}
      {phase === 'loading' && <p className="text-slate-500">กำลังโหลด…</p>}

      {phase === 'ready' && !token && (
        <div className="space-y-2">
          <p>กรุณาเข้าสู่ระบบ Samnuan ก่อน</p>
          <Link href="/login" target="_blank" className="inline-block rounded bg-slate-800 px-3 py-1.5 text-white">
            เข้าสู่ระบบ
          </Link>
          <p className="text-xs text-slate-500">เข้าสู่ระบบแล้วกลับมาเปิดปุ่มส่งเข้าคดีอีกครั้ง</p>
        </div>
      )}

      {phase === 'ready' && token && ownMailbox === null && (
        <p className="text-red-700">
          อีเมล {mailboxEmail} ยังไม่ได้เชื่อมต่อกับบัญชี Samnuan ของคุณ — เชื่อมต่อ Microsoft 365 ในหน้าตั้งค่าก่อน
        </p>
      )}

      {phase === 'ready' && token && ownMailbox && !done && (
        <div className="space-y-3">
          <p className="truncate text-xs text-slate-500" title={subject}>
            {subject || '(ไม่มีหัวข้อ)'}
          </p>
          {error && <p className="text-red-700">{error}</p>}

          <section>
            <h2 className="mb-1 font-medium">คดีที่น่าจะเกี่ยวข้อง</h2>
            {suggestions.length === 0 && <p className="text-xs text-slate-500">ไม่พบคดีที่เกี่ยวข้องอัตโนมัติ</p>}
            <ul className="space-y-1">
              {suggestions.map((s) => (
                <CaseRow key={s.caseId} caseId={s.caseId} ownRef={s.ownRef} title={s.title} busy={busy} onFile={file} />
              ))}
            </ul>
          </section>

          <section>
            <h2 className="mb-1 font-medium">ค้นหาคดี</h2>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="เลขคดี หรือชื่อเรื่อง"
              className="w-full rounded border border-slate-300 px-2 py-1"
            />
            <ul className="mt-1 space-y-1">
              {results.map((c) => (
                <CaseRow key={c.id} caseId={c.id} ownRef={c.ownRef} title={c.title} busy={busy} onFile={file} />
              ))}
            </ul>
          </section>
        </div>
      )}

      {done && (
        <div className="space-y-2">
          <p className="font-medium text-green-700">
            {done.alreadyLinked ? 'อีเมลนี้อยู่ในคดีนี้แล้ว' : 'ส่งอีเมลเข้าคดีเรียบร้อย'}
          </p>
          <p className="text-xs text-slate-600">{done.caseTitle}</p>
          <Link href={`/cases/${done.caseId}?tab=email`} target="_blank" className="inline-block text-blue-700 underline">
            เปิดแท็บอีเมลของคดี
          </Link>
        </div>
      )}
    </div>
  );
}

function CaseRow({
  caseId,
  ownRef,
  title,
  busy,
  onFile,
}: {
  caseId: string;
  ownRef: string;
  title: string;
  busy: boolean;
  onFile: (caseId: string, caseTitle: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded border border-slate-200 px-2 py-1">
      <span className="min-w-0">
        <span className="block truncate font-medium">{ownRef}</span>
        <span className="block truncate text-xs text-slate-500">{title}</span>
      </span>
      <button
        type="button"
        disabled={busy}
        onClick={() => onFile(caseId, title)}
        className="shrink-0 rounded bg-slate-800 px-2 py-1 text-xs text-white disabled:opacity-50"
      >
        ส่งเข้าคดีนี้
      </button>
    </li>
  );
}
