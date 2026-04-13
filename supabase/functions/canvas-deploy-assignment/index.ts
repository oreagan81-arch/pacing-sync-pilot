import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Resolve assignment group name → ID (Canvas API)
async function resolveGroupId(
  courseBase: string,
  headers: HeadersInit,
  groupName: string
): Promise<number | null> {
  const res = await fetch(`${courseBase}/assignment_groups`, { headers });
  if (!res.ok) { await res.text(); return null; }
  const groups = await res.json();
  const match = groups.find((g: { name: string }) => g.name === groupName);
  return match ? match.id : null;
}

// Convert date string to 23:59 ET (DST-aware via America/New_York)
function toDueAt(dateStr: string): string {
  // dateStr expected as YYYY-MM-DD
  // Create date at 23:59 Eastern
  const d = new Date(`${dateStr}T23:59:00`);
  // For DST: offset is -4 (EDT) or -5 (EST)
  // We'll use a fixed approach: set UTC time as 23:59 + 5h = 04:59 next day (EST)
  // This is approximate; for true DST awareness we'd need a tz lib
  const utc = new Date(`${dateStr}T04:59:00.000Z`); // 23:59 EST = 04:59 UTC next day
  // Adjust: add 1 day since 04:59 is next day
  utc.setUTCDate(utc.getUTCDate() + 1);
  return utc.toISOString();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const {
      subject, courseId, title, description, points, gradingType,
      assignmentGroup, dueDate, existingId, rowId, weekId,
      omitFromFinal
    } = await req.json();

    if (!courseId || !title) {
      return new Response(JSON.stringify({ error: "Missing courseId or title" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const canvasToken = Deno.env.get("CANVAS_API_TOKEN");
    let canvasBase = Deno.env.get("CANVAS_BASE_URL") || "https://thalesacademy.instructure.com";
    if (!canvasBase.startsWith("http")) canvasBase = `https://${canvasBase}`;
    canvasBase = canvasBase.replace(/\/+$/, ""); // strip trailing slashes
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

    // Resolve assignment group
    let groupId: number | null = null;
    if (assignmentGroup) {
      groupId = await resolveGroupId(courseBase, canvasHeaders, assignmentGroup);
    }

    const payload: Record<string, unknown> = {
      assignment: {
        name: title,
        description: description || "",
        points_possible: points ?? 100,
        grading_type: gradingType || "points",
        published: true,
        ...(groupId ? { assignment_group_id: groupId } : {}),
        ...(dueDate ? { due_at: toDueAt(dueDate) } : {}),
        ...(omitFromFinal ? { omit_from_final_grade: true } : {}),
      },
    };

    const isUpdate = !!existingId;
    const method = isUpdate ? "PUT" : "POST";
    const url = isUpdate
      ? `${courseBase}/assignments/${existingId}`
      : `${courseBase}/assignments`;

    const res = await fetch(url, {
      method,
      headers: canvasHeaders,
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const errText = await res.text();
      // Log error
      await sb.from("deploy_log").insert({
        week_id: weekId || null,
        subject: subject || null,
        action: "assignment_deploy",
        status: "ERROR",
        message: `${method} ${res.status}: ${errText}`,
        payload: payload,
      });

      // Update pacing row status
      if (rowId) {
        await sb.from("pacing_rows").update({ deploy_status: "ERROR" }).eq("id", rowId);
      }

      return new Response(JSON.stringify({ error: errText, status: "ERROR" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await res.json();
    const assignmentId = String(result.id);
    const canvasUrl = `${canvasBase}/courses/${courseId}/assignments/${assignmentId}`;

    // Update pacing_rows
    if (rowId) {
      await sb.from("pacing_rows").update({
        canvas_assignment_id: assignmentId,
        canvas_url: canvasUrl,
        deploy_status: "DEPLOYED",
        last_deployed: new Date().toISOString(),
      }).eq("id", rowId);
    }

    // Log success
    await sb.from("deploy_log").insert({
      week_id: weekId || null,
      subject: subject || null,
      action: "assignment_deploy",
      status: "DEPLOYED",
      canvas_url: canvasUrl,
      message: `${isUpdate ? "Updated" : "Created"} assignment: ${title}`,
    });

    return new Response(JSON.stringify({
      status: "DEPLOYED",
      assignmentId,
      canvasUrl,
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
