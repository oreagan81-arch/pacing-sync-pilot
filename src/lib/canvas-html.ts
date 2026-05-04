/**
 * THALES OS — Canvas HTML Generator (2025-2026 Guidelines)
 *
 * Strict layout spec:
 *   <h2>Weekly Agenda</h2>
 *   <h2>Reminders</h2>          (omitted if empty)
 *   <h2>Resources</h2>          (the "Grabber" reference block)
 *   <h3>Monday</h3> ... <h3>Friday</h3>
 *     <h4>In Class</h4>
 *     <h4>At Home</h4>          (omitted on Friday — Friday Rule)
 *
 * All inline styles use Tailwind-equivalent utility values (hex + spacing)
 * so the markup renders consistently inside Canvas's RCE without external CSS.
 */

import { injectFileLinks, injectAssignmentLink, type ContentMapEntry } from './auto-link';
import { COURSE_IDS } from './course-ids';
import { parseResources } from '@/types/thales';

// THALES brand palette
const BLUE = '#0065a7';   // Weekly Agenda banner + day headers
const PINK = '#c51062';   // Reminders accent
const TEAL = '#00c0a5';   // Resources accent
const SLATE = '#1f2937';  // h4 dividers (slate-800)
const MUTED = '#6b7280';  // gray-500

// ============================================================================
// TITLE STRIPPING (Rule 3) — strict regex sanitizer
// ============================================================================

/**
 * Clean a raw pacing-guide lesson title down to the canonical short form
 * required by the 2025-2026 Canvas Guidelines.
 *
 * Examples:
 *   "Reading Lesson 133 - The Prince and the Pauper..."   → "Reading Lesson 133"
 *   "Spelling Lesson 62-Introducing Morphographs"          → "Spelling Lesson 62"
 *   "Saxon Math Lesson 78 - Telling Time..."               → "Lesson 78"
 *   "Shurley English Chapter 9, Lesson 8 - Introducing..." → "Chapter 9, Lesson 8"
 *   "Science Unit: Life Cycles... Chapter 1: Animals..."   → "Life Cycles, Traits, & Variations, Chapter 1"
 */
export function stripLessonTitle(raw: string, subject?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();

  // History / Science: "Subject Unit: <Unit Title>... Chapter N: <Chapter Title>..."
  const unitChapter = s.match(
    /^(?:Science|History)\s+Unit:\s*([^.]+?)(?:\.{2,}|\s*\.\s|\s*,\s*)?\s*Chapter\s+(\d+)(?:\s*:\s*[^]*)?$/i,
  );
  if (unitChapter) {
    const unit = unitChapter[1].trim().replace(/[.\s]+$/, '');
    return `${unit}, Chapter ${unitChapter[2]}`;
  }

  // Shurley English: "Shurley English Chapter X, Lesson Y - ..."
  const shurley = s.match(/Chapter\s+(\d+)\s*,\s*Lesson\s+(\d+)/i);
  if (shurley) {
    return `Chapter ${shurley[1]}, Lesson ${shurley[2]}`;
  }

  // Saxon Math: drop the "Saxon Math " prefix → "Lesson N"
  const saxon = s.match(/^Saxon\s+Math\s+(Lesson\s+\d+)/i);
  if (saxon) {
    return saxon[1].replace(/\s+/g, ' ');
  }

  // Reading / Spelling / generic "<Word> Lesson N - ..." or "<Word> Lesson N-..."
  const readingSpelling = s.match(/^([A-Za-z]+)\s+Lesson\s+(\d+)/);
  if (readingSpelling) {
    return `${readingSpelling[1]} Lesson ${readingSpelling[2]}`;
  }

  // Bare "Lesson N - ..." (Math fallback)
  const bareLesson = s.match(/^(Lesson\s+\d+)/i);
  if (bareLesson) {
    return bareLesson[1].replace(/\s+/g, ' ');
  }

  // Default: cut at first " - " or " – " or " — " or "..."
  const cut = s.split(/\s+[-–—]\s+|\.{2,}/)[0].trim();
  return cut || s;
}

