// learning-rules-record — records a teacher's manual file-classification correction
// so future Canvas file syncs can bypass the AI when the same filename reappears.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function patternKey(filename: string): string {
  return filename
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/\d+/g, "#")
    .replace(/[\s_\-]+/g, "_");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const original_name = String(body.original_name || "").trim();
    if (!original_name) {
      return new Response(JSON.stringify({ success: false, error: "original_name is required" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const corrected_subject = body.corrected_subject ?? null;
    const corrected_type = body.corrected_type ?? null;
    const corrected_lesson = body.corrected_lesson ?? null;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Upsert by lowercased original_name (matches the unique index on lower(original_name))
    const { data: existing } = await supabase
      .from("learning_rules")
      .select("id, applied_count")
      .ilike("original_name", original_name)
      .maybeSingle();

    if (existing) {
      await supabase
        .from("learning_rules")
        .update({
          corrected_subject,
          corrected_type,
          corrected_lesson,
          name_pattern: patternKey(original_name),
          applied_count: (existing.applied_count ?? 0) + 1,
          last_applied: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("learning_rules").insert({
        original_name,
        name_pattern: patternKey(original_name),
        corrected_subject,
        corrected_type,
        corrected_lesson,
        applied_count: 1,
        last_applied: new Date().toISOString(),
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
