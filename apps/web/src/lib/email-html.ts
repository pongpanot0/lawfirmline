/**
 * Email HTML is untrusted. The real boundary is the sandboxed iframe in
 * EmailHtmlFrame (no allow-scripts, no allow-same-origin) plus the CSP below;
 * this strip is defence in depth.
 * ponytail: regex strip, not a parser — entity-obfuscated payloads get past it but still hit the sandbox/CSP; swap for DOMPurify if HTML ever renders outside the sandbox.
 */
const CSP = "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src data:";

export function sanitizeEmailHtml(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script\s*>/gi, '')
    .replace(/<(iframe|object|embed|frameset|frame|noscript)\b[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<\/?(script|iframe|object|embed|frame|frameset|link|meta|base|form|input|button|textarea|select)\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\b(href|src|action|xlink:href)\s*=\s*(["']?)\s*javascript:/gi, '$1=$2#blocked:');
}

export function buildEmailSrcDoc(html: string): string {
  return (
    '<!doctype html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${CSP}">` +
    '<base target="_blank">' +
    '<style>body{font-family:system-ui,sans-serif;font-size:14px;line-height:1.5;margin:8px;overflow-wrap:anywhere;color:#111;background:#fff}img{max-width:100%;height:auto}</style>' +
    `</head><body>${sanitizeEmailHtml(html)}</body></html>`
  );
}
