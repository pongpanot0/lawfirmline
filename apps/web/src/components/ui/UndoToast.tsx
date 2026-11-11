'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

export type UndoAction = { message: string; detail?: string; undo: () => Promise<void> };

export function UndoToast({ action, onDismiss }: { action: UndoAction | null; onDismiss: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const undo = async () => {
    if (!action || busy) return;
    setBusy(true); setError('');
    try { await action.undo(); onDismiss(); }
    catch { setError('เลิกทำไม่สำเร็จ ลองใหม่อีกครั้ง'); }
    finally { setBusy(false); }
  };
  return <div role="status" aria-live="polite">{action && <div className="fixed bottom-6 left-1/2 z-50 flex w-max max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-4 rounded-xl bg-[#142e43] px-5 py-3.5 text-white shadow-2xl">
    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#227052]"><Check aria-hidden="true" className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="font-bold">{action.message}</p>{action.detail && <p className="text-sm text-[#b1bec9]">{action.detail}</p>}{error && <p className="text-sm text-destructive">{error}</p>}</div>
    <Button type="button" variant="outline" className="border-white/40 bg-transparent text-white" disabled={busy} onClick={undo}>เลิกทำ</Button><button type="button" aria-label="ปิดข้อความ" className="flex h-11 w-11 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onDismiss}><X aria-hidden="true" className="h-4 w-4" /></button>
  </div>}</div>;
}
