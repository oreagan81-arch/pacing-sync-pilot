import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchWithRetry(url: string, init: RequestInit, attempts = 3): Promise<Response> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, init);
      // Retry only on 5xx server errors / 429 throttling
      if (res.status >= 500 || res.status === 429) {
        if (i < attempts - 1) {
          const backoff = 500 * Math.pow(2, i);
          await new Promise((r) => setTimeout(r, backoff));
          continue;
        }
      }
      return res;
    } catch (e) {
      lastErr = e;
      if (i < attempts - 1) {
        const backoff = 500 * Math.pow(2, i);
        await new Promise((r) => setTimeout(r, backoff));
        continue;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Network error");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { subject, courseId, pageUrl, pageTitle, bodyHtml, published, setFrontPage, weekId } = await req.json();

    if (!courseId || !pageUrl || !pageTitle || !bodyHtml) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canvasToken = Deno.env.get("CANVAS_API_TOKEN");
    let canvasBase = Deno.env.get("CANVAS_BASE_URL") || "https://thalesacademy.instructure.com";
    if (!canvasBase.startsWith("http")) canvasBase = `https://${canvasBase}`;
    canvasBase = canvasBase.replace(/\/+$/, "");
    if (!canvasToken) {
      return new Response(JSON.stringify({ error: "CANVAS_API_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, supabaseKey);

    const canvasHeaders = {
      Authorization: `Bearer ${canvasToken}`,
      "Content-Type": "application/json",
    };

    const courseBase = `${canvasBase}/api/v1/courses/${courseId}`;

    // 1. GET page to check existence + front_page
    const getRes = await fetchWithRetry(`${courseBase}/pages/${pageUrl}`, { headers: canvasHeaders });
    let exists = false;
    let isFrontPage = false;
    let existingBody = "";

    if (getRes.ok) {
      const pageData = await getRes.json();
      exists = true;
      isFrontPage = pageData.front_page === true;
      existingBody = pageData.body || "";
    } else {
      await getRes.text();
    }

    // 2. Content hash check — skip if body matches
    if (exists && existingBody === bodyHtml) {
      if (setFrontPage && !isFrontPage) {
        await fetchWithRetry(`${courseBase}/pages/${pageUrl}`, {
          method: "PUT",
          headers: canvasHeaders,
          body: JSON.stringify({ wiki_page: { front_page: true, published: true } }),
        });
      }

      await sb.from("deploy_log").insert({
        week_id: weekId || null,
        subject: subject || null,
        action: "page_deploy",
        status: "NO_CHANGE",
        canvas_url: `${canvasBase}/courses/${courseId}/pages/${pageUrl}`,
        message: "Content unchanged — skipped" + (setFrontPage ? " (set as homepage)" : ""),
      });

      return new Response(JSON.stringify({
        status: "NO_CHANGE",
        canvasUrl: `${canvasBase}/courses/${courseId}/pages/${pageUrl}`,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Create or update the page
    let pub = published ?? false;
    if (isFrontPage || setFrontPage) pub = true;

    const payload = {
      wiki_page: {
        title: pageTitle,
        body: bodyHtml,
        published: pub,
        ...(setFrontPage ? { front_page: true } : {}),
      },
    };

    const method = exists ? "PUT" : "POST";
    const url = exists ? `${courseBase}/pages/${pageUrl}` : `${courseBase}/pages`;

    const res = await fetchWithRetry(url, {
      method,
      headers: canvasHeaders,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      await sb.from("deploy_log").insert({
        week_id: weekId || null,
        subject: subject || null,
        action: "page_deploy",
        status: "ERROR",
        message: `${method} ${res.status}: ${errText}`,
        payload: payload as unknown as Record<string, unknown>,
      });

      await sb.from("deploy_notifications").insert({
        title: `Page deploy failed — ${subject || "?"}`,
        message: `${method} ${res.status}: ${errText.slice(0, 200)}`,
        level: "error",
        entity_ref: `${subject || ""}:${pageUrl}`,
      });

      return new Response(JSON.stringify({ error: errText, status: "ERROR" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await res.json();
    const canvasUrl = `${canvasBase}/courses/${courseId}/pages/${result.url || pageUrl}`;

    // 4. If page was just created (POST), separate PUT to set front_page
    if (!exists && setFrontPage) {
      const fpRes = await fetchWithRetry(`${courseBase}/pages/${result.url || pageUrl}`, {
        method: "PUT",
        headers: canvasHeaders,
        body: JSON.stringify({ wiki_page: { front_page: true, published: true } }),
      });
      if (!fpRes.ok) {
        const fpErr = await fpRes.text();
        console.error("Failed to set front page:", fpErr);
      }
    }

    await sb.from("deploy_log").insert({
      week_id: weekId || null,
      subject: subject || null,
      action: "page_deploy",
      status: "DEPLOYED",
      canvas_url: canvasUrl,
      message: `${exists ? "Updated" : "Created"} page: ${pageTitle}${setFrontPage ? " (set as homepage)" : ""}`,
    });

    await sb.from("deploy_notifications").insert({
      title: `${subject || "Page"} agenda deployed`,
      message: `${exists ? "Updated" : "Created"} ${pageTitle}${setFrontPage ? " — set as homepage" : ""}`,
      level: "info",
      entity_ref: `${subject || ""}:${pageUrl}`,
    });

    return new Response(JSON.stringify({ status: "DEPLOYED", canvasUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
