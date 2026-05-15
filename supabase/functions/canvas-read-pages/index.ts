import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { listPages, getPage } from '../_shared/canvas-api.ts';
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
        const pages = await listPages(courseId);
        for (const p of pages) {
          let fullBody = p.body;
          if (!fullBody) {
            try {
              const full = await getPage(courseId, p.url);
              fullBody = full.body;
            } catch (err) { 
              errors.push(`course ${courseId} page ${p.url}: body fetch failed - ${err instanceof Error ? err.message : String(err)}`);
            }
          }
          await sb.from('canvas_snapshots').upsert(
            {
              course_id: courseId,
              content_type: 'page',
              canvas_id: String(p.page_id),
              title: p.title ?? null,
              body: fullBody ?? null,
              metadata: {
                url: p.url,
                front_page: p.front_page,
                published: p.published,
                updated_at: p.updated_at,
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
