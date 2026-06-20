'use client';

import { useCallback, useState } from 'react';

interface DocumentDropZoneProps {
  onFile: (file: File) => void;
  accept?: string;
  loading?: boolean;
  label?: string;
}

export function DocumentDropZone({
  onFile,
  accept = '.pdf,.docx,.txt',
  loading,
  label = 'Drop a document here or click to upload',
}: DocumentDropZoneProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile],
  );

  return (
    <label
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors ${
        dragOver ? 'border-brand-500 bg-brand-50' : 'border-slate-300 bg-slate-50 hover:border-brand-400'
      }`}
    >
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={loading}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
        }}
      />
      <span className="text-3xl">📄</span>
      <p className="mt-2 text-sm font-medium text-slate-700">
        {loading ? 'Analyzing document...' : label}
      </p>
      <p className="mt-1 text-xs text-slate-400">PDF, DOCX, TXT — AI analysis costs 5 credits</p>
    </label>
  );
}
