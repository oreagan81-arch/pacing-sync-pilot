// Curated domain type surface for Thales OS.
// Single import point: `import type { Subject, BuiltAssignment } from '@/types/thales'`.

export type { BuiltAssignment, BuildContext } from '@/lib/assignment-build';
export type { AssignmentGroupInfo } from '@/lib/assignment-logic';

export type Subject =
  | 'Math'
  | 'Reading'
  | 'Spelling'
  | 'Language Arts'
  | 'History'
  | 'Science'
  | 'Homeroom';

export type Day = 'Monday' | 'Tuesday' | 'Wednesday' | 'Thursday' | 'Friday';

/**
 * Structured resource entry for a pacing cell.
 * `label` is the friendly name shown to students.
 * `url` is optional — when present, renders as a clickable/downloadable link.
 */
export interface Resource {
  label: string;
  url?: string;
}

/**
 * Parse a stored resources string into Resource[].
 * - Tries JSON first (new format).
 * - Falls back to single { label } entry (legacy free-text rows, including "a,b,c").
 * Returns [] for empty/null.
 */
export function parseResources(raw: string | null | undefined): Resource[] {
  if (!raw) return [];
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed
          .filter((r) => r && typeof r === 'object' && typeof r.label === 'string')
          .map((r) => ({ label: r.label, url: typeof r.url === 'string' && r.url ? r.url : undefined }));
      }
    } catch {
      /* fall through to legacy */
    }
  }
  // Legacy: single string blob → one resource entry, label only.
  return [{ label: trimmed }];
}

/**
 * Serialize Resource[] for DB storage. Empty list → null (clears the column).
 * Preserves rows that have EITHER a label OR a url so in-progress edits
 * (e.g. a freshly-added empty row in the editor) survive a round-trip.
 */
export function serializeResources(list: Resource[]): string | null {
  const cleaned = list.filter((r) => (r.label ?? '').trim() || (r.url ?? '').trim());
  if (cleaned.length === 0) return null;
  return JSON.stringify(
    cleaned.map((r) => ({
      label: (r.label ?? '').trim(),
      ...((r.url ?? '').trim() ? { url: (r.url ?? '').trim() } : {}),
    })),
  );
}

export type AssignmentType =
  | 'Lesson'
  | 'CP'
  | 'Classroom Practice'
  | 'Test'
  | 'Study Guide'
  | 'Fact Test'
  | 'Review';

export interface PacingRow {
  id: string;
  week_id: string | null;
  subject: Subject | string;
  day: Day | string;
  type: string | null;
  lesson_num: string | null;
  in_class: string | null;
  at_home: string | null;
  resources: string | null;
  create_assign: boolean | null;
  is_synthetic: boolean;
  parent_row_id: string | null;
  deploy_status: string | null;
  canvas_url: string | null;
  canvas_assignment_id: string | null;
}

export interface AnnouncementDraft {
  id: string;
  title: string | null;
  content: string | null;
  subject: Subject | string | null;
  type: string | null;
  course_id: number | null;
  status: 'DRAFT' | 'SCHEDULED' | 'POSTED' | 'ERROR' | string | null;
  scheduled_post: string | null;
  posted_at: string | null;
  week_id: string | null;
}

export interface MemoryHit {
  source: 'memory' | 'template' | 'ai';
  count: number;
}

/**
 * Tailwind text + border + bg classes for subject color-coding.
 * Math=orange, Reading=blue, ELA=green, Science=purple, History=navy, Homeroom=gray.
 * Spelling shares Reading's blue (Together Logic).
 */
export function subjectColor(subject: string | null | undefined): {
  text: string;
  bg: string;
  border: string;
  chip: string;
} {
  const map: Record<string, { text: string; bg: string; border: string; chip: string }> = {
    Math:            { text: 'text-orange-300',  bg: 'bg-orange-500/10',  border: 'border-orange-500/40',  chip: 'bg-orange-500/15 text-orange-300 border-orange-500/40' },
    Reading:         { text: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/40',    chip: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
    Spelling:        { text: 'text-blue-300',    bg: 'bg-blue-500/10',    border: 'border-blue-500/40',    chip: 'bg-blue-500/15 text-blue-300 border-blue-500/40' },
    'Language Arts': { text: 'text-emerald-300', bg: 'bg-emerald-500/10', border: 'border-emerald-500/40', chip: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40' },
    Science:         { text: 'text-purple-300',  bg: 'bg-purple-500/10',  border: 'border-purple-500/40',  chip: 'bg-purple-500/15 text-purple-300 border-purple-500/40' },
    History:         { text: 'text-indigo-300',  bg: 'bg-indigo-500/10',  border: 'border-indigo-500/40',  chip: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/40' },
    Homeroom:        { text: 'text-slate-300',   bg: 'bg-slate-500/10',   border: 'border-slate-500/40',   chip: 'bg-slate-500/15 text-slate-300 border-slate-500/40' },
  };
  return map[subject || ''] || { text: 'text-muted-foreground', bg: 'bg-muted/30', border: 'border-border', chip: 'bg-muted text-muted-foreground border-border' };
}
