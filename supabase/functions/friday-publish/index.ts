import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const canvasToken = Deno.env.get("CANVAS_API_TOKEN");
    let canvasBase = Deno.env.get("CANVAS_BASE_URL") || "https://thalesacademy.instructure.com";
    if (!canvasBase.startsWith("http")) canvasBase = `https://${canvasBase}`;

    if (!canvasToken) {
      return new Response(JSON.stringify({ error: "CANVAS_API_TOKEN not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(supabaseUrl, supabaseKey);

    // 1. Post all DRAFT announcements
    const { data: drafts, error: draftErr } = await sb
      .from("announcements")
      .select("*")
      .eq("status", "DRAFT");

    if (draftErr) throw new Error(`Fetch drafts: ${draftErr.message}`);

    const results: { id: string; status: string; error?: string }[] = [];

    for (const ann of drafts || []) {
      if (!ann.course_id || !ann.title) {
        results.push({ id: ann.id, status: "SKIPPED", error: "Missing course_id or title" });
        continue;
      }

      try {
        const payload = {
          title: ann.title,
          message: ann.content || "",
          is_announcement: true,
          published: true,
        };

        const res = await fetch(
          `${canvasBase}/api/v1/courses/${ann.course_id}/discussion_topics`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${canvasToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );

        if (!res.ok) {
          const errText = await res.text();
          await sb.from("deploy_log").insert({
            week_id: ann.week_id,
            subject: ann.subject,
            action: "announcement_post",
            status: "ERROR",
            message: `POST ${res.status}: ${errText}`,
          });
          await sb.from("announcements").update({ status: "ERROR" }).eq("id", ann.id);
          results.push({ id: ann.id, status: "ERROR", error: errText });
          continue;
        }

        const result = await res.json();
        const canvasUrl = `${canvasBase}/courses/${ann.course_id}/discussion_topics/${result.id}`;

        await sb.from("announcements").update({
          status: "POSTED",
          posted_at: new Date().toISOString(),
        }).eq("id", ann.id);

        await sb.from("deploy_log").insert({
          week_id: ann.week_id,
          subject: ann.subject,
          action: "announcement_post",
          status: "DEPLOYED",
          canvas_url: canvasUrl,
          message: `Auto-posted: ${ann.title}`,
        });

        results.push({ id: ann.id, status: "POSTED" });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Unknown error";
        results.push({ id: ann.id, status: "ERROR", error: msg });
      }
    }

    // 2. Log the cron run
    await sb.from("deploy_log").insert({
      action: "friday_publish",
      status: "DEPLOYED",
      message: `Friday auto-publish: ${results.filter(r => r.status === "POSTED").length} posted, ${results.filter(r => r.status === "ERROR").length} errors, ${results.filter(r => r.status === "SKIPPED").length} skipped`,
    });

    return new Response(JSON.stringify({
      status: "OK",
      posted: results.filter(r => r.status === "POSTED").length,
      errors: results.filter(r => r.status === "ERROR").length,
      skipped: results.filter(r => r.status === "SKIPPED").length,
      details: results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
