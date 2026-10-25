'use client';

import { useEffect } from 'react';
import { Download, X } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
        role="dialog"
        aria-modal="true"
        aria-label={filename}
        className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <p className="min-w-0 truncate text-sm font-medium text-foreground">{filename}</p>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={handleDownload}>
              <Download className="h-4 w-4" aria-hidden />
              ดาวน์โหลด
            </Button>
            <Button type="button" variant="ghost" size="icon" onClick={onClose} aria-label="ปิดหน้าตัวอย่าง">
              <X className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="min-h-[320px] flex-1 overflow-auto bg-muted p-4">
          {canPreviewInline(mimeType) ? (
            mimeType.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={filename} className="mx-auto max-h-[70vh] object-contain" />
            ) : mimeType === 'application/pdf' ? (
              <iframe src={url} title={filename} className="h-[70vh] w-full rounded-lg border-0 bg-card" />
            ) : (
              <iframe src={url} title={filename} className="h-[70vh] w-full rounded-lg border-0 bg-card" />
            )
          ) : (
            <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
              <p className="text-sm text-muted-foreground">ไม่สามารถแสดงตัวอย่างไฟล์ประเภทนี้ได้</p>
              <Button type="button" onClick={handleDownload}>
                <Download className="h-4 w-4" aria-hidden />
                ดาวน์โหลดไฟล์
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
