'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { EmailHtmlFrame } from './EmailHtmlFrame';
import { emailPreview, senderInitials, splitQuotedHtml, splitQuotedText } from '@/lib/email-quote';
import { formatDateTime } from '@/lib/utils';

export interface EmailMessageView {
  direction: 'INBOUND' | 'OUTBOUND';
  fromName: string | null;
  fromAddress: string | null;
  toAddresses?: string[];
  ccAddresses?: string[];
  bodyText: string | null;
  bodyHtml?: string | null;
  receivedAt: string;
}

/**
 * One message in an Outlook-style conversation: older messages collapse to a
 * one-line preview, and quoted history sits behind "แสดงข้อความก่อนหน้า".
 */
export function EmailMessageCard({
  message,
  subject,
  defaultExpanded,
  children,
}: {
  message: EmailMessageView;
  subject: string;
  defaultExpanded: boolean;
  children?: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showQuoted, setShowQuoted] = useState(false);
  const sender = message.fromName ?? message.fromAddress ?? 'ไม่ทราบผู้ส่ง';
  const html = useMemo(() => (message.bodyHtml ? splitQuotedHtml(message.bodyHtml) : null), [message.bodyHtml]);
  const text = useMemo(() => splitQuotedText(message.bodyText ?? ''), [message.bodyText]);
  const quoted = html ? html.quoted : text.quoted;

  const avatar = (
    <span
      aria-hidden
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
        message.direction === 'OUTBOUND' ? 'bg-primary/15 text-primary' : 'bg-muted text-foreground'
      }`}
    >
      {senderInitials(message.fromName, message.fromAddress)}
    </span>
  );

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        aria-expanded={false}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg border px-3 py-2 text-left hover:bg-muted/40"
      >
        {avatar}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{sender}</span>
          <span className="block truncate text-xs text-muted-foreground">{emailPreview(message.bodyText) || '(ไม่มีเนื้อหา)'}</span>
        </span>
        <span className="shrink-0 text-xs text-muted-foreground">{formatDateTime(message.receivedAt)}</span>
      </button>
    );
  }

  return (
    <article className="space-y-3 rounded-lg border p-3">
      <header className="flex items-start gap-3">
        {avatar}
        <div className="min-w-0 flex-1 text-xs text-muted-foreground">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <p className="min-w-0 truncate">
              <span className="text-sm font-semibold text-foreground">{sender}</span>
              {message.fromName && message.fromAddress && <span> &lt;{message.fromAddress}&gt;</span>}
            </p>
            <time dateTime={message.receivedAt} className="shrink-0">
              {formatDateTime(message.receivedAt)}
            </time>
          </div>
          {message.toAddresses && message.toAddresses.length > 0 && <p className="break-words">ถึง: {message.toAddresses.join('; ')}</p>}
          {message.ccAddresses && message.ccAddresses.length > 0 && <p className="break-words">สำเนา: {message.ccAddresses.join('; ')}</p>}
        </div>
        {!defaultExpanded && (
          <button
            type="button"
            onClick={() => setExpanded(false)}
            aria-label="ย่ออีเมลนี้"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted sm:h-8 sm:w-8"
          >
            <ChevronUp className="h-4 w-4" aria-hidden />
          </button>
        )}
      </header>

      {html ? (
        <EmailHtmlFrame html={showQuoted ? message.bodyHtml! : html.main} title={`เนื้อหาอีเมล: ${subject} — ${sender} ${formatDateTime(message.receivedAt)}`} />
      ) : (
        <div className="whitespace-pre-wrap break-words text-sm">
          {text.main}
          {showQuoted && text.quoted && <div className="mt-3 border-l-2 pl-3 text-muted-foreground">{text.quoted}</div>}
        </div>
      )}

      {quoted && (
        <button
          type="button"
          onClick={() => setShowQuoted((v) => !v)}
          aria-expanded={showQuoted}
          className="inline-flex min-h-11 items-center gap-1 rounded-md border px-2.5 text-xs text-muted-foreground hover:bg-muted sm:min-h-8"
        >
          {showQuoted ? <ChevronUp className="h-3.5 w-3.5" aria-hidden /> : <ChevronDown className="h-3.5 w-3.5" aria-hidden />}
          {showQuoted ? 'ซ่อนข้อความก่อนหน้า' : 'แสดงข้อความก่อนหน้า'}
        </button>
      )}

      {children}
    </article>
  );
}
