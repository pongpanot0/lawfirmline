'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { useDashboardT } from '@/components/landing/LocaleProvider';

interface OnHoldResumeButtonProps {
  token: string;
  caseId: string | null;
  taskId: string;
  onResumed: () => void;
}

export function OnHoldResumeButton({
  token,
  caseId,
  taskId,
  onResumed,
}: OnHoldResumeButtonProps) {
  const d = useDashboardT();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!caseId) {
    return (
      <span className="text-xs text-muted-foreground">
        {d.operations.resumeTaskUnavailable}
      </span>
    );
  }

  const handleResume = async () => {
    setLoading(true);
    setError(null);
    try {
      await api.resumeTaskFromOnHold(token, caseId, taskId);
      onResumed();
    } catch {
      setError(d.operations.resumeTaskError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        className="rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50"
        onClick={handleResume}
        disabled={loading}
      >
        {loading ? d.operations.resumeTaskLoading : d.operations.resumeTask}
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
