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
}

export const DocumentDropZone = forwardRef<DocumentDropZoneHandle, DocumentDropZoneProps>(
  function DocumentDropZone(
    {
      onFile,
      accept = '.pdf,.docx,.txt,.jpg,.jpeg,.png',
      loading,
      disabled,
      label = 'Drop a document here or click to upload',
      loadingLabel = 'Uploading...',
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
            ? 'cursor-not-allowed border-slate-200 bg-slate-100 opacity-60'
            : `cursor-pointer ${dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'}`
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
        <p className="mt-2 text-sm font-medium text-slate-700">
          {loading ? loadingLabel : label}
        </p>
        <p className="mt-1 text-xs text-slate-400">PDF, DOCX, TXT, images</p>
      </label>
    );
  },
);