// ============================================================================
// Types (preserved)
// ============================================================================

export interface RedirectPageParams {
  thisSubject: 'History' | 'Science';
  activeSubject: 'History' | 'Science';
  weekNum: number;
  quarter: string;
  dateRange: string;
  quarterColor: string;
}

export interface CanvasPageRow {
  day: string;
  type: string | null;
  lesson_num: string | null;
  in_class: string | null;
  at_home: string | null;
  canvas_url: string | null;
  canvas_assignment_id: string | null;
  object_id: string | null;
  subject: string;
  resources: string | null;
}

export interface CanvasPageParams {
  subject: string;
  rows: CanvasPageRow[];
  quarter: string;
  weekNum: number;
  dateRange: string;
  reminders: string;
  resources: string;
  quarterColor: string;
  contentMap?: ContentMapEntry[];
  aiSummary?: string;
}

export interface HomeroomPageParams {
  weekNum: number;
  quarter: string;
  dateRange: string;
  quarterColor: string;
  reminders: string;
  resources: string;
  homeroomNotes?: string;
  birthdays?: string;
  upcomingTests?: string[];
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ============================================================================
// Style helpers (Tailwind-equivalent inline styles)
// ============================================================================

const H2_STYLE = (bg: string) =>
  `background-color: ${bg}; color: #ffffff; padding: 12px 20px; margin: 24px 0 12px; border-radius: 6px; font-size: 1.5rem; font-weight: 700;`;

const H3_DAY_STYLE =
  `background-color: ${BLUE}; color: #ffffff; padding: 10px 18px; margin: 20px 0 10px; border-radius: 6px; font-size: 1.25rem; font-weight: 600;`;

const H4_DIVIDER_STYLE =
  `color: #ffffff; background-color: ${SLATE}; padding: 6px 16px; margin: 12px 0 8px; border-left: 4px solid ${BLUE}; width: 60%; max-width: 100%; display: block; font-size: 1rem; font-weight: 600; border-radius: 3px;`;

const WRAPPER_STYLE =
  `font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #111827; max-width: 900px; margin: 0 auto;`;

const SUBTITLE_STYLE = `color: ${MUTED}; font-size: 0.95rem; margin: -4px 0 16px;`;

const P_STYLE = `line-height: 1.6; margin: 4px 0;`;

const BULLET_STYLE = `line-height: 1.6; margin: 4px 0 4px 20px;`;

function formatLastUpdated(): string {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Resource line → bulleted, indented <p>. Supports "Label | URL" pipe syntax.
function renderResourceLine(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = parseResources(trimmed);
    if (parsed.length > 0) {
      return parsed
        .map((r) =>
          r.url
            ? `    <p style="${BULLET_STYLE}">• <a href="${r.url}" target="_blank" rel="noopener">${r.label || r.url}</a></p>`
            : `    <p style="${BULLET_STYLE}">• ${r.label}</p>`,
        )
        .join('\n');
    }
    return '';
  }
  const pipe = trimmed.split('|').map((s) => s.trim());
  if (pipe.length === 2 && pipe[1].startsWith('http')) {
    return `    <p style="${BULLET_STYLE}">• <a href="${pipe[1]}" target="_blank" rel="noopener">${pipe[0]}</a></p>`;
  }
  if (trimmed.startsWith('http')) {
    const label = trimmed.split('/').pop() || 'Resource';
    return `    <p style="${BULLET_STYLE}">• <a href="${trimmed}" target="_blank" rel="noopener">${label}</a></p>`;
  }
  return `    <p style="${BULLET_STYLE}">• ${trimmed}</p>`;
}

// ============================================================================
// REDIRECT page (History ↔ Science) — kept for back-compat
// ============================================================================

export function generateRedirectPageHtml(params: RedirectPageParams): string {
  const { thisSubject, activeSubject, weekNum, quarter, dateRange } = params;
  const courseId = COURSE_IDS[activeSubject];
  const courseUrl = `https://thalesacademy.instructure.com/courses/${courseId}`;
  return `<div style="${WRAPPER_STYLE}">
  <h2 style="${H2_STYLE(BLUE)}">${thisSubject} — Weekly Agenda</h2>
  <p style="${SUBTITLE_STYLE}">${quarter}, Week ${weekNum} | ${dateRange}</p>
  <h2 style="${H2_STYLE(PINK)}">This Week</h2>
  <p style="${P_STYLE}">We are currently in <strong>${activeSubject}</strong>.</p>
  <p style="${P_STYLE}">Please visit the <a href="${courseUrl}" target="_blank" rel="noopener">${activeSubject} Canvas course</a> for this week's agenda.</p>
</div>`;
}

// ============================================================================
// MAIN GENERATOR — strict 2025-2026 layout
// ============================================================================

export function generateCanvasPageHtml(params: CanvasPageParams): string {
  const { subject, rows, quarter, weekNum, dateRange, reminders, resources, contentMap = [], aiSummary } = params;
  const parts: string[] = [];

  parts.push(`<div style="${WRAPPER_STYLE}">`);

  // 1. WEEKLY AGENDA
  parts.push(`  <h2 style="${H2_STYLE(BLUE)}">${subject} — Weekly Agenda</h2>`);
  parts.push(`  <p style="${SUBTITLE_STYLE}">${quarter}, Week ${weekNum} | ${dateRange}</p>`);
  parts.push(`  <p style="${SUBTITLE_STYLE}"><em>Last updated: ${formatLastUpdated()}</em></p>`);
  if (aiSummary && aiSummary.trim()) {
    parts.push(`  <p style="color: #4b5563; font-style: italic; border-left: 3px solid ${BLUE}; padding-left: 12px; margin: 8px 0 16px;">${aiSummary.trim()}</p>`);
  }

  // 2. REMINDERS
  if (reminders && reminders.trim()) {
    parts.push(`  <h2 style="${H2_STYLE(PINK)}">Reminders</h2>`);
    const items = reminders
      .split('\n')
      .filter(Boolean)
      .map((r) => `  <p style="${P_STYLE}">${r.trim()}</p>`)
      .join('\n');
    parts.push(items);
  }

  // 3. RESOURCES — aggregate from per-day rows + week-level field
  const allResources: string[] = [];
  const pushUnique = (s: string) => {
    const t = s.trim();
    if (t && !allResources.includes(t)) allResources.push(t);
  };
  const ingest = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      for (const r of parseResources(trimmed)) {
        pushUnique(r.url ? `${r.label || r.url} | ${r.url}` : r.label);
      }
      return;
    }
    trimmed.split('\n').filter(Boolean).forEach(pushUnique);
  };
  for (const row of rows) {
    if (row.resources) ingest(row.resources);
  }
  if (resources) ingest(resources);

  if (allResources.length > 0) {
    parts.push(`  <h2 style="${H2_STYLE(TEAL)}">Resources</h2>`);
    parts.push(allResources.map(renderResourceLine).filter(Boolean).join('\n'));
  }

  // 4. DAILY BLOCKS (Monday → Friday)
  for (const day of DAYS_ORDER) {
    const dayRows = rows.filter((r) => r.day === day);
    if (dayRows.length === 0) continue;

    const row = dayRows[0];
    parts.push(`  <h3 style="${H3_DAY_STYLE}">${day}</h3>`);

    // No School / No Class
    if (row.type === 'X' || row.type === 'No Class' || row.type === '-') {
      const label = row.type === 'X' ? 'No School' : 'No Class';
      parts.push(`  <p style="${P_STYLE}"><em>${label}</em></p>`);
      continue;
    }

    const isFriday = day === 'Friday';

    // ---- IN CLASS ----
    parts.push(`  <h4 style="${H4_DIVIDER_STYLE}">In Class</h4>`);
    const inClassFragments: string[] = [];
    for (const r of dayRows) {
      const raw = (r.in_class || '').trim();
      if (!raw) {
        inClassFragments.push('<em style="color: #6b7280;">Lesson plan TBD</em>');
        continue;
      }
      let txt = stripLessonTitle(raw, r.subject);
      txt = injectFileLinks(txt, contentMap, r.subject);
      txt = injectAssignmentLink(txt, r.canvas_url);
      inClassFragments.push(txt);
    }
    parts.push(`  <p style="${P_STYLE}">${inClassFragments.join('<br/>')}</p>`);

    // ---- AT HOME ---- (Friday Rule: never on Friday)
    if (!isFriday) {
      const atHomeFragments: string[] = [];
      for (const r of dayRows) {
        const raw = (r.at_home || '').trim();
        if (!raw) continue;
        let txt = stripLessonTitle(raw, r.subject);
        txt = injectFileLinks(txt, contentMap, r.subject);
        if (r.canvas_url) txt = injectAssignmentLink(txt, r.canvas_url);
        atHomeFragments.push(txt);
      }
      if (atHomeFragments.length > 0) {
        parts.push(`  <h4 style="${H4_DIVIDER_STYLE}">At Home</h4>`);
        parts.push(`  <p style="${P_STYLE}">${atHomeFragments.join('<br/>')}</p>`);
      }
    } else {
      parts.push(`  <p style="${P_STYLE}"><em>No homework over the weekend — enjoy! 🎉</em></p>`);
    }
  }

  parts.push(`</div>`);
  return parts.join('\n');
}

