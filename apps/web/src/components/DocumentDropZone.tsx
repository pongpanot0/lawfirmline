'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';

export interface DocumentDropZoneHandle {
  open: () => void;
}

interface DocumentDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  loading?: boolean;
  disabled?: boolean;
  label?: string;
  loadingLabel?: string;
  hint?: string;
}

export const DocumentDropZone = forwardRef<DocumentDropZoneHandle, DocumentDropZoneProps>(
  function DocumentDropZone(
    {
      onFile,
      accept = '.pdf,.docx,.txt,.jpg,.jpeg,.png',
      loading,
      disabled,
      label = 'ลากไฟล์มาวาง หรือคลิกที่นี่',
      loadingLabel = 'กำลังอัปโหลด...',
      hint = 'PDF, DOCX, TXT, รูปภาพ',
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [dragOver, setDragOver] = useState(false);

    useImperativeHandle(ref, () => ({
      open: () => {
        if (!disabled && !loading) inputRef.current?.click();
      },
    }));

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files[0];
        if (file && !disabled && !loading) onFile(file);
      },
      [disabled, loading, onFile],
    );

    const inactive = disabled || loading;

    return (
      <label
        onDragOver={(e) => {
          if (inactive) return;
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={(e) => {
          if (inactive) {
            e.preventDefault();
          }
        }}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
          inactive
            ? 'cursor-not-allowed border-border bg-muted opacity-60'
            : `cursor-pointer ${dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/40 hover:border-primary/60'}`
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          disabled={inactive}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
            e.target.value = '';
          }}
        />
        <span className="text-3xl">📄</span>
        <p className="mt-2 text-sm font-medium text-foreground">
          {loading ? loadingLabel : label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </label>
    );
  },
);
