/** View helpers for the OneDrive section and the per-document Office buttons (M365 ส่วน D). */
import { formatBytes } from './task-detail.ts';

const OFFICE_EDITABLE = /\.(docx|xlsx|pptx)$/i;

export function isOfficeEditable(filename: string): boolean {
  return OFFICE_EDITABLE.test(filename);
}

export function officeAppName(filename: string): 'Word' | 'Excel' | 'PowerPoint' {
  if (/\.xlsx$/i.test(filename)) return 'Excel';
  if (/\.pptx$/i.test(filename)) return 'PowerPoint';
  return 'Word';
}

export function formatFileSize(bytes: number | null): string {
  return bytes == null ? '' : formatBytes(bytes);
}

/** `13 ต.ค. 15:30` in Bangkok time, whatever the viewer's device zone. */
export function driveDateTime(iso: string): string {
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(iso));
}

/** "แก้ใน Word ล่าสุด …" — only while Office holds edits that were not pulled back yet. */
export function officeEditedHint(
  filename: string,
  link: { lastModifiedDateTime: string | null; hasNewerEdits: boolean } | undefined,
): string | null {
  if (!link?.hasNewerEdits || !link.lastModifiedDateTime) return null;
  return `แก้ใน ${officeAppName(filename)} ล่าสุด ${driveDateTime(link.lastModifiedDateTime)} — ยังไม่ได้ดึงกลับ`;
}

/**
 * Opens the tab synchronously (so popup blockers treat it as the click) and points it at the URL
 * the API returns after its audit/upload. Closes the blank tab again if the call fails.
 */
export async function openInNewTab(load: () => Promise<string>): Promise<void> {
  const tab = window.open('', '_blank');
  if (tab) tab.opener = null;
  try {
    const url = await load();
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
