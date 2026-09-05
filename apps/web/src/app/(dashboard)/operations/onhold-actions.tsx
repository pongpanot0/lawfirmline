'use client';

import { useState } from 'react';
import { api } from '@/lib/api';

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
  const [loading, setLoading] = useState(false);

  if (!caseId) {
    return (
      <span className="text-xs text-muted-foreground">
        จัดการงานนี้ผ่านหน้ารายการงานของฉัน
      </span>
    );
  }

  const handleResume = async () => {
    setLoading(true);
    try {
      await api.resumeTaskFromOnHold(token, caseId, taskId);
      onResumed();
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      className="rounded bg-green-600 px-3 py-1 text-xs text-white disabled:opacity-50"
      onClick={handleResume}
      disabled={loading}
    >
      {loading ? 'กำลังดำเนินการ...' : 'เคลียร์ On hold'}
    </button>
  );
}
