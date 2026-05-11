/**
 * THALES OS — Pre-Deploy Validator
 * Runs 6 safety checks before any Canvas deploy is approved.
 * Each check returns 'pass' | 'warn' | 'fail' so the modal can render
 * a red/amber/green status. Failures should block deploy; warnings allow override.
 */
import { z } from 'zod';
import type { BuiltAssignment } from './assignment-build';
import type { ContentMapEntry } from './auto-link';
import { isFriday } from './friday-rules';
import { isNoSchoolDay, getEventForDate, type CalendarEvent } from './school-calendar';

/* ============================================================
 * Zod schema — strict validation for Canvas deploy payloads.
 * Blocks malformed data before it ever hits Canvas.
 * ============================================================ */

const dayEntrySchema = z
  .object({
    inClass: z.string().optional(),
    lesson: z.string().optional(),
    atHome: z.string().optional(),
    homework: z.string().optional(),
    atHomeUrl: z.string().url('atHomeUrl must be a valid URL').optional(),
  })
  .passthrough();

export const canvasPayloadSchema = z.object({
  subject: z.string().min(1, 'subject is required'),
  weekLabel: z.string().min(1, 'weekLabel is required'),
  dateRange: z.string().min(1, 'dateRange is required'),
  days: z.record(z.string(), dayEntrySchema),
});

export type CanvasPayload = z.infer<typeof canvasPayloadSchema>;

export interface CanvasPayloadValidation {
  ok: boolean;
  data?: CanvasPayload;
  errors?: string[];
}

/**
 * Validate a Canvas deploy payload. Returns `{ ok: false, errors }` on
 * malformed input so the caller can block the deployment. Never throws.
 */
export function validateCanvasPayload(input: unknown): CanvasPayloadValidation {
  const parsed = canvasPayloadSchema.safeParse(input);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  const errors = parsed.error.issues.map(
    (i) => `${i.path.join('.') || '<root>'}: ${i.message}`,
  );
  return { ok: false, errors };
}

export type CheckLevel = 'pass' | 'warn' | 'fail';

export interface ValidationCheck {
  id: string;
  label: string;
  level: CheckLevel;
  detail: string;
  items?: string[];
}

export interface ValidatorInput {
  /** Assignments selected for deploy */
  assignments: BuiltAssignment[];
  /** Content map for missing-file detection */
  contentMap: ContentMapEntry[];
  /** Optional: pages being deployed alongside */
  pages?: { title: string; isFrontPage?: boolean; published?: boolean }[];
  /** Optional: school calendar events for no-school day conflict detection */
  calendarEvents?: CalendarEvent[];
}

export interface ValidationResult {
  checks: ValidationCheck[];
  hasFailures: boolean;
  hasWarnings: boolean;
}

/** Page-only courses — these MUST NEVER receive assignments. */
const PAGE_ONLY_COURSES = new Set<number>([21934, 21970]);

/** Simplified result shape used by callers that only need pass/fail. */
export interface SimpleValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

const LESSON_REF_PATTERN = /\b(?:L|SG|Lesson\s+|Test\s+|Fact Test\s+)\d+\b/gi;

/**
 * Run all 6 pre-deploy checks. Returns results + aggregate flags.
 * NOTE: Checks are advisory by default — `fail` should disable approve button,
 * `warn` should require explicit acknowledgement.
 *
 * HARD BLOCK: any assignment routed to a page-only course (History 21934 /
 * Science 21970) is unconditionally rejected before the 6 checks run.
 */
export function validateDeployment(input: ValidatorInput): ValidationResult {
  const hardBlock = checkPageOnlyCourses(input.assignments);
  const checks: ValidationCheck[] = [
    ...(hardBlock ? [hardBlock] : []),
    checkMissingFiles(input.assignments, input.contentMap),
    checkFridayViolations(input.assignments),
    checkDuplicates(input.assignments),
    checkTitleConventions(input.assignments),
    checkMissingStudyGuides(input.assignments),
    checkFrontPageSettings(input.pages ?? []),
    checkSchoolCalendar(input.assignments, input.calendarEvents ?? []),
  ];

  return {
    checks,
    hasFailures: checks.some((c) => c.level === 'fail'),
    hasWarnings: checks.some((c) => c.level === 'warn'),
  };
}

/**
 * Convenience wrapper returning the simplified `{ valid, errors, warnings }`
 * shape required by the deployment gate. Any failing check blocks deploy.
 */
