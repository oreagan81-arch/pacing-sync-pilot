/**
 * canvas-fetch-folder-files
 * List files inside a named Canvas folder for a given course.
 * Optionally filter to files matching a lesson number (e.g., "L102", "Lesson 102", "102").
 *
 * Request body:
 *   { courseId: number, folderName: string, lessonNum?: string }
 * Response:
 *   { ok: true, folder: {id,name}, files: [{id, display_name, url, html_url}], match?: {...} }
 */
import { listFolders, listFolderFiles, CANVAS_BASE } from "../_shared/canvas-api.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { courseId, folderName, lessonNum } = await req.json();
    if (!courseId || !folderName) {
      return new Response(
        JSON.stringify({ ok: false, error: "courseId and folderName required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const folders = await listFolders(Number(courseId));
    const wanted = String(folderName).trim().toLowerCase();
    const folder =
      folders.find((f) => (f.name || "").toLowerCase() === wanted) ||
      folders.find((f) => (f.full_name || "").toLowerCase().endsWith(wanted));
    if (!folder) {
      return new Response(
        JSON.stringify({ ok: false, error: `Folder "${folderName}" not found in course ${courseId}` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const files = await listFolderFiles(folder.id);
    const enriched = files.map((f) => ({
      id: f.id,
      display_name: f.display_name,
      filename: f.filename,
      url: f.url,
      html_url: `${CANVAS_BASE}/courses/${courseId}/files/${f.id}`,
      content_type: f.content_type,
      updated_at: f.updated_at,
    }));

    let match: typeof enriched[number] | null = null;
    if (lessonNum) {
      const num = String(lessonNum).match(/\d+/)?.[0] ?? "";
      if (num) {
        const re = new RegExp(`(?:^|[^0-9])${num}(?:[^0-9]|$)`);
        match = enriched.find((f) => re.test(f.display_name || f.filename || "")) ?? null;
      }
    }

    // Upsert into canvas_orphan_files triage table
    try {
      const sb = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      if (enriched.length) {
        await sb.from("canvas_orphan_files").upsert(
          enriched.map((f) => ({
            canvas_file_id: String(f.id),
            course_id: String(courseId),
            original_name: f.display_name || f.filename || null,
            canvas_url: f.url,
            status: "PENDING",
          })),
          { onConflict: "canvas_file_id" },
        );
      }
    } catch (e) {
      console.warn("[canvas-fetch-folder-files] orphan upsert failed:", e);
    }

    return new Response(
      JSON.stringify({ ok: true, folder: { id: folder.id, name: folder.name }, files: enriched, match }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e instanceof Error ? e.message : String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
