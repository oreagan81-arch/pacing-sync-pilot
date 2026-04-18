// Rename a Canvas file via PUT /api/v1/files/:id
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { fileId } = await req.json();
    if (!fileId) {
      return new Response(JSON.stringify({ error: "Missing fileId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const baseUrl = (Deno.env.get("CANVAS_BASE_URL") || "").replace(/\/$/, "");
    const token = Deno.env.get("CANVAS_API_TOKEN");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    if (!baseUrl || !token) throw new Error("Canvas credentials missing");

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: row, error } = await supabase.from("files").select("*").eq("id", fileId).maybeSingle();
    if (error || !row) throw new Error("File row not found");
    if (!row.drive_file_id) throw new Error("File has no Canvas file id");
    if (!row.friendly_name) throw new Error("No friendly_name to rename to");

    const r = await fetch(`${baseUrl}/api/v1/files/${row.drive_file_id}`, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: row.friendly_name, on_duplicate: "rename" }),
    });

    const respText = await r.text();
    if (!r.ok) {
      await supabase.from("deploy_log").insert({
        action: "canvas-file-rename", status: "error",
        message: `Rename failed: ${r.status}`,
        payload: { fileId, response: respText.slice(0, 500) },
      });
      throw new Error(`Canvas ${r.status}: ${respText.slice(0, 200)}`);
    }

    const now = new Date().toISOString();
    await supabase.from("files").update({
      original_name: row.friendly_name,
      needs_rename: false,
      renamed_at: now,
      updated_at: now,
    }).eq("id", fileId);

    await supabase.from("deploy_log").insert({
      action: "canvas-file-rename", status: "ok",
      message: `Renamed to ${row.friendly_name}`,
      payload: { fileId, canvasFileId: row.drive_file_id },
    });

    return new Response(JSON.stringify({ ok: true, friendly_name: row.friendly_name }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