export function validate(input: ValidatorInput): SimpleValidationResult {
  const { checks } = validateDeployment(input);
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const c of checks) {
    if (c.level === 'fail') {
      errors.push(`${c.label}: ${c.detail}`);
      if (c.items) errors.push(...c.items.map((i) => `  - ${i}`));
    } else if (c.level === 'warn') {
      warnings.push(`${c.label}: ${c.detail}`);
      if (c.items) warnings.push(...c.items.map((i) => `  - ${i}`));
    }
  }
  return { valid: errors.length === 0, errors, warnings };
}

/**
 * 0. HARD BLOCK — History (21934) and Science (21970) are page-only courses.
 * Any assignment object routed to these courses is an immediate fail.
 */
function checkPageOnlyCourses(assignments: BuiltAssignment[]): ValidationCheck | null {
  const offenders = assignments.filter(
    (a) => !a.skipReason && PAGE_ONLY_COURSES.has(a.courseId),
  );
  if (offenders.length === 0) return null;
  return {
    id: 'page-only-courses',
    label: 'Page-only course violation',
    level: 'fail',
    detail: `${offenders.length} assignment(s) routed to History/Science (page-only courses).`,
    items: offenders.map((a) => `${a.subject} → course ${a.courseId}: ${a.title}`),
  };
}

/**
 * 1. Missing files — references in assignment descriptions that have no
 * matching content_map entry with a canvas_url.
 */
function checkMissingFiles(
  assignments: BuiltAssignment[],
  contentMap: ContentMapEntry[],
): ValidationCheck {
  const knownRefs = new Set(
    contentMap.filter((e) => e.canvas_url).map((e) => e.lesson_ref.toLowerCase()),
  );
  const missing = new Set<string>();

  for (const a of assignments) {
    if (a.skipReason) continue;
    const matches = a.description.match(LESSON_REF_PATTERN) ?? [];
    for (const m of matches) {
      const normalized = m.replace(/\s+/g, '').toLowerCase();
      if (!knownRefs.has(normalized) && !knownRefs.has(m.toLowerCase())) {
        missing.add(`${a.subject} ${a.title}: ${m}`);
      }
    }
  }

  if (missing.size === 0) {
    return {
      id: 'missing-files',
      label: 'Missing files',
      level: 'pass',
      detail: 'All referenced lessons resolve to Canvas files.',
    };
  }
  return {
    id: 'missing-files',
    label: 'Missing files',
    level: 'warn',
    detail: `${missing.size} lesson reference(s) have no Canvas file mapping.`,
    items: Array.from(missing).slice(0, 10),
  };
}

/**
 * 2. Friday violations — homework on Friday that is not a Test.
 * This should never happen (3-layer enforcement), but we check anyway
 * as a defense-in-depth canary.
 */
function checkFridayViolations(assignments: BuiltAssignment[]): ValidationCheck {
  const violations = assignments.filter(
    (a) => isFriday(a.day) && a.type !== 'Test' && !a.skipReason,
  );
  if (violations.length === 0) {
    return {
      id: 'friday-rules',
      label: 'Friday rule',
      level: 'pass',
      detail: 'No homework assignments scheduled for Friday.',
    };
  }
  return {
    id: 'friday-rules',
    label: 'Friday rule',
    level: 'fail',
    detail: `${violations.length} non-Test assignment(s) scheduled for Friday.`,
    items: violations.map((a) => `${a.subject}: ${a.title}`),
  };
}

/**
 * 3. Duplicate assignments — same subject+day+title queued twice.
 * Synthetic siblings (Math Triple) have distinct types so they don't collide.
 */
