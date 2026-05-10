/**
 * THALES OS — Canvas HTML Generator (KL / DesignPLUS template)
 *
 * Outputs HTML matching the live Thales Kaltura (KL) page template.
 * stripLessonTitle, renderResourceLine, parseResources, injectFileLinks,
 * injectAssignmentLink are unchanged. Only HTML string output of
 * generateCanvasPageHtml / generateHomeroomPageHtml / generateRedirectPageHtml
 * has been rewritten to the canonical KL structure.
 */

import { injectFileLinks, injectAssignmentLink, type ContentMapEntry } from './auto-link';
import { COURSE_IDS, getCourseId } from './course-ids';
import { parseResources } from '@/types/thales';

// ============================================================================
// CANONICAL KL STYLES
// ============================================================================

const KL_WRAPPER = `id="kl_wrapper_3" class="kl_circle_left kl_wrapper" style="border-style: none;"`;
const KL_BANNER_H2 = `class="" style="color: #ffffff; background-color: #0065a7; text-align: center;"`;
const KL_BANNER_SPAN = `id="kl_banner_right" class="" style="color: #ffffff; background-color: #0065a7;"`;
const KL_SUBTITLE = `class="kl_subtitle"`;
const KL_REMINDERS_H3 = `class="" style="background-color: #c51062; color: #ffffff; border-color: #c51062;"`;
const KL_RESOURCES_H3 = `style="background-color: #00c0a5; color: #ffffff; border-color: #00c0a5;"`;
const KL_DAY_H3 = `class="" style="background-color: #0065a7; color: #ffffff; border-color: #0065a7;"`;
const KL_H4 = `class="kl_solid_border" style="color: #ffffff; background-color: #333333; padding-left: 40px; border-width: 0px; width: 60%;"`;
const KL_ICON_EXCLAIM = `<i class="fas fa-exclamation" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>`;
const KL_ICON_QUESTION = `<i class="fas fa-question" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>`;
const KL_ICON_SCHOOL = `<i class="fas fa-school" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>`;

// Day block IDs in canonical KL order: Mon, Tue, Wed, Thu, Fri
const DAY_BLOCK_IDS: Record<string, string> = {
  Monday: 'kl_custom_block_3',
  Tuesday: 'kl_custom_block_4',
  Wednesday: 'kl_custom_block_6',
  Thursday: 'kl_custom_block_2',
  Friday: 'kl_custom_block_1',
};

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];

// ============================================================================
// TITLE STRIPPING — unchanged
// ============================================================================

export function stripLessonTitle(raw: string, subject?: string): string {
  if (!raw) return '';
  const s = String(raw).trim();

  const unitChapter = s.match(
    /^(?:Science|History)\s+Unit:\s*([^.]+?)(?:\.{2,}|\s*\.\s|\s*,\s*)?\s*Chapter\s+(\d+)(?:\s*:\s*[^]*)?$/i,
  );
  if (unitChapter) {
    const unit = unitChapter[1].trim().replace(/[.\s]+$/, '');
    return `${unit}, Chapter ${unitChapter[2]}`;
  }

  const shurley = s.match(/Chapter\s+(\d+)\s*,\s*Lesson\s+(\d+)/i);
  if (shurley) return `Chapter ${shurley[1]}, Lesson ${shurley[2]}`;

  const saxon = s.match(/^Saxon\s+Math\s+(Lesson\s+\d+)/i);
  if (saxon) return saxon[1].replace(/\s+/g, ' ');

  const readingSpelling = s.match(/^([A-Za-z]+)\s+Lesson\s+(\d+)/);
  if (readingSpelling) return `${readingSpelling[1]} Lesson ${readingSpelling[2]}`;

  const bareLesson = s.match(/^(Lesson\s+\d+)/i);
  if (bareLesson) return bareLesson[1].replace(/\s+/g, ' ');

  const cut = s.split(/\s+[-–—]\s+|\.{2,}/)[0].trim();
  return cut || s;
}

