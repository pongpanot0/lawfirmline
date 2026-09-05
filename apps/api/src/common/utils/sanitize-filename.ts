export function sanitizeFilenameForHeader(filename: string): string {
  const cleaned = filename.replace(/["\r\n]/g, '');
  return cleaned.length > 0 ? cleaned : 'download';
}
