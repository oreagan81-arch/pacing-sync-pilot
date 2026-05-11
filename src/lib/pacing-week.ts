import {
  addDays,
  differenceInCalendarWeeks,
  format,
  parseISO,
  startOfWeek,
} from 'date-fns';

/**
 * THALES ACADEMIC OS — Instructional Week Logic
 *
 * Absolute calendar weeks include breaks (Fall, Thanksgiving, Winter, Spring).
 * Instructional weeks skip these breaks to maintain curriculum pacing.
 *
 * Single source of truth for `weekId` generation (e.g. Q4_W6 ≡ Instructional Week 33).
 */

const ACADEMIC_START_DATE = '2025-07-21';

// Absolute week indices (1-based) reserved as breaks
const BREAK_WEEKS = [
  9, 10, 11,   // Fall Break
  18,          // Thanksgiving
  21, 22, 23,  // Winter Break
  33, 34, 35,  // Spring Break
];

export interface PacingWeekInfo {
  activeWeekNumber: number;
  quarter: number;
  weekInQuarter: number;
  weekId: string;
  /** "May 11 - May 15, 2026" — Monday through Friday */
  dates: string;
  isBreak: boolean;
  absoluteWeekNum: number;
}

/** Compute the active instructional week and Mon–Fri date range. */
export function calculatePacingWeek(targetDate: Date = new Date()): PacingWeekInfo {
  const start = startOfWeek(parseISO(ACADEMIC_START_DATE), { weekStartsOn: 1 });
  const current = startOfWeek(targetDate, { weekStartsOn: 1 });

  const absoluteWeekNum = differenceInCalendarWeeks(current, start) + 1;
  const breaksPassed = BREAK_WEEKS.filter((bw) => bw < absoluteWeekNum).length;
  const activeWeekNumber = absoluteWeekNum - breaksPassed;

  let quarter = 1;
  let weekInQuarter = activeWeekNumber;

  if (activeWeekNumber > 27) {
    quarter = 4;
    weekInQuarter = activeWeekNumber - 27;
  } else if (activeWeekNumber > 18) {
    quarter = 3;
    weekInQuarter = activeWeekNumber - 18;
  } else if (activeWeekNumber > 9) {
    quarter = 2;
    weekInQuarter = activeWeekNumber - 9;
  }

  const friday = addDays(current, 4);

  return {
    activeWeekNumber,
    quarter,
    weekInQuarter,
    weekId: `Q${quarter}_W${weekInQuarter}`,
    dates: `${format(current, 'MMM d')} - ${format(friday, 'MMM d, yyyy')}`,
    isBreak: BREAK_WEEKS.includes(absoluteWeekNum),
    absoluteWeekNum,
  };
}

export function isOperationalWeek(targetDate: Date = new Date()): boolean {
  return !calculatePacingWeek(targetDate).isBreak;
}
