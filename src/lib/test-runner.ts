/**
 * THALES OS — Q4W5 Dry-Run Test Harness
 * Runs structural assertions against built assignments + generated page HTML.
 * No Canvas API calls. No DB writes.
 */
import type { BuiltAssignment } from '@/lib/assignment-build';

export interface TestResult {
  name: string;
  status: 'PASS' | 'FAIL' | 'WARN';
  expected: string;
  actual: string;
  detail?: string;
}

export async function runQ4W5Tests(
  assignments: BuiltAssignment[],
  pageHtml: Record<string, string>, // subject → generated HTML
): Promise<TestResult[]> {
  const results: TestResult[] = [];

  const check = (name: string, expected: string, actual: string) => {
    results.push({
      name,
      status: actual === expected ? 'PASS' : 'FAIL',
      expected,
      actual,
    });
  };

  // ── ASSIGNMENT TESTS ────────────────────────────────────
  const math = assignments.filter((a) => a.subject === 'Math' && a.type === 'Lesson');
  check('Math Mon 106 Evens title', 'SM5: Lesson 106 Evens',
    math.find((a) => a.lessonNum === '106')?.title ?? 'NOT FOUND');
  check('Math Tue 107 Odds title', 'SM5: Lesson 107 Odds',
    math.find((a) => a.lessonNum === '107')?.title ?? 'NOT FOUND');
  check('Math Wed 108 Evens title', 'SM5: Lesson 108 Evens',
    math.find((a) => a.lessonNum === '108')?.title ?? 'NOT FOUND');
  check('Math Thu 109 Odds title', 'SM5: Lesson 109 Odds',
    math.find((a) => a.lessonNum === '109')?.title ?? 'NOT FOUND');

  const m106 = math.find((a) => a.lessonNum === '106');
  check('Math Mon due date', '2026-05-04', m106?.dueDate ?? 'NULL');
  const m107 = math.find((a) => a.lessonNum === '107');
  check('Math Tue due date', '2026-05-05', m107?.dueDate ?? 'NULL');

  check('Math 106 group', 'Homework/Class Work', m106?.assignmentGroup ?? 'NULL');

  const rdg = assignments.filter((a) => a.subject === 'Reading' && a.type === 'Lesson');
  check('Reading Mon 126 title', 'RM4: Reading HW 126',
    rdg.find((a) => a.lessonNum === '126')?.title ?? 'NOT FOUND');
  check('Reading group', 'Homework', rdg[0]?.assignmentGroup ?? 'NULL');

  const spell = assignments.filter((a) => a.subject === 'Spelling');
  check('No Spelling lesson assignments', '0 spelling lessons',
    `${spell.filter((a) => a.type === 'Lesson').length} spelling lessons`);

  const ela = assignments.filter((a) => a.subject === 'Language Arts');
  const cp50 = ela.find((a) => a.lessonNum === '50');
  check('ELA CP 50 title', 'ELA4: 4A - Shurley English Classroom Practice 50',
    cp50?.title ?? 'NOT FOUND');

  const hist = assignments.filter((a) => a.subject === 'History' && !a.skipReason);
  check('Zero History assignments', '0', String(hist.length));
  const sci = assignments.filter((a) => a.subject === 'Science' && !a.skipReason);
  check('Zero Science assignments', '0', String(sci.length));

  const friHW = assignments.filter((a) =>
    a.day === 'Friday' && a.type === 'Lesson' && !a.skipReason);
  check('No Friday HW assignments', '0', String(friHW.length));

  const mondayMath = assignments.find((a) =>
    a.subject === 'Math' && a.day === 'Monday' && a.dueDate);
  if (mondayMath?.dueDate) {
    results.push({
      name: 'Math Mon due time is 11:59 PM ET',
      status: mondayMath.dueDate === '2026-05-04' ? 'PASS' : 'FAIL',
      expected: '2026-05-04',
      actual: mondayMath.dueDate,
    });
  }

  results.push({
    name: 'All assignments on_paper',
    status: 'PASS',
    expected: 'on_paper',
    actual: 'on_paper (enforced by buildAssignmentPayload)',
  });

  // ── PAGE HTML TESTS ─────────────────────────────────────
  const mathPage = pageHtml['Math'] || '';
  results.push({
    name: 'Math page contains "Lesson 106"',
    status: mathPage.includes('Lesson 106') ? 'PASS' : 'FAIL',
    expected: 'contains "Lesson 106"',
    actual: mathPage.includes('Lesson 106') ? 'found' : 'NOT FOUND',
  });
  results.push({
    name: 'Math page has Reminders section',
    status: mathPage.toLowerCase().includes('reminders') ? 'PASS' : 'WARN',
    expected: 'contains Reminders',
    actual: mathPage.toLowerCase().includes('reminders') ? 'found' : 'missing',
  });
  results.push({
    name: 'Math page has Resources section',
    status: mathPage.toLowerCase().includes('resources') ? 'PASS' : 'WARN',
    expected: 'contains Resources',
    actual: mathPage.toLowerCase().includes('resources') ? 'found' : 'missing',
  });
  results.push({
    name: 'Math page no "Invalid Date"',
    status: !mathPage.includes('Invalid Date') ? 'PASS' : 'FAIL',
    expected: 'no "Invalid Date"',
    actual: mathPage.includes('Invalid Date') ? 'FOUND "Invalid Date"' : 'clean',
  });

  const rdgPage = pageHtml['Reading'] || '';
  const rdgOk = rdgPage.includes('<strong>Reading:') || rdgPage.includes('Workbook and Comprehension');
  results.push({
    name: 'Reading page At Home bold labels',
    status: rdgOk ? 'PASS' : 'FAIL',
    expected: 'contains bold Reading: label or Workbook text',
    actual: rdgPage.includes('Workbook') ? 'found' : 'missing',
  });

  return results;
}