// ============================================================================
// Types — preserved
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

// ============================================================================
// Helpers
// ============================================================================

function subjectBannerTitle(subject: string): string {
  if (subject === 'Reading' || subject === 'Spelling') return 'Reading &amp; Spelling — Weekly Agenda';
  return 'Weekly Agenda';
}

function atHomeLabel(subject: string): string {
  return subject === 'Math' ? 'Homework' : 'At Home';
}

interface ParsedResource {
  label: string;
  url: string | null;
}

function parseResourceLine(raw: string): ParsedResource[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    return parseResources(trimmed).map((r) => ({ label: r.label || r.url || '', url: r.url || null }));
  }
  const pipe = trimmed.split('|').map((s) => s.trim());
  if (pipe.length === 2 && /^https?:\/\//i.test(pipe[1])) {
    return [{ label: pipe[0], url: pipe[1] }];
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return [{ label: trimmed.split('/').pop() || 'Resource', url: trimmed }];
  }
  return [{ label: trimmed, url: null }];
}

// Resource line as KL Canvas file link (or bold label fallback).
function renderResourceLine(raw: string): string {
  return parseResourceLine(raw)
    .map((r) => {
      if (!r.url) return `      <p><strong>${r.label}</strong></p>`;
      // Build data-api-endpoint by injecting /api/v1/courses/COURSE/ before /files/
      const apiEndpoint = r.url.replace(
        /^(https?:\/\/[^/]+)\/courses\/(\d+)\/files\//,
        '$1/api/v1/courses/$2/files/',
      );
      return `      <p><a class="instructure_file_link instructure_scribd_file inline_disabled" title="${r.label}" href="${r.url}?wrap=1" target="_blank" rel="noopener" data-api-endpoint="${apiEndpoint}" data-api-returntype="File">${r.label}</a></p>`;
    })
    .join('\n');
}

// ============================================================================
// REDIRECT page (History ↔ Science)
// ============================================================================

export function generateRedirectPageHtml(params: RedirectPageParams): string {
  const { thisSubject, activeSubject, weekNum, quarter, dateRange } = params;
  const courseId = COURSE_IDS[activeSubject];
  const courseUrl = `https://thalesacademy.instructure.com/courses/${courseId}`;
  return `<div ${KL_WRAPPER}>
  <div id="kl_banner" class="">
    <h2 ${KL_BANNER_H2}><span ${KL_BANNER_SPAN}>${thisSubject} — Weekly Agenda</span></h2>
    <p ${KL_SUBTITLE}>${quarter}, Week ${weekNum} | ${dateRange}</p>
  </div>
  <div id="kl_custom_block_1" class="">
    <p>We are currently in <strong>${activeSubject}</strong>.</p>
    <p>Please visit the <a href="${courseUrl}" target="_blank" rel="noopener">${activeSubject} Canvas course</a> for this week's agenda.</p>
  </div>
</div>`;
}

// ============================================================================
// MAIN GENERATOR — KL template
// ============================================================================

