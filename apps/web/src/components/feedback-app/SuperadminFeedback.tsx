'use client';
import { useState } from 'react';
import { FeedbackList } from './FeedbackList';
import { FeedbackPages } from './FeedbackPages';
import { FeedbackLineRounds } from './FeedbackLineRounds';

export function SuperadminFeedback({
  token,
  open,
  refreshSummary,
}: {
  token: string;
  open: number | null;
  refreshSummary: () => void;
}) {
  const [tab, setTab] = useState<'list' | 'pages' | 'line'>('list');
  return (
    <>
      <div className="mb-6 flex w-full border-b border-border">
        {(
          [
            ['list', 'รายการ'],
            ['pages', 'สรุปรายหน้า'],
            ['line', 'รอบ LINE'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            aria-pressed={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 basis-0 border-b-2 p-4 text-sm font-semibold focus-visible:ring-2 focus-visible:ring-ring
              ${tab === id ? 'border-primary bg-muted' : 'border-transparent'}`}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'list' ? (
        <FeedbackList token={token} open={open} refreshSummary={refreshSummary} />
      ) : tab === 'pages' ? (
        <FeedbackPages token={token} />
      ) : (
        <FeedbackLineRounds token={token} />
      )}
    </>
  );
}
