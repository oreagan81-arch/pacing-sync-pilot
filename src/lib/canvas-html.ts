/**
 * THALES OS — Canvas HTML Generator
 * Premium mobile-friendly Canvas Agenda Pages.
 * Uses Canvas RCE-compatible classes and inline styles.
 */

import { applyBrevity } from './assignment-logic';
import { injectFileLinks, injectAssignmentLink, type ContentMapEntry } from './auto-link';
import { COURSE_IDS } from './course-ids';
import { parseResources } from '@/types/thales';

/**
 * THALES OS Brand Palette (verified):
 *   Blue  = #0065a7  (Q1 / Reading family)
 *   Pink  = #c51062  (Reminders accent)
 *   Teal  = #00c0a5  (Resources accent)
 * Pink + Teal are hard-coded below; Blue is supplied via `quarterColor`.
 */

export interface RedirectPageParams {
  thisSubject: 'History' | 'Science';
  activeSubject: 'History' | 'Science';
  weekNum: number;
  quarter: string;
  dateRange: string;
  quarterColor: string;
}

/**
 * Redirect-only Canvas page used when one of History/Science is the
 * "active" subject for the week — the other subject's page tells students
 * to visit the active course instead.
 */
export function generateRedirectPageHtml(params: RedirectPageParams): string {
  const { thisSubject, activeSubject, weekNum, quarter, dateRange, quarterColor } = params;
  const courseId = COURSE_IDS[activeSubject];
  const courseUrl = `https://thalesacademy.instructure.com/courses/${courseId}`;
  return `<div id="kl_wrapper_3" class="kl_circle_left kl_wrapper" style="border-style: none;">
    <div id="kl_banner" class="">
        <h2 class="" style="color: #ffffff; background-color: ${quarterColor}; text-align: center;"><span id="kl_banner_right" class="" style="color: #ffffff; background-color: ${quarterColor};">${thisSubject} \u2014 Weekly Agenda</span></h2>
        <p class="kl_subtitle">${quarter}, Week ${weekNum} | ${dateRange}</p>
    </div>
    <div id="kl_custom_block_0" class="">
        <h3 style="background-color: ${quarterColor}; color: #ffffff; border-color: ${quarterColor};"><i class="fas fa-info" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>This Week</h3>
        <p style="line-height: 1.6;">We are currently in <strong>${activeSubject}</strong>.</p>
        <p style="line-height: 1.6;">Please visit the <a href="${courseUrl}" target="_blank">${activeSubject} Canvas course</a> for this week's agenda.</p>
        <p>&nbsp;</p>
    </div>
</div>`;
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
  /** Optional AI-generated, parent-friendly 2-3 sentence summary rendered just below the banner. */
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
const BLOCK_IDS: Record<string, string> = {
  Monday: 'kl_custom_block_3',
  Tuesday: 'kl_custom_block_4',
  Wednesday: 'kl_custom_block_6',
  Thursday: 'kl_custom_block_2',
  Friday: 'kl_custom_block_1',
};

// "In Class" / "At Home" H4 divider — matches legacy style:
// width 60%, dark #333333 bg, 40px left padding, accent left border in quarter color.
const DIVIDER_STYLE = (color: string) =>
  `color: #ffffff; background-color: #333333; padding: 6px 16px 6px 40px; border-left: 4px solid ${color}; border-width: 0 0 0 4px; width: 60%; max-width: 100%; display: block;`;

const DAY_HEADER_STYLE = (color: string) =>
  `background-color: ${color}; color: #ffffff; border-color: ${color};`;

// Darken a hex color by a given percent (0-100). Used for banner gradients.
function darkenHex(hex: string, pct: number): string {
  const h = hex.replace('#', '');
  const num = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  const amt = Math.round(2.55 * pct);
  const r = Math.max(0, ((num >> 16) & 0xff) - amt);
  const g = Math.max(0, ((num >> 8) & 0xff) - amt);
  const b = Math.max(0, (num & 0xff) - amt);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Banner inline style: solid fallback first (for older RCEs), then gradient layered via background shorthand.
const BANNER_BG_STYLE = (color: string) =>
  `color: #ffffff; background-color: ${color}; background: linear-gradient(135deg, ${color} 0%, ${darkenHex(color, 15)} 100%); text-align: center;`;

function formatLastUpdated(): string {
  const d = new Date();
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Resource line → bulleted, indented <p>. Supports "Label | URL" pipe syntax.
// Each resource gets its own line, prefixed with "•" and indented for readability.
function renderResourceLine(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  // Defensive: if a raw JSON blob ever leaks in, parse it back to friendly lines.
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    const parsed = parseResources(trimmed);
    if (parsed.length > 0) {
      return parsed
        .map((r) =>
          r.url
            ? `        <p style="line-height: 1.5; margin-left: 20px;">• <a href="${r.url}" target="_blank">${r.label || r.url}</a></p>`
            : `        <p style="line-height: 1.5; margin-left: 20px;">• ${r.label}</p>`
        )
        .join('\n');
    }
    // Couldn't parse — drop it rather than show JSON to students.
    return '';
  }
  const pipe = trimmed.split('|').map((s) => s.trim());
  if (pipe.length === 2 && pipe[1].startsWith('http')) {
    return `        <p style="line-height: 1.5; margin-left: 20px;">• <a href="${pipe[1]}" target="_blank">${pipe[0]}</a></p>`;
  }
  if (trimmed.startsWith('http')) {
    const label = trimmed.split('/').pop() || 'Resource';
    return `        <p style="line-height: 1.5; margin-left: 20px;">• <a href="${trimmed}" target="_blank">${label}</a></p>`;
  }
  return `        <p style="line-height: 1.5; margin-left: 20px;">• ${trimmed}</p>`;
}

export function generateCanvasPageHtml(params: CanvasPageParams): string {
  const { subject, rows, quarter, weekNum, dateRange, reminders, resources, quarterColor, contentMap = [], aiSummary } = params;
  const parts: string[] = [];

  // 1. BANNER
  // Brand lock: weekly-agenda banner + day headers are ALWAYS Thales Blue.
  // `quarterColor` is preserved on the params for sub-blocks / redirect pages
  // (History & Science) that legitimately need the quarter accent.
  const MAIN_HEADER_BLUE = '#0065a7';
  parts.push(`<div id="kl_wrapper_3" class="kl_circle_left kl_wrapper" style="border-style: none;">
    <div id="kl_banner" class="">
        <h2 class="" style="${BANNER_BG_STYLE(MAIN_HEADER_BLUE)}"><span id="kl_banner_right" class="" style="color: #ffffff; background-color: ${MAIN_HEADER_BLUE};">${subject} \u2014 Weekly Agenda</span></h2>
        <p class="kl_subtitle">${quarter}, Week ${weekNum} | ${dateRange}</p>
        <p class="kl_subtitle" style="color: #888888; font-size: 0.85em; margin-top: -4px;"><em>Last updated: ${formatLastUpdated()}</em></p>
    </div>`);

  // 1b. AI SUMMARY (parent-friendly preview, just below the banner)
  if (aiSummary && aiSummary.trim()) {
    parts.push(`    <div id="kl_custom_block_ai" style="color:#555; font-style:italic; border-left:3px solid #0065a7; padding-left:12px; margin:8px 0 16px;">${aiSummary.trim()}</div>`);
  }

  // 2. REMINDERS (omit if empty)
  if (reminders && reminders.trim()) {
    const items = reminders.split('\n').filter(Boolean).map(
      (r) => `        <p style="line-height: 1.5;">${r.trim()}</p>`
    ).join('\n');
    parts.push(`    <div id="kl_custom_block_0" class="">
        <h3 class="" style="background-color: #c51062; color: #ffffff; border-color: #c51062;"><i class="fas fa-exclamation" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Reminders</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  // 3. RESOURCES — aggregated from per-day rows + week metadata.
  // Each `resources` field may be EITHER a JSON array (new structured format)
  // OR newline-delimited free text (legacy). We normalize both into "Label | URL"
  // strings (or plain labels) so renderResourceLine never sees raw JSON.
  const allResources: string[] = [];
  const pushUnique = (s: string) => {
    const t = s.trim();
    if (t && !allResources.includes(t)) allResources.push(t);
  };
  const ingest = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
      // Structured JSON → expand to friendly "Label | URL" lines.
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
    const items = allResources.map(renderResourceLine).filter(Boolean).join('\n');
    parts.push(`    <div id="kl_custom_block_5" class="">
        <h3 style="background-color: #00c0a5; color: #ffffff; border-color: #00c0a5;"><i class="fas fa-question" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Resources</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  // 4. DAILY BLOCKS
  for (const day of DAYS_ORDER) {
    const dayRows = rows.filter((r) => r.day === day);
    if (dayRows.length === 0) continue;

    const blockId = BLOCK_IDS[day];
    const row = dayRows[0];

    // No Class / No School
    if (row.type === 'X' || row.type === 'No Class' || row.type === '-') {
      const label = row.type === 'X' ? 'No School' : 'No Class';
      parts.push(`    <div id="${blockId}" class="">
        <h3 class="" style="${DAY_HEADER_STYLE(MAIN_HEADER_BLUE)}"><i class="fas fa-school" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>${day}</h3>
        <p style="line-height: 1.5;"><em>${label}</em></p>
        <p>&nbsp;</p>
    </div>`);
      continue;
    }

    // Build In Class content with auto-linked refs and assignment hyperlink.
    // Empty in_class → muted "Lesson plan TBD" placeholder so the page never has a blank paragraph.
    const rawInClass = (row.in_class || '').trim();
    let brevityText: string;
    if (!rawInClass) {
      brevityText = '<em style="color: #888;">Lesson plan TBD</em>';
    } else {
      brevityText = applyBrevity(row.subject, row.lesson_num, rawInClass);
      brevityText = injectFileLinks(brevityText, contentMap, row.subject);
      brevityText = injectAssignmentLink(brevityText, row.canvas_url);
    }

    // For multiple subjects on the same day (Reading tab merges Reading + Spelling).
    // MERGE RULE: concatenate extra-row lesson text into the SAME <p> as the
    // primary in_class using <br/> so specific lesson strings (e.g. "Lesson 102")
    // are never overwritten or visually separated from the main lesson line.
    const extraRows = dayRows.slice(1);
    const extraInClassFragments = extraRows
      .map((r) => {
        const raw = (r.in_class || '').trim();
        if (!raw) return '<em style="color: #888;">Lesson plan TBD</em>';
        let t = applyBrevity(r.subject, r.lesson_num, raw);
        t = injectFileLinks(t, contentMap, r.subject);
        t = injectAssignmentLink(t, r.canvas_url);
        return t;
      })
      .filter(Boolean);
    if (extraInClassFragments.length > 0) {
      brevityText = `${brevityText}<br/>${extraInClassFragments.join('<br/>')}`;
    }
    const extraInClass = '';

    const isFriday = day === 'Friday';
    // Friday Rule #1: No At Home section on Friday pages — hard block
    const hasAtHome = !isFriday && row.at_home && row.at_home.trim();

    let dayHtml = `    <div id="${blockId}" class="">
        <h3 class="" style="${DAY_HEADER_STYLE(MAIN_HEADER_BLUE)}"><i class="fas fa-school" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>${day}</h3>
        <h4 class="kl_solid_border" style="${DIVIDER_STYLE(MAIN_HEADER_BLUE)}"><strong>In Class</strong></h4>
        <p style="line-height: 1.5;">${brevityText}</p>`;

    if (extraInClass) {
      dayHtml += `\n${extraInClass}`;
    }

    // AT HOME — only if there's homework and it's not Friday.
    // If the row has a deployed assignment URL, wrap the homework text as a
    // clickable link (e.g. "Lesson 102 evens" → opens the Canvas assignment).
    // Otherwise render as plain text.
    if (hasAtHome) {
      let atHomeText = row.at_home!.trim();
      atHomeText = injectFileLinks(atHomeText, contentMap, row.subject);
      if (row.canvas_url) {
        atHomeText = injectAssignmentLink(atHomeText, row.canvas_url);
      }
      dayHtml += `
        <p>&nbsp;</p>
        <h4 class="kl_solid_border" style="${DIVIDER_STYLE(MAIN_HEADER_BLUE)}"><strong>At Home</strong></h4>
        <p style="line-height: 1.5;">${atHomeText}</p>`;
    }

    // Extra rows at-home (e.g. Spelling homework on Reading tab) — merge with
    // <br/> into a single <p> so "Lesson N" strings are preserved verbatim.
    const extraAtHomeFragments: string[] = [];
    for (const er of extraRows) {
      if (!isFriday && er.at_home && er.at_home.trim()) {
        let linked = injectFileLinks(er.at_home.trim(), contentMap, er.subject);
        if (er.canvas_url) linked = injectAssignmentLink(linked, er.canvas_url);
        extraAtHomeFragments.push(linked);
      }
    }
    if (extraAtHomeFragments.length > 0) {
      if (!hasAtHome) {
        dayHtml += `
        <p>&nbsp;</p>
        <h4 class="kl_solid_border" style="${DIVIDER_STYLE(MAIN_HEADER_BLUE)}"><strong>At Home</strong></h4>
        <p style="line-height: 1.5;">${extraAtHomeFragments.join('<br/>')}</p>`;
      } else {
        // Append to the existing At Home <p> via <br/> to preserve "Lesson N" strings.
        dayHtml = dayHtml.replace(
          /(<p style="line-height: 1\.5;">[^<]*<\/p>)(\s*$)/,
          `$1`,
        );
        dayHtml += `<br/>${extraAtHomeFragments.join('<br/>')}`;
      }
    }

    // Friday explicit no-homework note
    if (isFriday) {
      dayHtml += `
        <p>&nbsp;</p>
        <p style="line-height: 1.5;"><em>No homework over the weekend \u2014 enjoy! \ud83c\udf89</em></p>`;
    }

    dayHtml += `
        <p>&nbsp;</p>
    </div>`;

    parts.push(dayHtml);
  }

  // Close wrapper
  parts.push(`</div>`);

  return parts.join('\n');
}

/**
 * Homeroom variant — no daily lesson blocks. Banner + reminders + notes + birthdays + tests + resources.
 */
export function generateHomeroomPageHtml(params: HomeroomPageParams): string {
  const { weekNum, quarter, dateRange, quarterColor, reminders, resources, homeroomNotes, birthdays, upcomingTests } = params;
  const parts: string[] = [];

  parts.push(`<div id="kl_wrapper_3" class="kl_circle_left kl_wrapper" style="border-style: none;">
    <div id="kl_banner" class="">
        <h2 class="" style="${BANNER_BG_STYLE(quarterColor)}"><span id="kl_banner_right" class="" style="color: #ffffff; background-color: ${quarterColor};">Homeroom \u2014 Weekly Update</span></h2>
        <p class="kl_subtitle">${quarter}, Week ${weekNum} | ${dateRange}</p>
        <p class="kl_subtitle" style="color: #888888; font-size: 0.85em; margin-top: -4px;"><em>Last updated: ${formatLastUpdated()}</em></p>
    </div>`);

  // Notes from teacher
  if (homeroomNotes && homeroomNotes.trim()) {
    const noteHtml = homeroomNotes
      .split('\n')
      .filter(Boolean)
      .map((n) => `        <p style="line-height: 1.6;">${n.trim()}</p>`)
      .join('\n');
    parts.push(`    <div id="kl_custom_block_7" class="">
        <h3 style="background-color: ${quarterColor}; color: #ffffff; border-color: ${quarterColor};"><i class="fas fa-comment" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>From Mr. Teacher</h3>
${noteHtml}
        <p>&nbsp;</p>
    </div>`);
  }

  // Reminders
  if (reminders && reminders.trim()) {
    const items = reminders.split('\n').filter(Boolean).map(
      (r) => `        <p style="line-height: 1.5;">${r.trim()}</p>`
    ).join('\n');
    parts.push(`    <div id="kl_custom_block_0" class="">
        <h3 style="background-color: #c51062; color: #ffffff; border-color: #c51062;"><i class="fas fa-exclamation" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Reminders</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  // Upcoming tests
  if (upcomingTests && upcomingTests.length > 0) {
    const items = upcomingTests.map((t) => `        <p style="line-height: 1.5;">${t}</p>`).join('\n');
    parts.push(`    <div id="kl_custom_block_8" class="">
        <h3 style="background-color: #c87800; color: #ffffff; border-color: #c87800;"><i class="fas fa-clipboard-check" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Upcoming Tests</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  // Birthdays
  if (birthdays && birthdays.trim()) {
    parts.push(`    <div id="kl_custom_block_9" class="">
        <h3 style="background-color: #6644bb; color: #ffffff; border-color: #6644bb;"><i class="fas fa-birthday-cake" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Birthdays</h3>
        <p style="line-height: 1.5;">${birthdays.trim()}</p>
        <p>&nbsp;</p>
    </div>`);
  }

  // Resources
  if (resources && resources.trim()) {
    const items = resources.split('\n').filter(Boolean).map(renderResourceLine).filter(Boolean).join('\n');
    parts.push(`    <div id="kl_custom_block_5" class="">
        <h3 style="background-color: #00c0a5; color: #ffffff; border-color: #00c0a5;"><i class="fas fa-question" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Resources</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  parts.push(`</div>`);
  return parts.join('\n');
}
