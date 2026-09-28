'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { api, ApiError } from '@/lib/api';

/** The case number in the case header — click to edit in place (Enter saves, Esc cancels). */
export function CaseNumberInline({
  caseId,
  ownRef,
  onSaved,
}: {
  caseId: string;
  ownRef: string;
  onSaved: (ownRef: string) => void;
}) {
  const { token } = useAuth();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(ownRef);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const cancel = () => { setEditing(false); setValue(ownRef); setError(''); };

  const save = async () => {
    const next = value.trim();
    if (!token || !next || next === ownRef) return cancel();
    setSaving(true);
    setError('');
    try {
      await api.updateCase(token, caseId, { ownRef: next });
      onSaved(next);
      setEditing(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'บันทึกเลขคดีไม่สำเร็จ');
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        type="button"
        onClick={() => { setValue(ownRef); setEditing(true); }}
        className="inline-flex items-center gap-1 rounded hover:text-primary hover:underline"
        title="แก้เลขคดี"
      >
        {ownRef}
        <Pencil className="h-3 w-3 opacity-60" aria-hidden />
      </button>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <input
        autoFocus
        value={value}
        disabled={saving}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); void save(); }
          if (e.key === 'Escape') cancel();
        }}
        onBlur={() => { if (!saving && !error) void save(); }}
        aria-label="เลขคดี"
        className="w-44 rounded border border-input bg-background px-2 py-0.5 font-mono text-sm text-foreground"
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
