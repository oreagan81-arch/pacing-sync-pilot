/**
 * Date utilities — institutional formatting for Thales Academy.
 */

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function parseDate(input: string | Date): Date | null {
  if (input instanceof Date) return isNaN(input.getTime()) ? null : input;
  if (!input) return null;
  const d = new Date(input);
  return isNaN(d.getTime()) ? null : d;
}

/**
 * Format a date range in the full institutional format.
 * Example: "July 12-16, 2026"
 * If months differ: "July 30-August 3, 2026"
 * If years differ: "December 30, 2026-January 3, 2027"
 */
export function formatDateRange(
  start: string | Date,
  end: string | Date,
): string {
  const s = parseDate(start);
  const e = parseDate(end);
  if (!s || !e) return '';

  const sM = MONTHS[s.getMonth()];
  const eM = MONTHS[e.getMonth()];
  const sD = s.getDate();
  const eD = e.getDate();
  const sY = s.getFullYear();
  const eY = e.getFullYear();

  if (sY !== eY) {
    return `${sM} ${sD}, ${sY}-${eM} ${eD}, ${eY}`;
  }
  if (sM !== eM) {
    return `${sM} ${sD}-${eM} ${eD}, ${eY}`;
  }
  return `${sM} ${sD}-${eD}, ${eY}`;
}

export function formatDateLong(input: string | Date): string {
  const d = parseDate(input);
  if (!d) return '';
  return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}
