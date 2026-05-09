// Canvas write/patch proxy. Currently supports patch.action === 'delete'
// for assignments. Honors the global DEV-mode write guard via canvasWrite.
import { canvasWrite, CANVAS_BASE } from '../_shared/canvas-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Patch {
  courseId: string | number;
  assignmentId: string | number;
  action: 'delete';
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const patches: Patch[] = Array.isArray(body.patches) ? body.patches : [];

    const results: Array<{ ok: boolean; courseId: string; assignmentId: string; status: number; error?: string }> = [];

    for (const patch of patches) {
      const courseId = String(patch.courseId);
      const assignmentId = String(patch.assignmentId);
      try {
        if (patch.action === 'delete') {
          const res = await canvasWrite(
            `${CANVAS_BASE}/api/v1/courses/${courseId}/assignments/${assignmentId}`,
            { method: 'DELETE' },
          );
          results.push({ ok: res.ok, courseId, assignmentId, status: res.status });
        } else {
          results.push({ ok: false, courseId, assignmentId, status: 400, error: `unknown action: ${patch.action}` });
        }
      } catch (e) {
        results.push({
          ok: false, courseId, assignmentId, status: 500,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
