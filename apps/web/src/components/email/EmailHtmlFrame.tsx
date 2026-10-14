'use client';

import { useMemo } from 'react';
import { buildEmailSrcDoc } from '@/lib/email-html';

/**
 * Renders untrusted email HTML. No `allow-scripts` and no `allow-same-origin`:
 * the document runs in an opaque origin with JavaScript off, and the CSP in
 * buildEmailSrcDoc blocks remote images/trackers. Links open in a new tab.
 */
export function EmailHtmlFrame({ html, title }: { html: string; title: string }) {
  const srcDoc = useMemo(() => buildEmailSrcDoc(html), [html]);
  return (
    <iframe
      title={title}
      srcDoc={srcDoc}
      sandbox="allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      className="h-[480px] w-full rounded-md border bg-white"
    />
  );
}
