'use client';

import { useEffect } from 'react';
import { Download, X } from 'lucide-react';

function canPreviewInline(mimeType: string) {
  return (
    mimeType === 'application/pdf'
    || mimeType.startsWith('image/')
    || mimeType.startsWith('text/')
  );
}

interface DocumentPreviewModalProps {
  filename: string;
  mimeType: string;
  url: string;
  onClose: () => void;
}

export function DocumentPreviewModal({
  filename,
  mimeType,
  url,
  onClose,
}: DocumentPreviewModalProps) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-medium text-slate-900">{filename}</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleDownload}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              Download
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 hover:bg-slate-100"
              aria-label="Close preview"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="min-h-[320px] flex-1 overflow-auto bg-slate-50 p-4">
          {canPreviewInline(mimeType) ? (
            mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={filename} className="mx-auto max-h-[70vh] object-contain" />
            ) : mimeType === 'application/pdf' ? (
              <iframe src={url} title={filename} className="h-[70vh] w-full rounded-lg border-0 bg-white" />
            ) : (
              <iframe src={url} title={filename} className="h-[70vh] w-full rounded-lg border-0 bg-white" />
            )
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-slate-600">Preview is not available for this file type.</p>
              <button
                type="button"
                onClick={handleDownload}
                className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
              >
                <Download className="h-4 w-4" />
                Download file
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
