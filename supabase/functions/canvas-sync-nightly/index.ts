import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const STEPS = [
  'canvas-read-pages',
  'canvas-read-assignments',
  'canvas-read-announcements',
  'canvas-read-files',
  'canvas-pattern-train',
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const sb = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  const results: Array<{ step: string; ok: boolean; detail: unknown }> = [];
  for (const step of STEPS) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${step}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${SERVICE_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      results.push({ step, ok: res.ok, detail: json });
      if (!res.ok) {
        await sb.from('deploy_log').insert({
          action: 'canvas-sync-nightly',
          status: 'ERROR',
          message: `Step ${step} failed`,
          payload: json as Record<string, unknown>,
        });
      }
    } catch (e) {
      results.push({ step, ok: false, detail: e instanceof Error ? e.message : String(e) });
    }
  }

  const allOk = results.every((r) => r.ok);
  await sb.from('deploy_log').insert({
    action: 'canvas-sync-nightly',
    status: allOk ? 'OK' : 'PARTIAL',
    message: `Nightly sync ${allOk ? 'complete' : 'completed with errors'}`,
    payload: { results } as Record<string, unknown>,
  });

  return new Response(JSON.stringify({ ok: allOk, results }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