export function generateCanvasPageHtml(params: CanvasPageParams): string {
  const { subject, rows, quarter, weekNum, dateRange, reminders, resources, contentMap = [] } = params;
  const parts: string[] = [];

  parts.push(`<div ${KL_WRAPPER}>`);

  // ---- BANNER ----
  parts.push(`  <div id="kl_banner" class="">`);
  parts.push(`    <h2 ${KL_BANNER_H2}><span ${KL_BANNER_SPAN}>${subjectBannerTitle(subject)}</span></h2>`);
  parts.push(`    <p ${KL_SUBTITLE}>${quarter}, Week ${weekNum} | ${dateRange}</p>`);
  parts.push(`  </div>`);

  // ---- REMINDERS HEADER (always rendered to match live KL pages) ----
  parts.push(`  <div id="kl_custom_block_0" class="">`);
  parts.push(`    <h3 ${KL_REMINDERS_H3}>${KL_ICON_EXCLAIM}Reminders</h3>`);
  parts.push(`  </div>`);

  // ---- OUTER CONTENT WRAPPER (kl_custom_block_1) ----
  parts.push(`  <div id="kl_custom_block_1" class="">`);

  // Reminders body
  parts.push(`    <div id="kl_custom_block_0" class="">`);
  if (reminders && reminders.trim()) {
    for (const line of reminders.split('\n').map((l) => l.trim()).filter(Boolean)) {
      parts.push(`      <p>${line}</p>`);
    }
  }
  parts.push(`      <p>&nbsp;</p>`);
  parts.push(`    </div>`);

  // ---- RESOURCES (aggregate per-day + week-level) ----
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
    parts.push(`    <div id="kl_custom_block_5" class="">`);
    parts.push(`      <h3 ${KL_RESOURCES_H3}>${KL_ICON_QUESTION}Resources&nbsp;</h3>`);
    parts.push(allResources.map(renderResourceLine).filter(Boolean).join('\n'));
    parts.push(`      <p>&nbsp;</p>`);
    parts.push(`    </div>`);
  }

  // ---- DAILY BLOCKS ----
  for (const day of DAYS_ORDER) {
    const dayRows = rows.filter((r) => r.day === day);
    if (dayRows.length === 0) continue;

    const blockId = DAY_BLOCK_IDS[day];
    const isFriday = day === 'Friday';
    const row = dayRows[0];

    parts.push(`    <div id="${blockId}" class="">`);
    parts.push(`      <h3 ${KL_DAY_H3}>${KL_ICON_SCHOOL}${day}&nbsp;</h3>`);
    parts.push(`      <p>&nbsp;</p>`);

    // No School / No Class
    if (row.type === 'X' || row.type === 'No Class' || row.type === '-') {
      const label = row.type === 'X' ? 'No School' : 'No Class';
      parts.push(`      <p><em>${label}</em></p>`);
      parts.push(`    </div>`);
      continue;
    }

    // ---- IN CLASS ----
    parts.push(`      <h4 ${KL_H4}><strong>In Class</strong></h4>`);
    for (const r of dayRows) {
      const raw = (r.in_class || '').trim();
      if (!raw) {
        parts.push(`      <p><span><em>Lesson plan TBD</em></span></p>`);
        continue;
      }
      let txt = stripLessonTitle(raw, r.subject);
      txt = injectFileLinks(txt, contentMap, r.subject);
      txt = injectAssignmentLink(txt, r.canvas_url);
      parts.push(`      <p><span>${txt}</span></p>`);
    }
    parts.push(`      <p>&nbsp;</p>`);

    // ---- AT HOME / HOMEWORK (omit on Friday) ----
    if (!isFriday) {
      const atHomeFragments: string[] = [];
      for (const r of dayRows) {
        const raw = (r.at_home || '').trim();
        if (!raw) continue;
        const text = stripLessonTitle(raw, r.subject);
        const linked = injectFileLinks(text, contentMap, r.subject);
        if (r.subject === 'Math' && r.canvas_url) {
          atHomeFragments.push(
            `      <p><a title="${text}" href="${r.canvas_url}" target="_blank" rel="noopener">${linked}</a></p>`,
          );
        } else {
          atHomeFragments.push(`      <p><strong>${linked}</strong></p>`);
        }
      }
      // Append "Study Spelling Words" on non-Friday, non-Spelling-Test days for Reading page
      if (row.subject === 'Reading' && !isFriday) {
        const hasSpellingTest = dayRows.some(
          r => r.subject === 'Spelling' && (r.type || '').toLowerCase().includes('test')
        );
        if (!hasSpellingTest && atHomeFragments.length > 0) {
          atHomeFragments.push(`      <p>Study Spelling Words</p>`);
        }
      }
      if (atHomeFragments.length > 0) {
        parts.push(`      <h4 ${KL_H4}><strong>${atHomeLabel(row.subject)}</strong></h4>`);
        parts.push(atHomeFragments.join('\n'));
      }
    }

    parts.push(`    </div>`);
  }

  parts.push(`  </div>`); // close kl_custom_block_1
  parts.push(`</div>`); // close wrapper
  return parts.join('\n');
}

