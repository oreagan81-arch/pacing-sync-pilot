// Lightweight read proxy for Canvas data used by client-side cleanup flows.
// Currently supports: { action: 'list_assignments', courseId }.
import { listAssignments, CANVAS_BASE } from '../_shared/canvas-api.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || '');

    if (action === 'list_assignments') {
      const courseId = Number(body.courseId);
      if (!courseId) {
        return new Response(JSON.stringify({ error: 'courseId required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const items = await listAssignments(courseId);
      return new Response(JSON.stringify(items), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: `unknown action: ${action}`, base: CANVAS_BASE }), {
      status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
