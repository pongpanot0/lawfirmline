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
    catch { setError('เลิกทำไม่สำเร็จ ลองอีกครั้ง'); }
    finally { setBusy(false); }
  };
  return <div role="status" aria-live="polite">{action && <div className="fixed bottom-4 left-4 right-4 z-50 mx-auto flex max-w-xl items-start gap-3 rounded-lg border bg-card p-4 shadow-lg sm:left-auto">
    <Check aria-hidden="true" className="h-5 w-5 shrink-0 text-success" /><div className="min-w-0 flex-1"><p>{action.message}</p>{action.detail && <p className="text-sm text-muted-foreground">{action.detail}</p>}{error && <p className="text-sm text-destructive">{error}</p>}</div>
    <Button type="button" variant="outline" disabled={busy} onClick={undo}>เลิกทำ</Button><button type="button" aria-label="ปิดข้อความ" className="flex h-11 w-11 shrink-0 items-center justify-center rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={onDismiss}><X aria-hidden="true" className="h-4 w-4" /></button>
  </div>}</div>;
}
