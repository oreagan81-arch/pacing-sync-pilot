import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function nowInET(): { isFriday: boolean; hour: number } {
  const now = new Date();
  const etString = now.toLocaleString("en-US", { timeZone: "America/New_York" });
  const etDate = new Date(etString);
  const isFriday = etDate.getDay() === 5;
  const hourParts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const hourStr = hourParts.find((p) => p.type === "hour")?.value ?? "0";
  const hour = Math.min(23, parseInt(hourStr, 10) || 0);
  return { isFriday, hour };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { courseId, title, message, delayedPostAt, weekId, subject, type } = await req.json();

    if (!courseId || !title) {
      return new Response(JSON.stringify({ error: "Missing courseId or title" }), {
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

    // ── Friday-window guard ──────────────────────────────────────────────
    // Per Friday Rules: only `reminder`-type announcements may post on Friday,
    // and only at/after 4 PM ET. Scheduled posts (delayedPostAt) bypass —
    // Canvas honors their own delay. This only gates immediate posts.
    if (!delayedPostAt) {
      const { weekday, hour } = nowInET();
      if (weekday === "Fri") {
        const isReminder = (type ?? "").toLowerCase() === "reminder";
        if (!isReminder || hour < 16) {
          await sb.from("deploy_log").insert({
            week_id: weekId || null,
            subject: subject || null,
            action: "announcement_post",
            status: "BLOCKED",
            message: `Friday window: only 'reminder' posts allowed at/after 4 PM ET (got type=${type ?? "—"}, hour=${hour})`,
          });
          return new Response(
            JSON.stringify({
              status: "BLOCKED",
              message: "Friday posts restricted to reminders after 4 PM ET",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }
      }
    }

    // ── Idempotency guard ────────────────────────────────────────────────
    // If we've already posted an announcement with the same (week_id, subject, type),
    // return the existing canvas_url instead of re-posting. Prevents double-posts
    // on cron retries.
    if (weekId && subject && type) {
      const { data: existing } = await sb
        .from("announcements")
        .select("id, posted_at, course_id")
        .eq("week_id", weekId)
        .eq("subject", subject)
        .eq("type", type)
        .not("posted_at", "is", null)
        .order("posted_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing?.posted_at) {
        // Look up the most recent successful deploy_log row for the canvas_url.
        const { data: lastLog } = await sb
          .from("deploy_log")
          .select("canvas_url")
          .eq("week_id", weekId)
          .eq("subject", subject)
          .eq("action", "announcement_post")
          .eq("status", "DEPLOYED")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        await sb.from("deploy_log").insert({
          week_id: weekId,
          subject,
          action: "announcement_post",
          status: "SKIPPED",
          canvas_url: lastLog?.canvas_url ?? null,
          message: `Idempotent: announcement already posted at ${existing.posted_at}`,
        });

        return new Response(
          JSON.stringify({
            status: "SKIPPED",
            canvasUrl: lastLog?.canvas_url ?? null,
            message: "Already posted",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    const payload = {
      title,
      message: message || "",
      is_announcement: true,
      published: true,
      ...(delayedPostAt ? { delayed_post_at: delayedPostAt } : {}),
    };

    const res = await fetch(
      `${canvasBase}/api/v1/courses/${courseId}/discussion_topics`,
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
        week_id: weekId || null,
        subject: subject || null,
        action: "announcement_post",
        status: "ERROR",
        message: `POST ${res.status}: ${errText}`,
      });
      return new Response(JSON.stringify({ error: errText, status: "ERROR" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await res.json();
    const canvasUrl = `${canvasBase}/courses/${courseId}/discussion_topics/${result.id}`;

    await sb.from("deploy_log").insert({
      week_id: weekId || null,
      subject: subject || null,
      action: "announcement_post",
      status: "DEPLOYED",
      canvas_url: canvasUrl,
      message: `Posted announcement: ${title}`,
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
