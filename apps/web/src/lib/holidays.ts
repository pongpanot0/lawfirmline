export interface HolidayInput {
  date: string;
  name: string;
}

/** `YYYY-MM-DD`, then whitespace, comma or tab, then the holiday's name. */
const HOLIDAY_LINE = /^(\d{4}-\d{2}-\d{2})[\s,\t]+(.+)$/;

/**
 * Reads a pasted holiday calendar, one day per line.
 *
 * A malformed line fails the whole paste rather than being skipped: a silently
 * dropped date is a court closure the deadline engine will count straight
 * through, which is exactly the failure this list exists to prevent.
 */
export function parseHolidayLines(text: string): {
  error: string | null;
  holidays: HolidayInput[];
} {
  const holidays: HolidayInput[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = HOLIDAY_LINE.exec(line);
    if (!match) return { error: line, holidays: [] };
    holidays.push({ date: match[1], name: match[2].trim() });
  }
  return { error: null, holidays };
}
