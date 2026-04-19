import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { listAnnouncements } from '../_shared/canvas-api.ts';
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
    const courseIds: number[] = body.courseId
      ? [Number(body.courseId)]
      : Array.from(new Set(Object.values(map)));

    let total = 0;
    const errors: string[] = [];
    for (const courseId of courseIds) {
      try {
        const items = await listAnnouncements(courseId);
        for (const a of items) {
          await sb.from('canvas_snapshots').upsert(
            {
              course_id: courseId,
              content_type: 'announcement',
              canvas_id: String(a.id),
              title: a.title ?? null,
              body: a.message ?? null,
              metadata: {
                posted_at: a.posted_at,
                delayed_post_at: a.delayed_post_at,
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