// ============================================================================
// HOMEROOM page — newsletter banner template
// ============================================================================

export function generateHomeroomPageHtml(params: HomeroomPageParams): string {
  const { dateRange, homeroomNotes, birthdays, reminders, resources } = params;
  const parts: string[] = [];

  // Gradient banner
  parts.push(`<div style="background: linear-gradient(135deg,#6644bb,#0065a7); color: #fff; padding: 24px; border-radius: 12px; text-align: center;">
  <h1 style="margin: 0;">📬 Homeroom Newsletter</h1>
  <p style="margin: 8px 0 0;">${dateRange || 'This Week'}</p>
</div>`);

  // Homeroom Notes (purple card)
  if (homeroomNotes?.trim()) {
    const noteItems = homeroomNotes.split('\n').filter(Boolean)
      .map((n) => `    <li>${n.trim()}</li>`).join('\n');
    parts.push(`<div style="margin: 16px 0; padding: 16px; background: #f8f6ff; border-radius: 8px; border-left: 4px solid #6644bb;">
  <h3 style="margin: 0 0 8px; color: #6644bb;">📝 Homeroom Notes</h3>
  <ul>
${noteItems}
  </ul>
</div>`);
  }

  // Birthdays (orange card)
  if (birthdays?.trim()) {
    const bdLines = birthdays.split('\n').filter(Boolean)
      .map((b) => `  <p style="margin: 0;">${b.trim()}</p>`).join('\n');
    parts.push(`<div style="margin: 16px 0; padding: 16px; background: #fff8f0; border-radius: 8px; border-left: 4px solid #c87800;">
  <h3 style="margin: 0 0 8px; color: #c87800;">🎂 Birthdays&nbsp;🎂</h3>
  <p style="margin: 0;">Happy Birthday to:</p>
${bdLines}
</div>`);
  }

  // Mark Your Calendars (from reminders field)
  if (reminders?.trim()) {
    const calLines = reminders.split('\n').filter(Boolean)
      .map((r) => `  <div dir="ltr">${r.trim()}</div>`).join('\n');
    parts.push(`<div style="margin: 16px 0;">
  <h3 style="color: #6644bb; border-bottom: 2px solid #6644bb; padding-bottom: 4px;">Mark Your Calendars</h3>
${calLines}
</div>`);
  }

  // Links/Resources
  if (resources?.trim()) {
    const linkLines = resources.split('\n').filter(Boolean).map((r) => {
      const pipe = r.split('|').map((s) => s.trim());
      if (pipe.length === 2 && pipe[1].startsWith('http')) {
        return `  <p dir="ltr"><a href="${pipe[1]}" target="_blank" rel="noopener">${pipe[0]}</a></p>`;
      }
      if (r.trim().startsWith('http')) {
        return `  <p dir="ltr"><a href="${r.trim()}" target="_blank">${r.trim()}</a></p>`;
      }
      return `  <p dir="ltr">${r.trim()}</p>`;
    }).join('\n');
    parts.push(`<div style="margin: 16px 0;">
${linkLines}
</div>`);
  }

  // Footer
  parts.push(`<div style="text-align: center; margin-top: 24px; padding: 16px; color: #888; font-size: 12px;">Thales Academy Grade 4A &mdash; Mr. Reagan</div>`);

  return parts.join('\n');
}


// Silence unused-import warning if getCourseId is unused elsewhere in this file.
void getCourseId;
