export function buildContentDispositionHeader(filename: string): string {
  const asciiSafe = filename.replace(/[^\x20-\x7E]/g, '_').replace(/["\\;]/g, '_');
  const trimmed = asciiSafe.trim() || 'download';
  const encoded = encodeURIComponent(filename).replace(/['()]/g, escape);
  return `attachment; filename="${trimmed}"; filename*=UTF-8''${encoded}`;
}
