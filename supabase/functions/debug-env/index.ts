const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const envKeys: string[] = [];
  for (const [k] of Object.entries(Deno.env.toObject())) {
    envKeys.push(k);
  }
  envKeys.sort();

  let dnsResult = "unknown";
  try {
    const resp = await fetch("https://ai-gateway.lovable.dev/v1/models", {
      headers: { "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY") || ""}` },
    });
    dnsResult = `status: ${resp.status}`;
  } catch (e: unknown) {
    dnsResult = `error: ${e instanceof Error ? e.message : String(e)}`;
  }

  return new Response(JSON.stringify({ envKeys, dnsResult }, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
