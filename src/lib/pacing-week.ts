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
  9, 10, 11,    // Fall Break
  18,           // Thanksgiving
  21, 22, 23,   // Winter Break
  38, 39, 40,   // Spring Break / Track Out
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

function getQuarterNumber(quarter: number | string): number {
  if (typeof quarter === 'number') return quarter;
  const match = String(quarter).match(/(\d+)/);
  return match ? Number(match[1]) : 1;
}

function resolveAbsoluteWeek(targetIW: number): number {
  let absolute = targetIW;
  for (let i = 0; i < 60; i++) {
    const breaksPassed = BREAK_WEEKS.filter((bw) => bw < absolute).length;
    if (absolute - breaksPassed === targetIW && !BREAK_WEEKS.includes(absolute)) return absolute;
    absolute++;
  }

  return absolute;
}

export function getPacingWeekStartDate(quarter: number | string, weekInQuarter: number): Date {
  const quarterOffset: Record<number, number> = { 1: 0, 2: 9, 3: 18, 4: 27 };
  const quarterNum = getQuarterNumber(quarter);
  const targetIW = (quarterOffset[quarterNum] ?? 0) + weekInQuarter;
  const absolute = resolveAbsoluteWeek(targetIW);
  const start = startOfWeek(parseISO(ACADEMIC_START_DATE), { weekStartsOn: 1 });

  return addDays(start, (absolute - 1) * 7);
}

/** Inverse: given Quarter + WeekInQuarter, resolve the absolute week + Mon date. */
export function pacingWeekFromQW(quarter: number | string, weekInQuarter: number): PacingWeekInfo {
  return calculatePacingWeek(getPacingWeekStartDate(quarter, weekInQuarter));
}

export function getPacingWeekDateRange(quarter: number | string, weekInQuarter: number): string {
  return pacingWeekFromQW(quarter, weekInQuarter).dates;
}

export function getPacingWeekDatesISO(quarter: number | string, weekInQuarter: number): string[] {
  const monday = getPacingWeekStartDate(quarter, weekInQuarter);
  return Array.from({ length: 5 }, (_, i) => format(addDays(monday, i), 'yyyy-MM-dd'));
}

