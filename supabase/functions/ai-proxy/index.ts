// Thin AI proxy — the ai-gateway.lovable.dev domain doesn't resolve from
// Supabase edge functions, so this function accepts an AI prompt and proxies
// it through a publicly resolvable OpenAI-compatible endpoint.
// We use Google's Generative Language API directly with the Lovable API key.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { prompt, model, temperature } = await req.json();
    if (!prompt || typeof prompt !== "string") {
      return new Response(JSON.stringify({ error: "Missing prompt" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Try multiple gateway URLs in order of preference
    const urls = [
      "https://ai-gateway.lovable.dev/v1/chat/completions",
      "https://ai-gateway.lovable.app/v1/chat/completions",
    ];

    let lastError = "";
    for (const url of urls) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${lovableApiKey}`,
          },
          body: JSON.stringify({
            model: model || "google/gemini-2.5-flash",
            messages: [{ role: "user", content: prompt }],
            temperature: temperature ?? 0.2,
          }),
          signal: AbortSignal.timeout(30000),
        });

        if (!response.ok) {
          lastError = `${url}: ${response.status} ${await response.text()}`;
          continue;
        }

        const aiResult = await response.json();
        const content = aiResult.choices?.[0]?.message?.content || "";

        // Parse JSON from response
        const jsonStr = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
        let parsed;
        try {
          parsed = JSON.parse(jsonStr);
        } catch {
          parsed = { raw: content };
        }

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (e) {
        lastError = `${url}: ${e instanceof Error ? e.message : String(e)}`;
        continue;
      }
    }

    return new Response(JSON.stringify({ error: `All AI gateway URLs failed. Last: ${lastError}` }), {
      status: 502,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