function checkDuplicates(assignments: BuiltAssignment[]): ValidationCheck {
  const seen = new Map<string, number>();
  for (const a of assignments) {
    if (a.skipReason) continue;
    const key = `${a.subject}|${a.day}|${a.title}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  const dupes = Array.from(seen.entries()).filter(([, n]) => n > 1);
  if (dupes.length === 0) {
    return {
      id: 'duplicates',
      label: 'Duplicate detection',
      level: 'pass',
      detail: 'No duplicate assignments in the deploy queue.',
    };
  }
  return {
    id: 'duplicates',
    label: 'Duplicate detection',
    level: 'fail',
    detail: `${dupes.length} duplicate assignment(s) detected.`,
    items: dupes.map(([k, n]) => `${k} (×${n})`),
  };
}

/**
 * 4. Title conventions — required prefixes per subject (SM5:, ELA4:, RM4:).
 */
function checkTitleConventions(assignments: BuiltAssignment[]): ValidationCheck {
  const expectedPrefix: Record<string, string> = {
    Math: 'SM5:',
    'Language Arts': 'ELA4:',
    Reading: 'RM4:',
    Spelling: 'RM4:',
  };
  const wrong: string[] = [];
  for (const a of assignments) {
    if (a.skipReason) continue;
    const prefix = expectedPrefix[a.subject];
    if (prefix && !a.title.startsWith(prefix)) {
      wrong.push(`${a.subject}: "${a.title}" missing ${prefix}`);
    }
  }
  if (wrong.length === 0) {
    return {
      id: 'titles',
      label: 'Title conventions',
      level: 'pass',
      detail: 'All assignment titles follow subject prefix rules.',
    };
  }
  return {
    id: 'titles',
    label: 'Title conventions',
    level: 'warn',
    detail: `${wrong.length} title(s) missing subject prefix.`,
    items: wrong,
  };
}

/**
 * 5. Missing Study Guides — every Math Test must have a paired Study Guide
 * in the same deploy batch (Math Triple Logic).
 */
function checkMissingStudyGuides(assignments: BuiltAssignment[]): ValidationCheck {
  const mathTests = assignments.filter(
    (a) => a.subject === 'Math' && a.type === 'Test' && !a.skipReason,
  );
  const studyGuides = new Set(
    assignments
      .filter((a) => a.subject === 'Math' && a.type === 'Study Guide' && !a.skipReason)
      .map((a) => a.lessonNum),
  );
  const missing = mathTests.filter((t) => !studyGuides.has(t.lessonNum));
  if (mathTests.length === 0) {
    return {
      id: 'study-guides',
      label: 'Math Study Guides',
      level: 'pass',
      detail: 'No Math tests in this deploy batch.',
    };
  }
  if (missing.length === 0) {
    return {
      id: 'study-guides',
      label: 'Math Study Guides',
      level: 'pass',
      detail: `All ${mathTests.length} Math test(s) have paired Study Guide.`,
    };
  }
  return {
    id: 'study-guides',
    label: 'Math Study Guides',
    level: 'fail',
    detail: `${missing.length} Math test(s) missing Study Guide.`,
    items: missing.map((t) => `${t.title} (Lesson ${t.lessonNum})`),
  };
}

/**
 * 6. Front page settings — any front page deploy MUST have published: true
 * (Canvas requires this on PUT or the page silently 422s).
 */
function checkFrontPageSettings(
  pages: { title: string; isFrontPage?: boolean; published?: boolean }[],
): ValidationCheck {
  const fronts = pages.filter((p) => p.isFrontPage);
  if (fronts.length === 0) {
    return {
      id: 'front-page',
      label: 'Front page settings',
      level: 'pass',
      detail: 'No front pages in this deploy batch.',
    };
  }
  const unpublished = fronts.filter((p) => p.published === false);
  if (unpublished.length === 0) {
    return {
      id: 'front-page',
      label: 'Front page settings',
      level: 'pass',
      detail: `All ${fronts.length} front page(s) marked published.`,
    };
  }
  return {
    id: 'front-page',
    label: 'Front page settings',
    level: 'fail',
    detail: `${unpublished.length} front page(s) missing published flag.`,
    items: unpublished.map((p) => p.title),
  };
}

/**
 * 7. School Calendar conflicts — assignments due on holidays, track-out days,
 * or no-school days. Warning level (informational) until calendar is fully seeded.
 */
function checkSchoolCalendar(
  assignments: BuiltAssignment[],
  calendarEvents: CalendarEvent[],
): ValidationCheck {
  if (calendarEvents.length === 0) {
    return {
      id: 'school-calendar',
      label: 'School Calendar Conflict',
      level: 'pass',
      detail: 'School calendar not loaded — skipping check.',
    };
  }
  const conflicts: string[] = [];
  for (const a of assignments) {
    if (a.skipReason || !a.dueDate) continue;
    if (isNoSchoolDay(a.dueDate, calendarEvents)) {
      const event = getEventForDate(a.dueDate, calendarEvents);
      conflicts.push(`${a.title} due on ${a.dueDate} (${event?.label ?? 'no school'})`);
    }
  }
  if (conflicts.length === 0) {
    return {
      id: 'school-calendar',
      label: 'School Calendar Conflict',
      level: 'pass',
      detail: 'No assignments fall on no-school days.',
    };
  }
  return {
    id: 'school-calendar',
    label: 'School Calendar Conflict',
    level: 'warn',
    detail: `${conflicts.length} assignment(s) due on no-school days.`,
    items: conflicts.slice(0, 10),
  };
}
