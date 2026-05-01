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

    // ===== Flush QUEUED newsletters → Homeroom course (22254) =====
    const newsletterResults: Array<{ id: string; ok: boolean; error?: string }> = [];
    try {
      const { data: queued, error: nErr } = await sb
        .from('newsletters')
        .select('id, date_range, html_content')
        .eq('status', 'QUEUED');
      if (nErr) throw nErr;

      for (const n of queued ?? []) {
        try {
          if (!n.html_content) {
            newsletterResults.push({ id: n.id, ok: false, error: 'empty html_content' });
            continue;
          }
          const slug = `newsletter-${(n.date_range ?? 'latest').replace(/\s+/g, '-').toLowerCase()}`;
          await invokeFn('canvas-deploy-page', {
            subject: 'Homeroom',
            courseId: 22254,
            pageUrl: slug,
            pageTitle: `Newsletter — ${n.date_range ?? 'Latest'}`,
            bodyHtml: n.html_content,
            published: true,
          });
          await sb
            .from('newsletters')
            .update({ status: 'DEPLOYED', posted_at: new Date().toISOString() })
            .eq('id', n.id);
          newsletterResults.push({ id: n.id, ok: true });
        } catch (e) {
          newsletterResults.push({ id: n.id, ok: false, error: String(e) });
        }
      }
      (log as Record<string, unknown>).newsletters = newsletterResults;
    } catch (nErr) {
      console.error('newsletter flush error', nErr);
      (log as Record<string, unknown>).newsletters_error = String(nErr);
    }

    // ===== Admin email summary via Resend =====
    try {
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
      const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') ?? 'onboarding@resend.dev';
      const FROM_EMAIL = Deno.env.get('FROM_EMAIL') ?? 'Pacing Bot <onboarding@resend.dev>';

      if (RESEND_API_KEY) {
        const succeeded: string[] = [];
        const failed: { subject: string; error: string }[] = [];
        for (const [subj, info] of Object.entries(log.subjects as Record<string, any>)) {
          if (info?.error) failed.push({ subject: subj, error: String(info.error) });
          else succeeded.push(subj);
        }

        const html = `
          <h2>Friday Sync — ${nextWeek.quarter}W${nextWeek.week_num}</h2>
          <p><strong>Succeeded (${succeeded.length}):</strong> ${succeeded.join(', ') || '—'}</p>
          <p><strong>Failed (${failed.length}):</strong></p>
          <ul>${failed.map(f => `<li><b>${f.subject}</b>: ${f.error}</li>`).join('') || '<li>None</li>'}</ul>
        `;

        const r = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: FROM_EMAIL,
            to: [ADMIN_EMAIL],
            subject: `Friday Sync ${nextWeek.quarter}W${nextWeek.week_num} — ${succeeded.length} ok / ${failed.length} failed`,
            html,
          }),
        });
        if (!r.ok) console.error('Resend email failed:', r.status, await r.text());
      } else {
        console.warn('RESEND_API_KEY not set — skipping admin notification');
      }
    } catch (mailErr) {
      console.error('Admin email error:', mailErr);
    }

    return log;
  }, { jobName: JOB_NAME });

  return new Response(JSON.stringify(result), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status: result.success ? 200 : 500,
  });
});
