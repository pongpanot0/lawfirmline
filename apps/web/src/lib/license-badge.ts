const DAY_MS = 24 * 60 * 60 * 1000;
const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
/** พ.ร.บ.ทนายความ ม.39: renewal opens 90 days before expiry. */
const RENEWAL_WINDOW_DAYS = 90;

export type LicenseBadge = { label: string; variant: 'warning' | 'destructive' };

/** Badge for a licence expiry (`YYYY-MM-DD`), compared by Bangkok calendar day; null when nothing to flag. */
export function licenseBadge(expiresAt: string | null, today: Date = new Date()): LicenseBadge | null {
  if (!expiresAt) return null;
  const todayKey = new Date(today.getTime() + BANGKOK_OFFSET_MS).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${expiresAt}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / DAY_MS);
  if (days < 0) return { label: 'หมดอายุ', variant: 'destructive' };
  if (days <= RENEWAL_WINDOW_DAYS) return { label: `ใกล้หมด (${days} วัน)`, variant: 'warning' };
  return null;
}
