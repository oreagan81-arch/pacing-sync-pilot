/**
 * THALES OS — Announcement Templates
 * Versioned, testable copy for parent announcements.
 * Together Logic: Reading + Spelling tests render as ONE combined post to course 21919.
 */
import { expandSpellingTest } from './together-logic';

export interface ReadingTestContext {
  lessonNum?: string | null;
  /** Phrases pulled from system_config.auto_logic.readingTestPhrases */
  readingTestPhrases: string[];
}

export interface SpellingTestContext {
  testNum: number;
  wordBank: Record<string, string[]>;
}

export interface CombinedTestContext {
  reading?: ReadingTestContext;
  spelling?: SpellingTestContext;
  /** When supplied, overrides the default headline */
  weekLabel?: string;
}

/**
 * Reading test announcement body. Auto-injects required assessment phrases:
 * tracking and tapping + 100 words per minute.
 */
export function renderReadingTestBody(ctx: ReadingTestContext): string {
  const lessonLine = ctx.lessonNum
    ? `<p>Reading Mastery Test <strong>${ctx.lessonNum}</strong> is coming up.</p>`
    : `<p>A Reading Mastery Test is coming up this week.</p>`;

  const phrases = ctx.readingTestPhrases.length
    ? ctx.readingTestPhrases
    : ['tracking and tapping', '100 words per minute'];

  const phraseList = phrases.map((p) => `<strong>${p}</strong>`).join(' and ');

  return [
    lessonLine,
    `<p>Students will be assessed on ${phraseList}. Please practice nightly.</p>`,
  ].join('\n');
}

/**
 * Spelling test announcement body.
 * Test N covers Lessons 1..N×5. Includes focus words (21–25) and full word list.
 */
export function renderSpellingTestBody(ctx: SpellingTestContext): string {
  const exp = expandSpellingTest(ctx.testNum, ctx.wordBank);
  const focus = exp.focusWords.length
    ? exp.focusWords.join(', ')
    : '(focus words not yet in word bank)';
  const all = exp.allWords.length
    ? exp.allWords.join(', ')
    : '(word bank empty for these lessons)';

  return [
    `<p><strong>Spelling Test ${exp.testNum}</strong> covers Lessons ${exp.coveredRangeLabel}.</p>`,
    `<p><strong>Focus words (21–25):</strong> ${focus}</p>`,
    `<p><strong>Full word list:</strong> ${all}</p>`,
  ].join('\n');
}

/**
 * Combined Reading + Spelling weekly announcement (Together Logic).
 * Returns a single HTML body posted ONCE to course 21919.
 */
export function renderCombinedReadingSpellingBody(ctx: CombinedTestContext): string {
  const sections: string[] = [];

  if (ctx.weekLabel) {
    sections.push(`<h3>${ctx.weekLabel} — Reading &amp; Spelling Update</h3>`);
  }

  if (ctx.reading) {
    sections.push(`<h4>Reading Test</h4>`);
    sections.push(renderReadingTestBody(ctx.reading));
  }
  if (ctx.spelling) {
    sections.push(`<h4>Spelling Test</h4>`);
    sections.push(renderSpellingTestBody(ctx.spelling));
  }

  return sections.join('\n');
}

export function buildCombinedTitle(weekLabel?: string): string {
  return weekLabel
    ? `${weekLabel} — Reading & Spelling Tests`
    : `Reading & Spelling Tests — Reminder`;
}
