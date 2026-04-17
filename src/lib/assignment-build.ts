/**
 * THALES OS — Assignment Payload Builder
 * Resolves a pacing cell into a deployable Canvas assignment payload.
 * Encapsulates: prefix lookup, course routing (Together Logic), group/points,
 * Friday + History/Science skip rules, due date mapping, description HTML
 * with auto-linked content_map references.
 */
import type { AppConfig } from './config';
import type { PacingCell } from '@/store/useSystemStore';
import { generateAssignmentTitle, resolveAssignmentGroup } from './assignment-logic';
import { injectFileLinks, type ContentMapEntry } from './auto-link';
import { getCourseId } from './course-ids';
import { isFridayHomeworkBlocked, FRIDAY_SKIP_REASON } from './friday-rules';

export interface BuiltAssignment {
  rowKey: string;
  subject: string;
  day: string;
  dayIndex: number;
  lessonNum: string;
  type: string;
  title: string;
  description: string;
  points: number;
  gradingType: string;
  assignmentGroup: string;
  courseId: number;
  dueDate: string | null; // YYYY-MM-DD
  omitFromFinal: boolean;
  contentHash: string;
  isSynthetic: boolean;
  skipReason: string | null;
}

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

/**
 * SHA-256 hash of canonical assignment fields for change detection.
 */
export async function hashAssignment(parts: {
  title: string;
  description: string;
  points: number;
  group: string;
  dueDate: string | null;
}): Promise<string> {
  const raw = `${parts.title}|${parts.points}|${parts.group}|${parts.dueDate || ''}|${parts.description}`;
  const data = new TextEncoder().encode(raw);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Route subject → Canvas course id, applying Reading+Spelling Together Logic.
 */
export function resolveCourseId(subject: string, _config: AppConfig): number | null {
  // Hardcoded canonical IDs — Spelling routes to Reading via Together Logic
  return getCourseId(subject);
}

function buildDescription(
  subject: string,
  type: string,
  lessonNum: string,
  inClass: string,
  atHome: string,
  contentMap: ContentMapEntry[],
): string {
  const lines: string[] = [];

  if (subject === 'Math') {
    if (type === 'Test') {
      lines.push(`<p>Math Lesson <strong>${lessonNum}</strong> Written Test. Show all work.</p>`);
    } else if (type === 'Fact Test') {
      lines.push(`<p>Math Fact Test <strong>${lessonNum}</strong>. Complete in class.</p>`);
    } else if (type === 'Study Guide') {
      lines.push(`<p>Study Guide for Lesson <strong>${lessonNum}</strong>. Bring to class.</p>`);
    } else {
      const evens = lessonNum && parseInt(lessonNum) % 2 === 0;
      lines.push(`<p>Complete Lesson <strong>${lessonNum}</strong> ${evens ? 'Evens' : 'Odds'}. Show all work.</p>`);
    }
  } else if (subject === 'Reading') {
    lines.push(
      type === 'Test'
        ? `<p>Reading Mastery Test <strong>${lessonNum}</strong>.</p>`
        : `<p>Reading Lesson <strong>${lessonNum}</strong> homework.</p>`,
    );
  } else if (subject === 'Spelling') {
    lines.push(`<p>Spelling Test <strong>${lessonNum}</strong>.</p>`);
  } else if (subject === 'Language Arts') {
    lines.push(
      type === 'Test'
        ? `<p>Shurley English Test.</p>`
        : `<p>Shurley English Classroom Practice <strong>${lessonNum}</strong>.</p>`,
    );
  }

  if (inClass) lines.push(`<p><em>In class:</em> ${inClass}</p>`);
  if (atHome) lines.push(`<p><em>At home:</em> ${atHome}</p>`);

  let html = lines.join('\n');
  html = injectFileLinks(html, contentMap, subject);
  return html;
}

export interface BuildContext {
  config: AppConfig;
  contentMap: ContentMapEntry[];
  weekDates: string[]; // length 5, YYYY-MM-DD per day
}

export async function buildAssignmentForCell(
  subject: string,
  dayIndex: number,
  cell: PacingCell,
  ctx: BuildContext,
  options?: { type?: string; titleOverride?: string; isSynthetic?: boolean; dayOffset?: number },
): Promise<BuiltAssignment | null> {
  const { config, contentMap, weekDates } = ctx;
  const auto = config.autoLogic;
  const lessonNum = cell.lessonNum || '';
  const type = options?.type || (cell.isTest ? 'Test' : 'Lesson');
  const isSynthetic = options?.isSynthetic ?? false;
  const day = DAYS[dayIndex];
  const effectiveDayIndex = dayIndex + (options?.dayOffset ?? 0);
  const dueDate = weekDates[effectiveDayIndex] || null;

  const courseId = resolveCourseId(subject, config);
  if (!courseId) return null;

  const prefix = config.assignmentPrefixes[subject] || '';
  const title = options?.titleOverride || generateAssignmentTitle(subject, type, lessonNum, prefix);
  const groupInfo = resolveAssignmentGroup(subject, type);

  // Skip rules — Friday rule is MANDATORY (not gated by config flag)
  let skipReason: string | null = null;
  if (isFridayHomeworkBlocked(day, type)) {
    skipReason = FRIDAY_SKIP_REASON;
  }
  if (auto?.historyScienceNoAssign && (subject === 'History' || subject === 'Science')) {
    skipReason = `${subject} — no assignments`;
  }
  if (cell.isNoClass) skipReason = 'No class';

  const description = buildDescription(
    subject,
    type,
    lessonNum,
    cell.value || '',
    '',
    contentMap,
  );

  const contentHash = await hashAssignment({
    title,
    description,
    points: groupInfo.points,
    group: groupInfo.groupName,
    dueDate,
  });

  return {
    rowKey: `${subject}_${dayIndex}_${type}_${lessonNum}_${isSynthetic ? 'syn' : 'org'}`,
    subject,
    day,
    dayIndex,
    lessonNum,
    type,
    title,
    description,
    points: groupInfo.points,
    gradingType: groupInfo.gradingType,
    assignmentGroup: groupInfo.groupName,
    courseId,
    dueDate,
    omitFromFinal: groupInfo.omitFromFinal || type === 'Study Guide',
    contentHash,
    isSynthetic,
    skipReason,
  };
}

/**
 * Format YYYY-MM-DD into ET-friendly "Mon, Apr 14 · 11:59 PM ET"
 */
export function formatDueET(date: string | null): string {
  if (!date) return '—';
  try {
    const d = new Date(`${date}T23:59:00-05:00`);
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/New_York',
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    return `${fmt.format(d)} · 11:59 PM ET`;
  } catch {
    return date;
  }
}
