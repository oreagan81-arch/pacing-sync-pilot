/**
 * THALES OS — Canvas HTML Generator
 * Matches the official Canvas Agenda Page template exactly.
 * Uses Canvas RCE-compatible classes and inline styles.
 */

import { applyBrevity } from './assignment-logic';

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
}

const DAYS_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const BLOCK_IDS: Record<string, string> = {
  Monday: 'kl_custom_block_3',
  Tuesday: 'kl_custom_block_4',
  Wednesday: 'kl_custom_block_6',
  Thursday: 'kl_custom_block_2',
  Friday: 'kl_custom_block_1',
};

export function generateCanvasPageHtml(params: CanvasPageParams): string {
  const { subject, rows, quarter, weekNum, dateRange, reminders, resources, quarterColor } = params;
  const parts: string[] = [];

  // 1. BANNER
  parts.push(`<div id="kl_wrapper_3" class="kl_circle_left kl_wrapper" style="border-style: none;">
    <div id="kl_banner" class="">
        <h2 class="" style="color: #ffffff; background-color: ${quarterColor}; text-align: center;"><span id="kl_banner_right" class="" style="color: #ffffff; background-color: ${quarterColor};">${subject} \u2014 Weekly Agenda</span></h2>
        <p class="kl_subtitle">${quarter}, Week ${weekNum} | ${dateRange}</p>
    </div>`);

  // 2. REMINDERS (omit if empty)
  if (reminders && reminders.trim()) {
    const items = reminders.split('\n').filter(Boolean).map(
      (r) => `        <p>${r.trim()}</p>`
    ).join('\n');
    parts.push(`    <div id="kl_custom_block_0" class="">
        <h3 class="" style="background-color: #c51062; color: #ffffff; border-color: #c51062;"><i class="fas fa-exclamation" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>Reminders</h3>
${items}
        <p>&nbsp;</p>
    </div>`);
  }

  // 3. RESOURCES — aggregated from per-day rows + week metadata
  const allResources: string[] = [];
  for (const row of rows) {
    if (row.resources && row.resources.trim()) {
      row.resources.split('\n').filter(Boolean).forEach((r) => {
        const trimmed = r.trim();
        if (!allResources.includes(trimmed)) allResources.push(trimmed);
      });
    }
  }
  if (resources && resources.trim()) {
    resources.split('\n').filter(Boolean).forEach((r) => {
      const trimmed = r.trim();
      if (!allResources.includes(trimmed)) allResources.push(trimmed);
    });
  }

  if (allResources.length > 0) {
    const items = allResources.map((trimmed) => {
      if (trimmed.startsWith('http')) {
        const label = trimmed.split('/').pop() || 'Resource';
        return `        <p><a href="${trimmed}" target="_blank">${label}</a></p>`;
      }
      return `        <p>${trimmed}</p>`;
    }).join('\n');
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
        <h3 class="" style="background-color: #0065a7; color: #ffffff; border-color: #0065a7;"><i class="fas fa-school" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>${day}</h3>
        <p><em>${label}</em></p>
        <p>&nbsp;</p>
    </div>`);
      continue;
    }

    // Build In Class content
    const brevityText = applyBrevity(row.subject, row.lesson_num, row.in_class || '');
    // For multiple subjects on the same day (Reading tab merges Reading + Spelling)
    const extraRows = dayRows.slice(1);
    const extraInClass = extraRows
      .map((r) => `        <p>${applyBrevity(r.subject, r.lesson_num, r.in_class || '')}</p>`)
      .join('\n');

    // Determine if there's homework
    const isFriday = day === 'Friday';
    const hasAtHome = !isFriday && row.at_home && row.at_home.trim();

    let dayHtml = `    <div id="${blockId}" class="">
        <h3 class="" style="background-color: #0065a7; color: #ffffff; border-color: #0065a7;"><i class="fas fa-school" aria-hidden="true"><span class="dp-icon-content" style="display: none;">&nbsp;</span></i>${day}</h3>
        <h4 class="kl_solid_border" style="color: #ffffff; background-color: #333333; padding-left: 40px; border-width: 0px; width: 60%;"><strong>In Class</strong></h4>
        <p>${brevityText}</p>`;

    if (extraInClass) {
      dayHtml += `\n${extraInClass}`;
    }

    // AT HOME section — only if there's homework and it's not Friday
    if (hasAtHome) {
      const atHomeText = row.at_home!.trim();
      dayHtml += `
        <p>&nbsp;</p>
        <h4 class="kl_solid_border" style="color: #ffffff; background-color: #333333; padding-left: 40px; border-width: 0px; width: 60%;"><strong>At Home</strong></h4>
        <p>${atHomeText}</p>`;
    }

    // Extra rows at-home (e.g. Spelling homework on Reading tab)
    for (const er of extraRows) {
      if (!isFriday && er.at_home && er.at_home.trim()) {
        if (!hasAtHome) {
          // Need to add the At Home header if the primary row didn't have one
          dayHtml += `
        <p>&nbsp;</p>
        <h4 class="kl_solid_border" style="color: #ffffff; background-color: #333333; padding-left: 40px; border-width: 0px; width: 60%;"><strong>At Home</strong></h4>`;
        }
        dayHtml += `
        <p>${er.at_home.trim()}</p>`;
      }
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