// ============================================================================
// HOMEROOM page — same h2 hierarchy
// ============================================================================

export function generateHomeroomPageHtml(params: HomeroomPageParams): string {
  const { weekNum, quarter, dateRange, reminders, resources, homeroomNotes, birthdays, upcomingTests } = params;
  const parts: string[] = [];

  parts.push(`<div style="${WRAPPER_STYLE}">`);
  parts.push(`  <h2 style="${H2_STYLE(BLUE)}">Homeroom — Weekly Update</h2>`);
  parts.push(`  <p style="${SUBTITLE_STYLE}">${quarter}, Week ${weekNum} | ${dateRange}</p>`);
  parts.push(`  <p style="${SUBTITLE_STYLE}"><em>Last updated: ${formatLastUpdated()}</em></p>`);

  if (homeroomNotes && homeroomNotes.trim()) {
    parts.push(`  <h2 style="${H2_STYLE(BLUE)}">From Mr. Teacher</h2>`);
    parts.push(
      homeroomNotes
        .split('\n')
        .filter(Boolean)
        .map((n) => `  <p style="${P_STYLE}">${n.trim()}</p>`)
        .join('\n'),
    );
  }

  if (reminders && reminders.trim()) {
    parts.push(`  <h2 style="${H2_STYLE(PINK)}">Reminders</h2>`);
    parts.push(
      reminders
        .split('\n')
        .filter(Boolean)
        .map((r) => `  <p style="${P_STYLE}">${r.trim()}</p>`)
        .join('\n'),
    );
  }

  if (upcomingTests && upcomingTests.length > 0) {
    parts.push(`  <h2 style="${H2_STYLE('#c87800')}">Upcoming Tests</h2>`);
    parts.push(upcomingTests.map((t) => `  <p style="${P_STYLE}">${t}</p>`).join('\n'));
  }

  if (birthdays && birthdays.trim()) {
    parts.push(`  <h2 style="${H2_STYLE('#6644bb')}">Birthdays</h2>`);
    parts.push(`  <p style="${P_STYLE}">${birthdays.trim()}</p>`);
  }

  if (resources && resources.trim()) {
    parts.push(`  <h2 style="${H2_STYLE(TEAL)}">Resources</h2>`);
    parts.push(
      resources
        .split('\n')
        .filter(Boolean)
        .map(renderResourceLine)
        .filter(Boolean)
        .join('\n'),
    );
  }

  parts.push(`</div>`);
  return parts.join('\n');
}
