/**
 * THALES OS — Friday Rules (Mandatory)
 * Single source of truth for Friday behavior:
 *  1. No "At Home" section on Friday pages
 *  2. No assignment creation on Friday (except Tests)
 *  3. create_assign defaults to false on Friday rows
 *  4. Exception: scheduled reminder announcements may post Friday 4 PM ET
 */

export const FRIDAY = 'Friday' as const;

export function isFriday(day: string | null | undefined): boolean {
  return day === FRIDAY;
}

/** Homework is blocked on Friday for all types except Test. */
export function isFridayHomeworkBlocked(day: string, type: string | null | undefined): boolean {
  return isFriday(day) && (type ?? '') !== 'Test';
}

/** Always omit At Home content on Friday. */
export function shouldOmitAtHome(day: string): boolean {
  return isFriday(day);
}

/** Default value for create_assign given a day + type. False on Friday unless Test. */
export function shouldDefaultCreateAssign(day: string, type: string | null | undefined): boolean {
  if (isFriday(day) && (type ?? '') !== 'Test') return false;
  return true;
}

export const FRIDAY_SKIP_REASON = 'Friday — no homework';
export const FRIDAY_AT_HOME_HELPER = 'Friday — no At Home content';
