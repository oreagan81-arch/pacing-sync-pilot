import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import { listFiles } from '../_shared/canvas-api.ts';
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
        const items = await listFiles(courseId);
        for (const f of items) {
          await sb.from('canvas_snapshots').upsert(
            {
              course_id: courseId,
              content_type: 'file',
              canvas_id: String(f.id),
              title: f.display_name ?? f.filename ?? null,
              body: null,
              metadata: {
                filename: f.filename,
                url: f.url,
                content_type: f.content_type,
                size: f.size,
                updated_at: f.updated_at,
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
