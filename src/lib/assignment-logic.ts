/**
 * THALES OS — Assignment Logic Engine
 * FIX 6: Language Arts CP Rule
 * FIX 8: Spelling Test Only Rule
 */

/**
 * Optional override for auto-derived hints on a row.
 * - 'evens' / 'odds' force the parity suffix on Math HW titles regardless of lesson number parity.
 * - 'none' suppresses the parity suffix entirely (title becomes "HW — Lesson N").
 * - undefined / null falls back to lesson_num parity.
 */
export type HintOverride = 'evens' | 'odds' | 'none' | null | undefined;

export function generateAssignmentTitle(
  subject: string,
  type: string,
  lessonNum: string | null,
  prefix: string,
  hintOverride?: HintOverride,
): string {
  const num = lessonNum || '';

  switch (subject) {
    case 'Math':
      // Canonical 2025-2026 Math title formats:
      //   SM5: Lesson N Evens / Odds / Test / Fact Test / Study Guide / Investigation
      if (type === 'Test') return `${prefix} Lesson ${num} Test`;
      if (type === 'Fact Test') return `${prefix} Lesson ${num} Fact Test`;
      if (type === 'Study Guide') return `${prefix} Lesson ${num} Study Guide`;
      if (type === 'Investigation') return `${prefix} Lesson ${num} Investigation`;
      if (hintOverride === 'none') return `${prefix} Lesson ${num}`;
      if (hintOverride === 'evens') return `${prefix} Lesson ${num} Evens`;
      if (hintOverride === 'odds') return `${prefix} Lesson ${num} Odds`;
      if (num && parseInt(num) % 2 === 0) return `${prefix} Lesson ${num} Evens`;
      return `${prefix} Lesson ${num} Odds`;

    case 'Reading':
      if (type === 'Test') return `${prefix} Mastery Test ${num}`;
      if (type === 'Checkout') return `${prefix} Reading Checkout ${num}`;
      return `${prefix} Reading HW ${num}`;

    case 'Spelling':
      if (type === 'Test') return `${prefix} Spelling Test ${num}`;
      return `${prefix} Spelling ${num}`;

    case 'Language Arts':
      if (type === 'Test') return `${prefix} Shurley Test`;
      if (type === 'CP' || type === 'Classroom Practice') return `${prefix} Classroom Practice ${num}`;
      return `${prefix} English ${num}`;

    default:
      return `${subject} ${type} ${num}`.trim();
  }
}

export interface AssignmentGroupInfo {
  groupName: string;
  points: number;
  gradingType: string;
  omitFromFinal: boolean;
}

export function resolveAssignmentGroup(subject: string, type: string): AssignmentGroupInfo {
  const isTest = type.toLowerCase().includes('test');

  switch (subject) {
    case 'Math':
      if (type === 'Study Guide') return { groupName: 'Homework/Class Work', points: 0, gradingType: 'points', omitFromFinal: true };
      if (type === 'Fact Test') return { groupName: 'Fact Assessments', points: 100, gradingType: 'points', omitFromFinal: false };
      if (isTest) return { groupName: 'Written Assessments', points: 100, gradingType: 'points', omitFromFinal: false };
      return { groupName: 'Homework/Class Work', points: 100, gradingType: 'points', omitFromFinal: false };
    case 'Reading':
      if (isTest) return { groupName: 'Assessments', points: 100, gradingType: 'points', omitFromFinal: false };
      if (type === 'Checkout') return { groupName: 'Check Out', points: 100, gradingType: 'points', omitFromFinal: false };
      return { groupName: 'Homework', points: 100, gradingType: 'points', omitFromFinal: false };
    case 'Language Arts':
      if (isTest) return { groupName: 'Assessments', points: 100, gradingType: 'points', omitFromFinal: false };
      return { groupName: 'Classwork/Homework', points: 100, gradingType: 'points', omitFromFinal: false };
    default:
      return { groupName: 'Assignments', points: 100, gradingType: 'points', omitFromFinal: false };
  }
}

export function applyBrevity(subject: string, lessonNum: string | null, inClass: string): string {
  // Brevity Mandate: strip the verbose "Saxon Math" prefix from any input.
  const stripped = (inClass || '').replace(/saxon\s*math/gi, '').replace(/\s{2,}/g, ' ').trim();

  if (subject === 'Math') return `Lesson ${lessonNum || ''}`.trim();
  if (subject === 'Reading') return `Reading Lesson ${lessonNum || ''}`.trim();
  if (subject === 'Language Arts') {
    const chMatch = stripped.match(/Chapter\s*(\d+)/i);
    const lesMatch = stripped.match(/Lesson\s*(\d+)/i);
    if (chMatch && lesMatch) return `Chapter ${chMatch[1]}, Lesson ${lesMatch[1]}`;
    if (lesMatch) return `Lesson ${lesMatch[1]}`;
  }
  return stripped;
}

export async function computeContentHash(
  subject: string,
  day: string,
  type: string,
  lessonNum: string,
  inClass: string,
  atHome: string
): Promise<string> {
  const raw = `${subject}|${day}|${type}|${lessonNum}|${inClass}|${atHome}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(raw);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getDriveDownloadUrl(fileId: string): string {
  return `https://drive.google.com/uc?export=download&id=${fileId}`;
}

export function getDrivePreviewUrl(fileId: string): string {
  return `https://drive.google.com/file/d/${fileId}/view`;
}

/**
 * Returns true when a Math Investigation row sits on the school day immediately before a Math Test
 * in the same week. Used by the pacing UI to show a "Pre-Test SG will deploy" hint. The actual
 * Study Guide deployment is owned by Math Triple Logic in assignment-build.ts (keyed off the Test
 * row), so no extra build-time work is needed here — this helper is informational only.
 */
const SCHOOL_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
export function isInvestigationBeforeTest(
  day: string,
  rows: Array<{ subject: string; day: string; type: string | null }>,
): boolean {
  const idx = SCHOOL_DAYS.indexOf(day);
  if (idx < 0 || idx >= SCHOOL_DAYS.length - 1) return false;
  const nextDay = SCHOOL_DAYS[idx + 1];
  return rows.some(
    (r) => r.subject === 'Math' && r.day === nextDay && (r.type ?? '').toLowerCase() === 'test',
  );
}
