const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const appsScriptUrl = Deno.env.get("GOOGLE_APPS_SCRIPT_URL");
    if (!appsScriptUrl) {
      return new Response(JSON.stringify({ status: "error", error: "GOOGLE_APPS_SCRIPT_URL not configured" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const requestBody = await req.json().catch(() => ({}));
    const { method = "POST", query, payload, ...rest } = requestBody as {
      method?: string;
      query?: Record<string, string | number | boolean | null | undefined>;
      payload?: unknown;
      [key: string]: unknown;
    };

    const url = new URL(appsScriptUrl);
    if (query && typeof query === "object") {
      for (const [key, value] of Object.entries(query)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }

    const outboundMethod = method.toUpperCase();
    const outboundPayload = payload ?? rest;

    const response = await fetch(url.toString(), {
      method: outboundMethod,
      redirect: "follow",
      headers: outboundMethod === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: outboundMethod === "POST" ? JSON.stringify(outboundPayload) : undefined,
    });

    const text = await response.text();
    let data: Record<string, unknown>;

    try {
      data = text ? JSON.parse(text) : { status: response.ok ? "success" : "error" };
    } catch {
      data = {
        status: response.ok ? "success" : "error",
        raw: text,
      };
    }

    if (!response.ok) {
      return new Response(JSON.stringify({
        status: "error",
        error: typeof data.error === "string" ? data.error : `Google Apps Script error (${response.status})`,
        details: data,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: "error",
      error: error instanceof Error ? error.message : "Unknown error",
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});