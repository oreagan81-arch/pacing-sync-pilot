import { corsHeaders } from 'https://esm.sh/@supabase/supabase-js@2.95.0/cors';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.0';
import { runWithRetry } from '../_shared/retry.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JOB_NAME = 'automation-friday-deploy';

const QUARTER_ORDER = ['Q1', 'Q2', 'Q3', 'Q4'];

function getNextWeek(weeks: { id: string; quarter: string; week_num: number }[], currentId?: string) {
  const sorted = [...weeks].sort((a, b) => {
    const q = QUARTER_ORDER.indexOf(a.quarter) - QUARTER_ORDER.indexOf(b.quarter);
    return q !== 0 ? q : a.week_num - b.week_num;
  });
  if (!currentId) return sorted[0];
  const idx = sorted.findIndex((w) => w.id === currentId);
  if (idx === -1 || idx + 1 >= sorted.length) return null;
  return sorted[idx + 1];
}

async function invokeFn(name: string, body: object) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE}`,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} → ${res.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE);
  let targetWeekId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    targetWeekId = body.weekId ?? null;
  } catch { /* ignore */ }

  const result = await runWithRetry(async () => {
    // pick next week
    const { data: weeks, error: wErr } = await sb.from('weeks').select('id, quarter, week_num');
    if (wErr) throw wErr;

    let nextWeek;
    if (targetWeekId) {
      nextWeek = weeks?.find((w) => w.id === targetWeekId);
    } else {
      // assume "current" is the most recently updated week
      const { data: cur } = await sb.from('weeks').select('id').order('updated_at', { ascending: false }).limit(1).maybeSingle();
      nextWeek = getNextWeek(weeks ?? [], cur?.id);
    }
    if (!nextWeek) throw new Error('No next week found');

    // load pacing rows
    const { data: rows, error: rErr } = await sb
      .from('pacing_rows')
      .select('*')
      .eq('week_id', nextWeek.id);
    if (rErr) throw rErr;

    const subjects = Array.from(new Set((rows ?? []).map((r) => r.subject)));
    const log: Record<string, unknown> = { weekId: nextWeek.id, subjects: {} };

    for (const subject of subjects) {
      const subjectLog: Record<string, unknown> = { page: null, assignments: [], announcements: 0 };
      try {
        // deploy page
        subjectLog.page = await invokeFn('canvas-deploy-page', { weekId: nextWeek.id, subject });

        // deploy assignments
        const subjectRows = (rows ?? []).filter((r) => r.subject === subject && r.create_assign);
        for (const row of subjectRows) {
          try {
            const a = await invokeFn('canvas-deploy-assignment', { rowId: row.id });
            (subjectLog.assignments as unknown[]).push({ rowId: row.id, ok: true, result: a });
          } catch (e) {
            (subjectLog.assignments as unknown[]).push({ rowId: row.id, ok: false, error: String(e) });
          }
        }

        // schedule announcements (Mon 7AM, Wed 4PM, Fri 4PM ET defaults)
        const now = new Date();
        const announcements = [
          { type: 'WEEK_AHEAD', dayOffset: 0, hour: 21 },   // Fri 4PM ET (deploy day)
          { type: 'MIDWEEK',    dayOffset: 5, hour: 21 },   // Wed 4PM ET
          { type: 'WEEKEND',    dayOffset: 7, hour: 21 },   // Fri 4PM ET
        ];
        for (const a of announcements) {
          const scheduled = new Date(now);
          scheduled.setDate(scheduled.getDate() + a.dayOffset);
          scheduled.setUTCHours(a.hour, 0, 0, 0);
          await sb.from('announcements').insert({
            week_id: nextWeek.id,
            subject,
            type: a.type,
            status: 'DRAFT',
            scheduled_post: scheduled.toISOString(),
            title: `${subject} — ${a.type}`,
            content: `Auto-generated ${a.type} announcement for ${subject}.`,
          });
          subjectLog.announcements = (subjectLog.announcements as number) + 1;
        }
      } catch (e) {
        subjectLog.error = String(e);
      }
      (log.subjects as Record<string, unknown>)[subject] = subjectLog;
    }

    await sb.from('deploy_log').insert({
      action: JOB_NAME,
      status: 'DEPLOYED',
      week_id: nextWeek.id,
      message: `Deployed ${subjects.length} subjects for week ${nextWeek.quarter}W${nextWeek.week_num}`,
      payload: log,
    });

    await sb.from('deploy_notifications').insert({
      level: 'info',
      title: 'Next week deployed',
      message: `${nextWeek.quarter}W${nextWeek.week_num}: ${subjects.length} subjects, pages + assignments + announcements scheduled.`,
      entity_ref: nextWeek.id,
    });

    return log;
  }, { jobName: JOB_NAME });

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: result.success ? 200 : 500,
  });
});
