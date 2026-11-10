/** MIME types document analysis can read. */
export const DOCUMENT_ANALYSIS_MIME_TYPES = ['application/pdf', 'text/plain'] as const;
/** MIME types an intake attachment may have (they follow the case later). */
export const INTAKE_ATTACHMENT_MIME_TYPES = ['application/pdf'] as const;
/** Per-file size cap shared by both uploads. */
export const AI_UPLOAD_MAX_BYTES = 30 * 1024 * 1024;
export const AI_UPLOAD_MAX_FILES = 10;
