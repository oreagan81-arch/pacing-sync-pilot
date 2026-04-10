/**
 * Canvas HTML generator — pure function.
 * Output is used for BOTH preview and deploy. No exceptions.
 * ALL styling is inline (Canvas RCE strips class attributes).
 * ALL emojis as Unicode escapes.
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

export function generateCanvasPageHtml(params: CanvasPageParams): string {
  const { subject, rows, quarter, weekNum, dateRange, reminders, resources, quarterColor } = params;
  const parts: string[] = [];

  // 1. BANNER
  parts.push(`<div style="background:${quarterColor};padding:24px 20px;border-radius:8px;margin-bottom:16px;">
  <div style="color:#fff;font-size:11px;text-transform:uppercase;letter-spacing:2px;margin-bottom:4px;">${subject}</div>
  <div style="color:#fff;font-size:24px;font-weight:bold;margin-bottom:4px;">Weekly Agenda</div>
  <div style="color:rgba(255,255,255,0.85);font-size:14px;">${quarter}, Week ${weekNum} | ${dateRange}</div>
</div>`);

  // 2. REMINDERS (omit if empty)
  if (reminders && reminders.trim()) {
    const items = reminders.split('\n').filter(Boolean).map(
      (r) => `    <li style="margin-bottom:4px;">${r.trim()}</li>`
    ).join('\n');
    parts.push(`<div style="background:#c51062;padding:16px 20px;border-radius:8px;margin-bottom:16px;">
  <div style="color:#fff;font-weight:bold;font-size:14px;margin-bottom:8px;">\uD83D\uDCE2 Reminders</div>
  <ul style="color:#fff;margin:0;padding-left:20px;">
${items}
  </ul>
</div>`);
  }

  // 3. RESOURCES (omit if empty)
  if (resources && resources.trim()) {
    const items = resources.split('\n').filter(Boolean).map((r) => {
      const trimmed = r.trim();
      // If it looks like a URL, make it a link
      if (trimmed.startsWith('http')) {
        const label = trimmed.split('/').pop() || 'Resource';
        return `  <div style="margin-bottom:6px;">
    <a href="${trimmed}" target="_blank"><span style="color:#0065a7;">\u2193 ${label}</span></a>
  </div>`;
      }
      return `  <div style="margin-bottom:6px;"><span style="color:#333;">${trimmed}</span></div>`;
    }).join('\n');
    parts.push(`<div style="background:#f8f9fa;padding:16px 20px;border-radius:8px;margin-bottom:16px;border:1px solid #e0e0e0;">
  <div style="font-weight:bold;font-size:14px;color:#333;margin-bottom:10px;">\uD83D\uDCC2 Resources</div>
${items}
</div>`);
  }

  // 4. DAILY BLOCKS
  for (const day of DAYS_ORDER) {
    const dayRows = rows.filter((r) => r.day === day);
    if (dayRows.length === 0) continue;

    const row = dayRows[0];

    // No School
    if (row.type === 'X') {
      parts.push(wrapDay(day, `<div style="color:#888;font-style:italic;">No School</div>`));
      continue;
    }
    // No Class
    if (row.type === 'No Class' || row.type === '-') {
      parts.push(wrapDay(day, `<div style="color:#888;font-style:italic;">No Class</div>`));
      continue;
    }

    let content = '';

    // IN CLASS
    const brevityText = applyBrevity(row.subject, row.lesson_num, row.in_class || '');
    content += `<div style="margin-bottom:12px;">
  <div style="font-size:11px;text-transform:uppercase;font-weight:bold;color:#666;letter-spacing:1px;margin-bottom:6px;">In Class</div>
  <div style="color:#333;">${brevityText}</div>
</div>`;

    // AT HOME — OMIT if Friday OR no Canvas assignment URL
    const isFriday = day === 'Friday';
    const hasCanvasUrl = row.canvas_url && row.canvas_url.trim();

    if (!isFriday && hasCanvasUrl) {
      const title = row.at_home || `Lesson ${row.lesson_num || ''}`;
      content += `<div style="background:#f0f4ff;padding:12px 14px;border-radius:6px;border-left:3px solid #0065a7;margin-top:8px;">
  <div style="font-size:11px;text-transform:uppercase;font-weight:bold;color:#0065a7;letter-spacing:1px;margin-bottom:8px;">At Home</div>
  <div>
    <a href="${row.canvas_url}" target="_blank">
      <span style="font-weight:bold;color:#0065a7;">\uD83D\uDCCB ${title}</span>
    </a>
  </div>
</div>`;
    }

    parts.push(wrapDay(day, content));
  }

  return parts.join('\n\n');
}

function wrapDay(day: string, content: string): string {
  return `<div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:1px solid #e0e0e0;">
  <div style="background:#0065a7;padding:10px 16px;">
    <span style="color:#fff;font-weight:bold;font-size:15px;">${day}</span>
  </div>
  <div style="padding:16px;">
    ${content}
  </div>
</div>`;
}
