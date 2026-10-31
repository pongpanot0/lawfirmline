import { LICENSE_MILESTONES, LicenseMilestone } from '@lawfirm/shared';
import { bangkokDayKey } from '../common/utils/bangkok-time';

const DAY_MS = 24 * 60 * 60 * 1000;
/** พ.ร.บ.ทนายความ ม.40: late renewal is possible for 60 days after expiry, then the licence lapses. */
const LATE_RENEWAL_DAYS = 60;
const ORDER = (Object.keys(LICENSE_MILESTONES) as LicenseMilestone[]).sort(
  (a, b) => LICENSE_MILESTONES[a] - LICENSE_MILESTONES[b],
);

/** Bangkok calendar days from `today` until `expiresAt` (a @db.Date); negative once expired. */
export function daysToExpiry(expiresAt: Date, today: Date): number {
  const todayUtc = Date.parse(`${bangkokDayKey(today)}T00:00:00.000Z`);
  const expiryUtc = Date.parse(`${expiresAt.toISOString().slice(0, 10)}T00:00:00.000Z`);
  return Math.round((expiryUtc - todayUtc) / DAY_MS);
}

/**
 * The milestone to send today: the latest one already reached, unless it (or a
 * later one) was sent. A missed cron day sends only that latest one, never a
 * backlog. Nothing once the late-renewal window has closed.
 */
export function dueMilestone(expiresAt: Date, today: Date, sent: ReadonlySet<string>): LicenseMilestone | null {
  const dayOffset = -daysToExpiry(expiresAt, today);
  if (dayOffset > LATE_RENEWAL_DAYS) return null;
  const reached = ORDER.filter((m) => LICENSE_MILESTONES[m] <= dayOffset);
  const latest = reached[reached.length - 1];
  if (!latest) return null;
  if (ORDER.slice(ORDER.indexOf(latest)).some((m) => sent.has(m))) return null;
  return latest;
}
