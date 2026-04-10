const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const urls = [
    "https://ai-gateway.lovable.app/v1/chat/completions",
    "https://ai-gateway.lovable.app/chat/completions",
  ];
  
  const results: Record<string, string> = {};
  for (const url of urls) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY") || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash-lite",
          messages: [{ role: "user", content: "Say hi" }],
          max_tokens: 10,
        }),
        signal: AbortSignal.timeout(10000),
      });
      const body = await resp.text();
      results[url] = `status: ${resp.status}, body: ${body.slice(0, 200)}`;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      results[url] = msg.length > 100 ? msg.slice(0, 100) : msg;
    }
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
