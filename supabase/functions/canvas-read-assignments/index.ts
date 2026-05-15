import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { listAssignments } from '../_shared/canvas-api.ts';
import { getCourseIds } from '../_shared/canvas-courses.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const sb = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const body = await req.json().catch(() => ({}));
    const map = await getCourseIds();
    const startDate = body.startDate ? new Date(body.startDate) : null;
    const endDate = body.endDate ? new Date(body.endDate) : null;
    const courseIds: number[] = body.courseId
      ? [Number(body.courseId)]
      : Array.from(new Set(Object.values(map)));

    let total = 0;
    const errors: string[] = [];
    for (const courseId of courseIds) {
      try {
        const items = await listAssignments(courseId);
        for (const a of items) {
          if (a.due_at) {
            const due = new Date(a.due_at);
            if (startDate && due < startDate) continue;
            if (endDate && due > endDate) continue;
          }
          await sb.from('canvas_snapshots').upsert(
            {
              course_id: courseId,
              content_type: 'assignment',
              canvas_id: String(a.id),
              title: a.name ?? null,
              body: a.description ?? null,
              metadata: {
                due_at: a.due_at,
                points_possible: a.points_possible,
                assignment_group_id: a.assignment_group_id,
                published: a.published,
                html_url: a.html_url,
              },
            },
            { onConflict: 'course_id,content_type,canvas_id' },
          );
          total++;
        }
      } catch (e) {
        errors.push(`course ${courseId}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }

    return new Response(JSON.stringify({ ok: true, total, courses: courseIds.length, errors }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
