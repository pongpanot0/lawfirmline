/**
 * Every place that charges or advertises AI credits reads from here, so the
 * price on a button is the price the server takes. Three distinct services:
 *
 * - DOCUMENT_ANALYSIS: reads the files themselves (summary, key dates).
 * - PRECEDENT_ANALYSIS: assesses an intake and searches precedents.
 * - DRAFT_NOTICE: drafts a notice letter for an intake.
 */
export const AI_CREDIT_COST = {
  DOCUMENT_ANALYSIS: 5,
  PRECEDENT_ANALYSIS: 10,
  DRAFT_NOTICE: 5,
} as const;

/** MIME types document analysis can read. */
export const DOCUMENT_ANALYSIS_MIME_TYPES = ['application/pdf', 'text/plain'] as const;
/** MIME types an intake attachment may have (they follow the case later). */
export const INTAKE_ATTACHMENT_MIME_TYPES = ['application/pdf'] as const;
/** Per-file size cap shared by both uploads. */
export const AI_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const AI_UPLOAD_MAX_FILES = 10;
