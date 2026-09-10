'use client';

import { forwardRef, useCallback, useImperativeHandle, useRef, useState } from 'react';
import { Upload } from 'lucide-react';

export interface DocumentDropZoneHandle {
  open: () => void;
}

interface DocumentDropZoneProps {
  /** Single-file callback (kept for existing callers). Ignored when `onFiles` is set. */
  onFile?: (file: File) => void;
  /** Multi-file callback — use with `multiple`. */
  onFiles?: (files: File[]) => void;
  accept?: string;
  multiple?: boolean;
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
      onFiles,
      accept = '.pdf,.docx,.txt,.jpg,.jpeg,.png',
      multiple = false,
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

    const deliver = useCallback(
      (list: FileList | File[]) => {
        const files = Array.from(list);
        if (!files.length || disabled || loading) return;
        if (onFiles) {
          onFiles(multiple ? files : files.slice(0, 1));
          return;
        }
        if (onFile && files[0]) onFile(files[0]);
      },
      [disabled, loading, multiple, onFile, onFiles],
    );

    const handleDrop = useCallback(
      (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        deliver(e.dataTransfer.files);
      },
      [deliver],
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
          multiple={multiple}
          className="hidden"
          disabled={inactive}
          onChange={(e) => {
            if (e.target.files?.length) deliver(e.target.files);
            e.target.value = '';
          }}
        />
        <Upload className="h-8 w-8 text-muted-foreground" aria-hidden />
        <p className="mt-2 text-sm font-medium text-foreground">
          {loading ? loadingLabel : label}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
      </label>
    );
  },
);
