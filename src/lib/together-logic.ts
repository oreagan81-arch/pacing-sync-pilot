/**
 * THALES OS — Reading + Spelling Together Logic
 *
 * CONTRACT:
 *  - Database: separate pacing_rows for Reading and Spelling (preserved)
 *  - Pages:    ONE shared weekly agenda page deployed to course 21919
 *  - Announcements: ONE shared weekly parent announcement to course 21919
 *  - Assignments: separate Reading + Spelling assignments, both routed to 21919
 */
import { TOGETHER_LOGIC_COURSE_ID, getCourseId } from './course-ids';

export const TOGETHER_SUBJECTS = ['Reading', 'Spelling'] as const;
export type TogetherSubject = (typeof TOGETHER_SUBJECTS)[number];

export const TOGETHER_PAGE_OWNER = 'Reading';
export const TOGETHER_PAGE_TITLE = 'Reading & Spelling';

export function isTogetherSubject(subject: string): subject is TogetherSubject {
  return (TOGETHER_SUBJECTS as readonly string[]).includes(subject);
}

export function getTogetherCourseId(): number {
  return TOGETHER_LOGIC_COURSE_ID;
}

/**
 * Resolve the canvas course id for a subject, applying Together Logic.
 * Spelling always routes to the Reading course.
 */
export function resolveTogetherCourseId(subject: string): number | null {
  if (isTogetherSubject(subject)) return TOGETHER_LOGIC_COURSE_ID;
  return getCourseId(subject);
}

/**
 * Filter rows for the Together page — when activeSubject === 'Reading', returns
 * Reading + Spelling rows so the daily blocks render both lessons together.
 */
export function filterTogetherPageRows<T extends { subject: string }>(
  rows: T[],
  activeSubject: string,
): T[] {
  if (activeSubject === TOGETHER_PAGE_OWNER) {
    return rows.filter((r) => isTogetherSubject(r.subject));
  }
  if (activeSubject === 'Spelling') return []; // Spelling is never a standalone page
  return rows.filter((r) => r.subject === activeSubject);
}

/**
 * Skip Spelling as a standalone page in the deploy iteration loop.
 * Reading page handles both subjects.
 */
export function skipSpellingAsPage(subject: string): boolean {
  return subject === 'Spelling';
}

// ──────────────────────────────────────────────────────────────────────────────
// Spelling Test Rules
//
// Test N covers Lessons 1 .. N×5
// Focus words = words 21 through 25 of the latest covered range
// Full word list = all words from lessons 1..N×5
// ──────────────────────────────────────────────────────────────────────────────

export interface SpellingTestExpansion {
  testNum: number;
  coveredLessons: number[];      // [1, 2, ..., N×5]
  coveredRangeLabel: string;     // "1–N×5"
  focusWords: string[];          // words indexed 21..25 from full bank
  allWords: string[];            // every word from lessons 1..N×5
}

/**
 * Expand a Spelling Test number into its covered lessons + word lists.
 *
 * @param testNum  The test number (1, 2, 3, ...)
 * @param wordBank Map of lesson number (string) → word array (from system_config.spelling_word_bank)
 */
export function expandSpellingTest(
  testNum: number,
  wordBank: Record<string, string[]>,
): SpellingTestExpansion {
  const lastLesson = testNum * 5;
  const coveredLessons: number[] = [];
  const allWords: string[] = [];

  for (let i = 1; i <= lastLesson; i++) {
    coveredLessons.push(i);
    const lessonWords = wordBank[String(i)] || [];
    allWords.push(...lessonWords);
  }

  // Focus words = positions 21..25 of the full cumulative list (1-indexed)
  // Falls back gracefully if the bank is shorter.
  const focusWords = allWords.slice(20, 25);

  return {
    testNum,
    coveredLessons,
    coveredRangeLabel: `1–${lastLesson}`,
    focusWords,
    allWords,
  };
}
